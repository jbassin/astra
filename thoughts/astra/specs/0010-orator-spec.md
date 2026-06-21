# NLSpec 0010 — orator (orator-backend + orator-controller)

**Status:** **IN PROGRESS** (`octo:embrace`) — **slices 1–6 of 9 built, CI-green both toolchains + pushed**
(`98b5618`…`6474eb2`): scaffold, Postgres store, bot+voice+REST, auth, ingest, data-migrator. **Remaining:
7 operator UI (Router SPA), 8 orator-controller, 9 deploy + run-the-migrator.** Decisions M1–M5 locked below.
**Phase:** 4 (services). **Source plan:** [`../plans/0010-orator.md`](../plans/0010-orator.md). **Pre-impl thoughts:**
[`../../shared/research/2026-06-20-orator-0010-thoughts.md`](../../shared/research/2026-06-20-orator-0010-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (typescript-pro, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** Phase 1 (`@astra/config`+SOPS [`orator`/`orator-controller` blocks already wired],
`@astra/ontology` `player` [`snowflakes`+`is_admin`], `@astra/observe` [`initTelemetry` + `@astra/observe/web`],
Postgres). **Runs parallel to** Phase 3/5 (no cross-pipeline dependency).

## Goal

Lift faerrin's `lark` (a single-process **Bun** Discord **music** bot — `@discordjs/voice` engine + a SQLite
library + a REST API + an operator SPA, recently built and working) into astra **orator-backend** (a Bun
**Compose service**), and merge faerrin's `birdfeed` (the Elgato Stream Deck plugin) + lark's key-management
into **orator-controller** (Node, Elgato SDK). Unlike weal (a Rust→TS *rewrite* gated by a parity harness),
orator is a **same-language lift** (Bun→Bun, Node→Node): the risk is not algorithmic equivalence but the
astra-ification seams — Postgres (F), Compose (H), config/SOPS, OTel, the operator-UI rewrite (L1), and the
native voice/E2EE dependency inside a container (L3). orator-backend establishes the bun-service-**with-HTTP**
conventions (weal-bot was gateway-only; orator adds `Bun.serve` + voice + ingest + a served SPA).

## Decisions in force

| # | Decision | Choice |
|---|---|---|
| F (roadmap) | Storage | **SQLite → Postgres**; port lark's 9-table schema; **schema + live data both in 0010** (M2). |
| H/I (roadmap) | Runtime | **Docker Compose service** (`restart: unless-stopped` + healthcheck) behind **Caddy**. |
| L1 (plan) | Operator UI | **Full TanStack/gothic rewrite** of the SPA — **served by orator-backend itself**, one process (M3). |
| L2 (plan) | Audio storage | **Local Compose volume** (single-host library; revisit if it outgrows the host). |
| L3 (plan) | DAVE/E2EE | **Bundle `@snazzah/davey`** (native) in the image — required for `@discordjs/voice ≥0.19` (else WS 4017). |
| L4 (plan) | Service shape | **One Compose service** (bot + voice + HTTP + UI) — lark's single-process design works; keep it. |

### M1 — **DECIDED: operator allowlist derived from ontology-being**

`@astra/ontology` `Player` exposes `snowflakes: string[]` + `is_admin: boolean`. The operator allowlist is
**derived from ontology-being** (the union of every `is_admin` player's `snowflakes`), not a flat config
string — per principle #2 (config single-source). `orator.allowedUserIds` (currently `""` in `config.kdl`) is
kept only as an **optional additive override** for non-player operators. A small ontology accessor
(`adminSnowflakes(being)` or equivalent) feeds both the OAuth login gate and the API-key user binding.

### M2 — **DECIDED: schema + live data migration both in 0010** (diverges from weal's P6 deferral)

0010 ports the schema **and** migrates the live library: a one-shot migrator copies `lark.sqlite` rows →
orator-postgres and the ~88 audio files → the Compose volume, with a row-count + playback-gain verification.
orator is populated immediately, not at cutover. (The live Discord *run* still defers — see Scope (out).)

### M3 — **DECIDED: one process — orator-backend serves a TanStack *Router* SPA** (sanctioned divergence from the SSR template)

orator-backend serves the built TanStack/gothic operator SPA itself (one container, one origin
`orator.iridi.cc`), client-rendered. Rationale: lark's auth is Discord OAuth2 **only at login** (`oauth.ts`,
`identify` scope) → a **stateless signed cookie** (`sessions.ts`, HMAC-SHA256 `uid.exp.sig`); the OAuth dance
is browser↔Discord, so a service split would be a cookie-domain question, not an auth-threading one. With that
non-issue removed, a single process — closest to a faithful lift, session cookie never leaving the process —
wins for an **authenticated operator console** (vs. the public content frontends akasha/mouthpiece/vellum that
follow the SSR strider template). The UI still consumes `@astra/gothic` + `@astra/observe/web` RUM for visual
+ telemetry consistency. **This is a conscious, spec-sanctioned divergence from principle #4's SSR template** —
not a silent scope cut.

**The build flavor is `@tanstack/react-router` (client SPA) → static Vite `dist/`, served by orator-backend's
`serveStatic` — NOT `@tanstack/react-start` (SSR), i.e. NOT the strider template.** This is forced, not a
preference: orator-backend **must** keep a hand-rolled `Bun.serve` REST surface (`/api/v1/*` + Bearer-key auth)
because the **Stream Deck controller is an external Node client** hitting that REST API — and the pinned
react-start (1.168) has **no file server routes** (only `createServerFn`, RPC-style, per [[tanstack-start-skill]]),
so it cannot host that surface. The HTTP entrypoint therefore stays `Bun.serve` regardless; adding Start would
mean embedding a *second* SSR server with no payoff for a console that needs no SSR/SEO. Serving a client-only
Router SPA as static `dist/` is the exact pattern lark already uses (`serveStatic(config.distDir)`) — the lift
stays a lift. (The Start-as-a-separate-`orator-frontend`-service alternative was considered and declined in
favour of one process.)

### M4 — **DECIDED: orator-controller joins the bun workspace** (typecheck/test in the bun lane; rollup builds)

`orator-controller` (Node/Elgato, `@elgato/streamdeck`) is added to the root `package.json` bun workspace, so
`bun --filter '*' {typecheck,test}` covers it (as faerrin's `pkg/*` covered birdfeed). `rollup` produces the
`.streamDeckPlugin` artifact (`bundle`/`package` scripts) — **not** a CI-gated step. The `apps/orator-controller`
dir is added to `pyproject.toml`'s uv `exclude` like every `apps/*` TS dir. It is a **Node** runtime, never run
by Bun, and is **not** a Compose service (it's a desktop plugin).

### M5 — **DECIDED: bake the native toolchain into the orator-backend image**

The orator-backend Docker image installs **ffmpeg + yt-dlp on PATH** and builds **`@snazzah/davey`** (the
native DAVE/E2EE module). Voice gains reconnect/backoff and the `GuildVoiceStates` intent. The native davey
build is validated in the container **early** (slice 1/2) — L3 is the #1 risk.

## Scope (in)

1. **Scaffold** `apps/orator-backend` (Bun; `@astra/{config,observe,ontology}`; `Bun.serve`; telemetry-first
   entrypoint — `initTelemetry("astra.orator-backend")` before any emit, per [[telemetry-built-in]]) and
   `apps/orator-controller` (Node/Elgato, bun-workspace member per M4). Add both to uv `exclude`.
2. **Postgres schema port** (F): lark's `MIGRATIONS` (9 tables — `collections`, `tracks`, `tags`(+`color`),
   `track_tags`, `playlists`, `playlist_items`, `download_jobs`, `download_job_items`, `api_keys`) ported
   SQLite→PG (`AUTOINCREMENT`→identity, `datetime('now')`→`now()`/`timestamptz`, INTEGER bool→`boolean`, CHECK
   constraints verbatim); a repo layer; a dedicated **`orator-postgres`** Compose unit (mirror `weal-postgres`).
3. **Lift bot + voice + REST** ~wholesale from `pkg/lark` (Bun→Bun): the in-process `@discordjs/voice` adapter
   (`discord-voice.ts`), the playback engine (queue/loop/gain/auto-leave, single-session, 60 s auto-leave,
   follow-the-operator channel), and the `/api/v1/*` surface (`me`, `health`, `collections`, `tracks` +bulk
   move/delete/rename/tag, `tags`, `playlists`, `ingest` upload/youtube/jobs+SSE, `playback`
   now/play/stop/pause/resume/next/prev/loop, `voice` join/leave/debug, `keys`). Config from `@astra/config`
   (`cfg.orator.*`); secrets via a `resolveSecret` wrapper (unresolved `ref` → feature disabled, like weal).
   The bot stays **optional**: no resolved `discordToken` ⇒ playback routes return **503**, web+library still run.
4. **Auth** (lift, verified in `app.ts`): Discord OAuth2 `identify` login → stateless signed session cookie
   (`secureCookies` when the origin is https) **OR** Bearer API key (hashed, bound to a Discord user, resolved
   to a synthetic 60 s session); same `uid` either way; key-mgmt routes require a **session** (not a key). The
   login gate + key binding use the **ontology-derived allowlist** (M1, fed into `config.allowlist: Set<string>`).
   **Preserve verbatim** (don't reinvent): the **stateless HMAC OAuth `state`** (a 10-min signed token, no
   cookie round-trip — sidesteps the whole SameSite/lost-cookie `invalid_oauth_state` class); the **"Add to
   Server" callback branch** (a `guild_id`/`permissions` redirect → a friendly HTML page, not a 400); and
   `Bun.serve({ idleTimeout: 60 })` (raised from the 10 s default so a multi-second voice-join isn't cut off
   mid-`/playback/play`). **Rebrands:** cookie `lark_session`→`orator_session`; `extractApiKey` header
   `x-lark-key`→`x-orator-key` (birdfeed sends `Bearer`, so safe); raw-key prefix `lark_`→`orator_` (cosmetic —
   the stored credential is a SHA-256 of the raw, so migrated keys keep working).
5. **Ingest** (lift): yt-dlp enumerate+download with SSE progress + ffmpeg; **R128 loudness measured on ingest,
   applied as playback gain** (target −16 LUFS default); `ingestConcurrency` (2) + `measureLoudness` (on) knobs;
   crash-safe `resumeInterrupted()`. Audio written to the **Compose volume** (L2).
6. **Live data migration (M2)**: a one-shot migrator (`lark.sqlite` rows → orator-postgres; ~88 audio files →
   the volume) with a row-count + `loudness_lufs`/gain verification.
7. **Operator UI** (L1, M3): a **`@tanstack/react-router` (client SPA)** + gothic **rewrite** of lark's SPA
   (replacing the React+Vite SPA), built by Vite to a static `dist/` and **served by orator-backend's
   `serveStatic`** (one process), wired to `/api/v1/*`, with `@astra/observe/web` RUM. **Not** TanStack Start /
   SSR (see M3). Feature parity: upload/ingest, bulk rename/tag, collections, playback control, tag-color,
   API-key management (`Keys.tsx` — this is where keys are minted, session-gated; see item 8).
8. **orator-controller** (REORG): lift birdfeed; **make the origin configurable** (add an `oratorOrigin` to
   `BirdfeedGlobalSettings` + the property inspector, read in `applySettings`; drop the hardcoded
   `LARK_ORIGIN`); preserve the contract (Bearer key, `/api/v1/playback/now` @ 2500 ms poll, collection→tag
   nav, 5 named tags + `other`). **Key-management clarification (corrected from the plan's wording):** minting/
   revoking keys is **session-gated and stays in orator-backend + the web UI** (`/api/v1/keys` `requireSession`
   → 403 for key auth; `Keys.tsx`). The Stream Deck plugin has **no web session, so it cannot mint a key** — it
   only **consumes** a key the operator mints in the UI and pastes into plugin settings. So the "merge" is: keep
   minting server-side, point the plugin at the configurable orator origin, and consume a pasted key — **no
   separate key system in the controller.**
9. **Deploy**: an orator-backend Dockerfile (ffmpeg + yt-dlp + davey native — M5), the Compose unit(s)
   (`orator-backend` on **`10363`** + `orator-postgres` on **`10364`**, healthcheck, `restart: unless-stopped`),
   a Caddy block reverse-proxying `orator.iridi.cc` → `localhost:10363`; applied via `just up` + `caddy-reload`
   ([[deploy-apply-with-just]]). (Needs an `orator.iridi.cc` DNS record — manual, like strider/weal-overlay.)
10. **Telemetry** wired from day one (principle #1): `initTelemetry` in the entrypoint; spans on voice/ingest/
    playback; the UI's browser RUM via `@astra/observe/web`.

## Scope (out)

- **Live Discord run** — needs the real `orator_discord_key` provisioned in SOPS (the placeholder key exists).
  Like weal's acceptance I; orator-backend runs web+library without it (playback 503). **Deferred.**
- **Physical Stream Deck hardware test** — birdfeed lineage has never run on real hardware; only the
  `.streamDeckPlugin` packaging is proven. Carry the gap into the cutover runbook. **Deferred.**
- **Object-store audio** (L2 alternative) — local volume now; revisit only if the library outgrows the host.
- **Multi-guild / multi-session playback** — single guild, single playback session (lark's design); unchanged.
- **Webhook/send-identity work** — that's weal's concern; orator is voice-only.

## Locked technical decisions

| # | Decision | Choice |
|---|----------|--------|
| Service | Shape | One Bun Compose service: bot(optional) + voice + `Bun.serve` HTTP + served SPA (L4). |
| Port | orator-backend | **`10363`** (astra range; published behind Caddy at `orator.iridi.cc`). Free after 10360 strider / 10361 weal-overlay / 10362 weal-pg. |
| Port | orator-postgres | **`10364`** (astra range), mirroring `weal-postgres` at 10362. |
| Secrets | Source | `ref="sops:orator_*"` already in `config.kdl` + `secrets.enc.yaml`; `resolveSecret` → disabled-on-unresolved. |
| Bot identity | Discord app | **Separate app/token from weal** (`orator_discord_key` ≠ `weal_discord_key`); intents `GuildVoiceStates`/Connect/Speak. |
| Allowlist | Operators | Ontology-derived (`is_admin` snowflakes) ∪ `orator.allowedUserIds` optional override → `config.allowlist: Set<string>` (M1). |
| DB | Postgres | Dedicated `orator-postgres` unit; 9-table schema port; **live data migrated in 0010** (M2). |
| Voice | Engine | In-process `@discordjs/voice` + `@snazzah/davey` native (L3/M5); ffmpeg pre-encode (opusscript out of the hot path). |
| UI | Delivery | **`@tanstack/react-router` client SPA** → static `dist/` served by `serveStatic` (M3) — **not** `react-start`/SSR, not the strider template. |
| Auth | Lift | OAuth2 `identify` → stateless signed cookie **or** Bearer key; HMAC `state` CSRF; "Add to Server" branch; `idleTimeout:60`; `lark_`→`orator_` rebrands. |
| Controller | Runtime | Node/Elgato in the bun workspace (typecheck/test); rollup builds the plugin (M4); not a Compose service. Consumes a key (cannot mint). |

## Acceptance criteria (exit gate)

- [ ] **Both toolchains green locally** before pushing: bun lane (`bun --filter '*' typecheck && bunx biome ci . &&
      bun --filter '*' test && bun --filter '*' build`) covers orator-backend + orator-controller; uv lane
      unaffected (both dirs in uv `exclude`). Per [[no-ci-monitoring]]: reproduce locally, confirm push + one check.
- [ ] **orator-backend (Compose)** starts telemetry-first, serves `/api/v1/*` + the operator SPA, survives a
      container restart (healthcheck green), and **without a resolved token** runs web+library with playback → 503.
- [ ] **Postgres**: the 9-table schema applies on PG; the repo layer's tests pass; the **live library data is
      migrated** (row counts match; `loudness_lufs`/gain preserved) and the ~88 audio files are on the volume.
- [ ] **Voice** (validated as far as no-live-token allows): the davey native module **builds in the image**
      (no 4017 by construction); the voice adapter + playback engine unit tests pass (queue/loop/gain/auto-leave).
- [ ] **Ingest**: yt-dlp + ffmpeg + R128-on-ingest + resume logic port; loudness→gain math preserved (gain tests pass).
- [ ] **Operator UI**: the `@tanstack/react-router` SPA (static `dist/` via `serveStatic`, **not** SSR) loads
      from orator-backend, lists collections/tracks, drives playback, manages tags (color) + mints/revokes API
      keys (session-gated); gothic styling live (Tailwind v4 `@theme` wired); RUM emits.
- [ ] **orator-controller**: builds the `.streamDeckPlugin`; origin **configurable**; Bearer-key client +
      now-playing poll + nav logic tests pass; **hardware test flagged** as the remaining gap (runbook note).
- [ ] **Identity/secrets**: a separate Discord app/token from weal; all secrets via SOPS; operator allowlist
      from the ontology (M1).
- [ ] **Deploy applied**: `just up` + `just caddy-reload`, `orator.iridi.cc` serves the UI + API via the edge.
- [ ] Memory updated (`thoughts/shared/memory/`) with orator's load-bearing gotchas; RESUME "Current state" bumped.

## Risks

1. **DAVE/E2EE native dep (L3)** — *verified real* in `discord-voice.ts`: `@snazzah/davey` must build in the
   image or `@discordjs/voice ≥0.19` closes the WS 4017. **Mitigation:** validate the native build in the
   container in the earliest deploy slice; opusscript stays a dep but ffmpeg pre-encodes out of the hot path.
2. **Voice as a long-running Compose service** — needs reconnect/backoff, the `GuildVoiceStates` intent, and
   ffmpeg/yt-dlp on PATH (lark ran under systemd). **Mitigation:** bake the toolchain (M5); shake out restarts +
   channel-follow once a live token exists (the live run is deferred regardless).
3. **Hardware-test gap** — orator-controller never ran on a physical Stream Deck. **Mitigation:** carry the gap
   explicitly into the cutover runbook; only the packaging is claimed proven.
4. **Audio storage growth (L2)** — a host-volume music library grows. **Mitigation:** size the volume + a
   cleanup story; object-store is the documented escape hatch.
5. **Two Discord bots, one guild** — *structurally handled*: orator/weal are distinct SOPS tokens with distinct
   intents. **Mitigation:** keep the tokens distinct; never share an app.
6. **Live-data migration correctness (M2)** — copying real rows + 88 audio files risks path/format drift.
   **Mitigation:** the migrator verifies row counts + that `file_path`s resolve on the volume + gain survives;
   it is idempotent (re-runnable) and dedups finished items.

## Hand-off

orator-backend is a self-contained Bun Compose service (bot + voice + library + REST + served SPA) behind
Caddy at `orator.iridi.cc`; secrets via SOPS; the operator allowlist ties to ontology-being (`is_admin`
snowflakes). orator-controller (Node/Elgato) is the Stream Deck plugin against orator-backend's REST, in the
bun workspace for typecheck/test, built by rollup. No cross-pipeline dependency — orator builds independently
of Phase 3/5. Deferred to cutover: the live Discord run (SOPS token) and the physical-hardware controller test.
