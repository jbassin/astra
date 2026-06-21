# 0010 orator — pre-implementation thoughts

**Date:** 2026-06-20. **Author:** Claude. **Status:** analysis (verified against both repos + the live
config/ontology/SOPS substrate) → awaiting NLSpec (`octo:spec`) before `octo:embrace`.
**Plan:** [`thoughts/astra/plans/0010-orator.md`](../../astra/plans/0010-orator.md). **Depends-on:** Phase 1
(ontology-being [Discord identity], `@astra/config`+SOPS, `@astra/observe`, Postgres). **Phase:** 4
(services). **Decisions in force:** lark bot+server **LIFT** (Bun/TS); library SQLite→**Postgres** (F);
birdfeed+keys → **orator-controller** (Node); H/I (Compose **service**); L1–L4 (plan §4); secrets via SOPS.

## What 0010 is

Lift faerrin's `lark` (a single-process Bun Discord **music** bot — voice engine + library DB + REST API +
operator SPA, recently built and working) into astra's **orator-backend** (Bun Compose service), and merge
`birdfeed` (the Stream Deck plugin) + lark's key-management into **orator-controller** (Node, Elgato SDK).
Unlike weal (a Rust→TS *rewrite* with a parity gate), orator is a **same-language lift** (Bun→Bun,
Node→Node): the risk is not algorithmic equivalence but the astra-ification seams — Postgres, Compose,
config/SOPS, OTel, the operator UI rewrite, and the native voice/E2EE dependency in a container. orator is
independent of the Phase 3/5 pipeline (no cross-pipeline dep).

## Verified against the repos (headline: the config + secrets seam is already fully staged)

Phase 1/2 pre-wired orator's config and secret plumbing — further along than weal was at its scope:

- **`ontology-config` already has `orator` *and* `orator-controller`** (`config.kdl:87` / `:101`), and
  `@astra/config` (`libs/ts/config/src/config.ts:92`) already parses both with a strict Zod schema:
  `cfg.orator.{guildId, spikeChannelId, port(8788), publicOrigin(http://localhost:8788), allowedUserIds,
  targetLufs(-16), ingestConcurrency(2), measureLoudness(true), discordToken(secret), discordClientId(secret),
  discordClientSecret(secret), sessionSecret(secret)}` and `cfg.oratorController.{apiKey(secret)}`. This is a
  **1:1 map of lark's env** (`appconfig.ts` + `.env.example`): `LARK_*`→`orator.*`. The lift reads config from
  `@astra/config`, not `process.env`.
- **SOPS already carries the orator secret keys** (`deploy/sops/secrets.enc.yaml`):
  `orator_discord_key`, `orator_discord_client_id`, `orator_discord_client_secret`, `orator_session_secret`,
  `orator_controller_api_key` — all `ref="sops:…"` in the KDL. So no new secret wiring is needed; the keys
  exist as placeholders to be filled (the live Discord-app token is the deferral, mirroring weal).
- **A separate Discord app from weal** is already the design: `weal_discord_key` vs `orator_discord_key` are
  distinct SOPS entries with different intents (weal: MessageContent/webhooks; orator:
  GuildVoiceStates/Connect/Speak). Risk #5 (two bots, one guild) is structurally handled by distinct tokens.
- **weal-bot is the proven bun-service precedent** (`apps/weal-bot/`): telemetry-first entrypoint
  (`initTelemetry("astra.weal-bot")` before any emit), `loadConfig()`+`loadBeing()`, a `resolveSecret()`
  wrapper (unresolved `ref` → feature disabled, not crash), `discord.js ^14`, a dedicated `weal-postgres`
  Compose unit + `weal-bot` unit (no published port, healthcheck on `127.0.0.1`, `restart: unless-stopped`),
  and a Dockerfile. orator-backend mirrors all of this and **adds**: `Bun.serve` HTTP, the voice engine,
  yt-dlp/ffmpeg ingest, and a frontend.
