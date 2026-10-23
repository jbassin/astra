# Astra Sub-plan 0010 — orator (orator-backend + orator-controller)

**Status:** Plan (pre-implementation). **Phase:** 4 (services). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** lark bot+server **LIFT** (Bun/TS); library SQLite→**Postgres** (F); birdfeed+keys → **orator-controller** (Node, configurable origin); H (Compose **service**); secrets via SOPS.
**Depends-on:** Phase 1 (ontology-being [Discord identity], config/SOPS, observe, Postgres). **Runs parallel to** Phase 3/5.

> Goal: lift faerrin's `lark` (Discord **music** bot + web library + Stream Deck API) into astra's
> **orator-backend**, and merge `birdfeed` + lark's key-management into **orator-controller** (the
> Stream Deck plugin). lark is recently built + working, so the bot/voice/server **lift**; astra-ify
> (Postgres, Compose, config, merge) + **rewrite the web library UI on TanStack/gothic** (L1).

---

## 1. Current state (faerrin)

**`lark`** (Bun single process):
- **Voice engine:** `@discordjs/voice` with pure-JS `opusscript` + `@noble/ciphers`; needs
  **`@snazzah/davey`** (native, optional) for DAVE/E2EE on `@discordjs/voice ≥0.19` (else WS 4017).
- **Library DB** (`bun:sqlite`): `collections`, `tracks`, `tags` (+`color`), `track_tags`, `playlists`,
  `playlist_items`, `download_jobs`, `download_job_items`, `api_keys`.
- **Ingest:** yt-dlp (enumerate + download w/ progress) + ffmpeg; **R128 loudness measured on ingest,
  applied as gain at playback** (ReplayGain-style).
- **REST surface:** `/api/v1/{me, health, collections, tracks(+bulk-move/delete/rename/tag), tags,
  playlists, ingest(upload/youtube/jobs+SSE), playback(play/stop/pause/resume/next/prev/loop),
  voice(join/leave/debug), keys}`. **Auth:** web session (Discord OAuth → signed cookie, user-ID
  allowlist) **or** Bearer **API key** (hashed, bound to a Discord user). Single guild;
  follow-the-operator channel; 60s auto-leave; stop = stay connected + clear queue.
- **Web library SPA** (Vite + React): the operator UI — upload/ingest, bulk rename/tag, collections,
  playback control.

**`birdfeed`** (→ orator-controller): Elgato **Node SDK** plugin; polls `/api/v1/playback/now` @2.5 s;
collection→tag nav; play/pause/resume/stop/next/prev; **fixed origin `https://lark.iridi.cc`**
(`controller.ts:21` — make configurable); Bearer key auth. ⚠ never tested on physical hardware.

## 2. orator-backend (astra, Bun/TS, Compose service) — LIFT

Lift lark's single-process design (bot + voice + HTTP + library) ~wholesale; astra-ify:
- **Postgres** (F): port the `bun:sqlite` schema → PG; the library is low-volume (a clean schema port).
- **Web library UI:** **full TanStack rewrite** (L1) on gothic — consistent with the other frontends
  (strider template).
- **Config/secrets** from ontology-config/SOPS: `DISCORD_TOKEN` (a **separate** Discord app from weal),
  `DISCORD_CLIENT_ID/SECRET`, `SESSION_SECRET`, `LARK_*`→`ORATOR_*` (guild, origin, lufs, concurrency,
  allowlist). Discord **identity** (the bot app, allowlisted operator IDs) ties to ontology-being.
- **Voice engine** lifts unchanged (pure-JS deps); **validate `@snazzah/davey`** (native) in the Compose
  container (L3 / risk).
- **Audio storage:** the library's downloaded audio files — local **Compose volume** vs object store (L2).
- gothic for the web UI styling; OTel via `libs/ts/observe`.

## 3. orator-controller (astra, Node, Stream Deck plugin) — REORG (merge)

- **Node** runtime (the Elgato SDK mandates Node 20/24 — stays **outside** the bun lane, like birdfeed today).
- **Merge** birdfeed + lark's **key-management** (the server side — `api_keys` table + `/keys` routes —
  lives in orator-backend; the plugin mints/uses a key).
- **Configurable origin** (drop the hardcoded `lark.iridi.cc`; read the orator-backend origin from plugin
  settings).
- Contract preserved: Bearer key auth; `/api/v1/playback/now` @2.5 s polling; collection→tag nav.
- ⚠ **hardware test still open** (carried from faerrin) — note in the cutover runbook.

## 4. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| L1 | orator web library UI | TanStack rewrite vs lift Vite/React | **DECIDED: full TanStack rewrite** on gothic — stack consistency with the other frontends (strider template). |
| L2 | Music audio storage | local volume vs object store | **DECIDED: local Compose volume** — simplest for a single-host library; revisit if it outgrows the host. |
| L3 | DAVE/E2EE native dep | bundle `@snazzah/davey` in the container vs accept no-E2EE | **Bundle it** — required for `@discordjs/voice ≥0.19` (else WS 4017); validate the native build in the Compose image. |
| L4 | Service shape | one Compose service (bot+voice+HTTP+UI, like lark) vs split | **One service** — lark's single-process design works; keep it. |

## 5. Work items

1. **Scaffold** `apps/orator-backend` (bun; discord.js/voice; `Bun.serve`; OTel; config/SOPS; ontology)
   + `apps/orator-controller` (Node, Elgato SDK). orator-backend is a Compose service.
2. **Lift the bot + voice + REST**: port lark's process ~wholesale; wire config/secrets from ontology-config.
3. **Postgres** (F): port the library schema SQLite→PG; migrate the (low-volume) library data.
4. **Web library UI** (L1): **rewrite** the SPA on TanStack/React + gothic (strider template); wire to the REST API.
5. **Ingest**: yt-dlp + ffmpeg + R128-on-ingest (lift); audio to the storage volume (L2).
6. **orator-controller**: merge birdfeed + key-mgmt; configurable origin; Bearer auth + now-playing poll.
7. **Secrets**: orator Discord token (separate app), client id/secret, session secret — all via SOPS.

## 6. Exit criteria

- [ ] orator-backend (Compose) joins voice, plays a track, and serves the library REST API; survives a
      container restart; DAVE/E2EE works (or is consciously disabled).
- [ ] Library migrated to Postgres (schema + data); R128-on-ingest + playback gain preserved.
- [ ] The web library UI (TanStack/gothic rewrite) loads + controls playback.
- [ ] orator-controller drives orator-backend (configurable origin, Bearer key, now-playing poll) — wired,
      with the physical-hardware test flagged as the remaining gap.
- [ ] Separate Discord app/token from weal; secrets via SOPS; operator allowlist from config/ontology.

## 7. Risks

1. **DAVE/E2EE native dep** (L3) — `@snazzah/davey` must build in the Compose image, or `@discordjs/voice`
   ≥0.19 closes the WS (4017). Validate in the container early.
2. **Voice as a long-running Compose service** — needs reconnect/backoff, the voice-state intents, and
   ffmpeg/yt-dlp on PATH in the image; shake out restarts + channel-follow on Phase 4.
3. **Hardware-test gap** — orator-controller (birdfeed lineage) has never run on a physical Stream Deck;
   carry the gap explicitly; the `.streamDeckPlugin` packaging is the only thing proven.
4. **Audio storage growth** (L2) — a music library on a host volume grows; size the volume + a cleanup story.
5. **Two Discord bots in one guild** — orator + weal are separate apps/tokens with different intents
   (orator: GuildVoiceStates/Connect/Speak; weal: MessageContent/webhooks); keep tokens distinct (SOPS).

## 8. Hand-off

orator-backend is a self-contained Compose service (bot + library + REST). orator-controller (Node) is the
Stream Deck plugin against its REST API. Discord identity/allowlist ties to ontology-being; secrets via SOPS.
No cross-pipeline dependency — orator can be built independently of Phase 3/5.