- **`@astra/ontology` exposes the operator-identity fields** (`libs/ts/ontology/src/models.ts`): `Player`
  carries `player_id` (load-bearing FK), `snowflakes: string[]`, and `is_admin: boolean`. So the operator
  allowlist can be **derived from the ontology** (is-admin players' snowflakes) rather than a flat config
  string — see M1.
- **`@astra/observe`** provides `initTelemetry(serviceName)` (Bun OTLP→SigNoz) for the backend runtime and
  `initRum(...)` / `@astra/observe/web` for the operator UI's browser RUM (the strider/weal RUM seam).

## lark — the service, verified (`pkg/lark`)

Single Bun process; `server.ts` wires it end-to-end: `loadConfig` → `mkdirSync(dataDir)` →
`openDb(dbPath)` (runs `MIGRATIONS`) → `JobHub` → `IngestService({concurrency, prober?})` →
`ingest.resumeInterrupted()` (crash-safe playlist resume) → **optional** `startBot({token, guildId})`
(no token ⇒ playback disabled, web+library still run, playback routes 503) → `startServer(config, db, {services})`.

- **Deps** (`package.json`): `@discordjs/voice ^0.19.2`, `discord.js ^14`, `opusscript`, `@noble/ciphers`,
  `prism-media`; **`@snazzah/davey ^0.1.11` is an `optionalDependency`** (the native DAVE/E2EE module);
  `react 19` + `vite 8` for the SPA (these get **dropped** for the TanStack rewrite, L1).
- **Schema** (`src/db/schema.ts`) — an append-only `MIGRATIONS[]` of `bun:sqlite` SQL. 9 tables:
  `collections`, `tracks`, `tags` (+ a v2 `color` column), `track_tags`, `playlists`, `playlist_items`,
  `download_jobs`, `download_job_items`, `api_keys`. Low-volume. SQLite→PG (F) is a mechanical port:
  `INTEGER PRIMARY KEY AUTOINCREMENT`→`GENERATED … AS IDENTITY`/`SERIAL`, `datetime('now')`→`now()` +
  `timestamptz`, `INTEGER` booleans (`shuffle`)→`boolean`, `CHECK (… IN …)` constraints carry over verbatim.
- **Auth** (`src/server/router.ts` `ApiCtx`): every request resolves to a `session` with the **same `uid`**
  whether authed by **web session** (Discord OAuth → signed cookie, allowlist gate) or **Bearer API key**
  (hashed, bound to a Discord user). `authMethod: "session" | "apikey"` distinguishes them; **key-management
  routes require `"session"`** (you can't mint keys with a key). `secureCookies` = `publicOrigin` is https.
- **REST surface** (`src/server/routes/{library,playback,ingest,keys}.ts`): `/api/v1/` `{me, health,
  collections, tracks(+bulk move/delete/rename/tag), tags, playlists, ingest(upload/youtube/jobs+SSE),
  playback(now/play/stop/pause/resume/next/prev/loop), voice(join/leave/debug), keys}`. Single guild;
  follow-the-operator channel; 60 s auto-leave; stop = stay connected + clear queue. **16 test files.**
- **Voice/DAVE** (`src/bot/discord-voice.ts`, verified): in-process `@discordjs/voice`; the file's own header
  confirms **"Bun handles voice fine once Discord's DAVE/E2EE requirement is met (`@discordjs/voice ≥0.19` +
  `@snazzah/davey`); the earlier 'Bun can't do voice' was a 4017 DAVE close on 0.18."** opusscript stays a dep
  but is **pre-encoded out of the realtime hot path** (ffmpeg via prism-media → Raw Opus resource). So **L3 is
  a real, verified risk**: `@snazzah/davey` is a native module that must build in the Compose image or the WS
  closes 4017.
- **Ingest** (`server.ts` + `src/media/{ytdlp,probe}.ts`): yt-dlp enumerate+download with progress + ffmpeg;
  **R128 loudness measured on ingest, applied as playback gain** (ReplayGain-style; `targetLufs` default −16).
  `ingestConcurrency` (default 2) and `measureLoudness` (default on) are tunable — both OOM-pressure knobs.
- **Deploy today** = `deploy/lark.service` (systemd). astra replaces this with a Compose unit (H).

## birdfeed → orator-controller, verified (`pkg/birdfeed`)

- **Node/Elgato, not bun-runtime**: `@elgato/streamdeck ^2.1.0`, rollup bundle, `@tsconfig/node20`. But in
  faerrin it **lived in the bun workspace** (`pkg/*`) — `bun --filter '*' typecheck/test` covered it; rollup is
  only the *build*. So orator-controller can join astra's bun workspace for typecheck/test the same way (M4).
- **Fixed origin** (`src/controller.ts`, the `LARK_ORIGIN` const ≈ line 30; plan says `:21`, approximate):
  `https://lark.iridi.cc` is hardcoded — *"fixed; only the API key is configurable"*. Only `larkKey`
  (global settings) is user-set. **Making the origin configurable** = add it to `BirdfeedGlobalSettings`
  (`src/settings.ts`) + the property inspector, and read it in `applySettings()`.
- **Contract**: polls `/api/v1/playback/now` @ **2500 ms** (`POLL_MS`), collection→tag nav (5 named tags +
  `"other"` catch-all), play/pause/resume/stop/track-toggle; Bearer key auth (`LarkClient`). **5 test files**
  (pure logic: color/grid/nav/svg/lark-client). **Never run on physical hardware** — `.streamDeckPlugin`
  packaging is the only proven part. Carry the gap into the cutover runbook (plan §6 exit + risk #3).

## Open decisions (resolve before/at spec — these refine plan §4's L1–L4)

| # | Question | Finding | Recommendation |
|---|---|---|---|
| **M1** | Operator allowlist source | `@astra/ontology` `Player` exposes `snowflakes[]` + `is_admin`; `config.kdl orator.allowedUserIds` is currently `""`. lark used a flat `LARK_ALLOWED_USER_IDS`. | **Derive the allowlist from ontology-being** (is-admin players' snowflakes) per principle #2 (config single-source) — keep `orator.allowedUserIds` only as an optional override. Needs a small ontology accessor. **Surface for sign-off.** |
| **M2** | Library **data** migration timing | lark has `data/lark.sqlite` + ~88 audio files. weal deferred its live SQLite→PG data move to Phase 6. Plan §5 item 3 says "migrate the (low-volume) library data" inside 0010. | **DECIDED (user, 2026-06-20): schema + live data in 0010.** Port the schema AND migrate the live library rows + copy the ~88 audio files into the Compose volume now — a populated orator immediately, not at cutover. Diverges from weal's P6 deferral. |
| **M3** | Operator UI shape | L1 decided "full TanStack rewrite on gothic (strider template)". The strider template = a **separate SSR Compose service behind Caddy** (Decision I). lark served its SPA from its *own* process. NB: lark's auth is Discord OAuth2 **only at login** (`oauth.ts`, `identify` scope) → a **stateless signed cookie** (`sessions.ts`, HMAC); the OAuth dance is browser↔Discord, so a service split would be a cookie-domain question, not an "OAuth-threading" one (an earlier framing of this row overstated that). | **DECIDED (user, 2026-06-20): one process (option a).** orator-backend serves the built TanStack/gothic SPA itself — one container, one origin (`orator.iridi.cc`), session cookie stays in-process; closest to a faithful lift. The UI imports `@astra/observe/web` RUM + gothic for visual/telemetry consistency, but is **not** the SSR strider template (a conscious, sanctioned divergence for an authenticated operator console vs. the public content frontends). |
| **M4** | orator-controller in CI | birdfeed was in faerrin's bun workspace (typecheck/test via `bun --filter`), built by rollup. astra's bun lane globs `apps/*`. | **Add `apps/orator-controller` to the bun workspace** (typecheck + test run in the bun lane; rollup `bundle`/`package` is the artifact step, not CI-gated). Add it to `pyproject.toml`'s uv `exclude` like every `apps/*` TS dir. **Low-risk; confirm.** |
| **M5** | Voice as a long-running Compose service | lark ran under systemd; astra = Compose. Image needs `ffmpeg` + `yt-dlp` on PATH **and** the `@snazzah/davey` native build. | **Bake ffmpeg + yt-dlp + the davey native toolchain into the orator-backend Docker image** (L3); add voice reconnect/backoff + GuildVoiceStates intent; shake out container restarts + channel-follow early. |

## Decisions surfaced + resolved with the user (2026-06-20)

Both forks were surfaced rather than silently picked ([[no-silent-scope-cuts]]) and resolved before speccing:

- **M3 — operator UI: one process (option a).** orator-backend serves the built TanStack/gothic SPA itself.
  Rationale: lark's auth is OAuth *only at login* → a stateless signed cookie, so the much-cited "OAuth across
  two services" cost of a service split doesn't actually exist (it's a cookie-domain question). With that gone,
  the trade-off reduces to one-process-vs-two and SPA-vs-SSR, and for an authenticated operator console (not a
  public content site) a single process closest to the faithful lift won. Sanctioned divergence from the SSR
  strider template that akasha/mouthpiece/vellum follow; the UI still consumes gothic + `@astra/observe/web`.
- **M2 — data migration: schema + live data in 0010.** Migrate the live `lark.sqlite` rows and copy the ~88
  audio files into the Compose volume as part of 0010 (a populated orator now), diverging from weal's P6
  deferral. The live Discord *run* still defers on the SOPS token (below).

## Suggested slicing (for the NLSpec — mirrors weal's CI-green-slice cadence)

1. **Scaffold `apps/orator-backend`** (bun; `@astra/{config,observe,ontology}`; `Bun.serve`; telemetry-first
   entrypoint per [[telemetry-built-in]]) + **`apps/orator-controller`** (Node/Elgato, bun-workspace member);
   uv `exclude` both.
2. **Postgres schema port** (F): `MIGRATIONS` SQLite→PG (the 9 tables); repo layer + a dedicated
   `orator-postgres` Compose unit (mirror `weal-postgres`).
3. **Lift bot + voice + REST** ~wholesale; config from `@astra/config`; secrets via `resolveSecret`; operator
   allowlist from ontology (M1). Bot stays optional (503 when token unresolved — the deferral seam).
4. **Ingest**: yt-dlp + ffmpeg + R128-on-ingest lift; audio to the Compose volume (L2).
5. **Data migration (M2 — in 0010)**: a one-shot migrator copying the live `lark.sqlite` rows → orator-postgres
   + the ~88 audio files → the Compose volume; verify row counts + playback gain survive.
6. **Operator UI** (L1, M3 = one process): TanStack/gothic rewrite of the SPA, **served by orator-backend
   itself** (one origin), wired to the REST API + `@astra/observe/web` RUM.
7. **orator-controller**: merge birdfeed + key-mgmt; **configurable origin**; Bearer auth + now-playing poll.
8. **Deploy**: Dockerfile (ffmpeg + yt-dlp + davey native), Compose unit(s), Caddy block; `just up` +
   `caddy-reload` ([[deploy-apply-with-just]]).

## Exit criteria (from plan §6 — unchanged, sharpened)

- orator-backend (Compose) joins voice, plays a track, serves the library REST API, survives a restart; DAVE
  works (or is consciously disabled). Library schema on Postgres; R128-on-ingest + playback gain preserved.
  Operator UI loads + controls playback. orator-controller drives it (configurable origin, Bearer key, poll) —
  hardware test flagged as the remaining gap. Separate Discord app/token from weal; secrets via SOPS; operator
  allowlist from ontology/config.

## Deferred (spec to sanction explicitly, mirroring weal)

- **Live Discord run** (needs the real `orator_discord_key` provisioned in SOPS — like weal's acceptance I).
- **Physical Stream Deck hardware test** (birdfeed lineage — never proven; cutover runbook note).

*(Note: the library **data** migration is **not** deferred — per M2 it lands in 0010, unlike weal.)*

## Risks (from plan §7, verified/sharpened)

1. **DAVE/E2EE native dep (L3)** — *verified real* in `discord-voice.ts`: `@snazzah/davey` must build in the
   image or `@discordjs/voice ≥0.19` closes the WS 4017. Validate the native build in the container early.
2. **Voice as a long-running service (M5)** — reconnect/backoff, GuildVoiceStates intent, ffmpeg+yt-dlp on PATH.
3. **Hardware-test gap** — orator-controller never ran on a physical Stream Deck; carry the gap explicitly.
4. **Audio storage growth (L2)** — host-volume music library grows; size the volume + a cleanup story.
5. **Two Discord bots, one guild** — *structurally handled*: orator/weal are distinct SOPS tokens with
   different intents. Keep them distinct.
