---
name: akasha-session-audio-dependency
description: akasha session/transcript audio is now served same-origin by astra (akasha.iridi.cc/audio/<date>.mp3); faerrin's static-audio.iridi.cc dropped + the WHOLE faerrin caddyfile import removed — DONE + LIVE 2026-06-24
metadata:
  type: project
---

**DONE + LIVE 2026-06-24.** akasha's transcript player now gets its audio **same-origin from
astra** at `akasha.iridi.cc/audio/<date>.mp3`, replacing the surviving faerrin
`static-audio.iridi.cc` dependency (the last faerrin edge block). Four CI-green slices
(`9aea97d`→`976db90`→`2fced17`→the recipe fix); the **whole** faerrin caddyfile import was
removed from the shared proxy. Related: [[akasha-frontend-0011-gotchas]],
[[mouthpiece-frontend-0012-gotchas]], [[pipeline-live-run-gotchas]]. Scope:
`thoughts/shared/research/2026-06-24-akasha-session-audio-thoughts.md`.

**What shipped (mirrors the mouthpiece `/audio` D2 pattern):**
- `akashaFrontend.audio-dir = "/audio"` in all three config schemas (kdl + py + ts); akasha
  `server.ts` mounts it via `createSsrServer` `staticMounts` (Range-serving, 206); compose
  `akasha-audio:/audio:ro` volume + def. **No edge change for serving** — the catch-all
  `akasha.iridi.cc { reverse_proxy localhost:10365 }` passes `/audio/*` straight through.
- **Decision A (build-time normalize):** `transcript.ts` `loadTranscripts` rewrites each
  session's `audio` → `/audio/<date>.mp3` via a new `audioSrc(date)` (derived from the date,
  the unique key the build already routes on; flat filename mirrors mouthpiece's `<id>.mp3`).
  So the 78 committed linguist transcript JSONs need **no re-gen**. linguist flipped
  `STATIC_AUDIO_BASE` → `AUDIO_BASE = "/audio"` with the flat `<date>.mp3` layout (belt-and-
  suspenders). Verified: 78 distinct `/audio/<date>.mp3` in generated modules, **0** served
  `static-audio` strings.
- **`just akasha-seed`** flattens `<date>/audio.mp3` → `<date>.mp3` into `astra-akasha-audio`
  from HIST (faerrin `wretch/data/saved`, **incremental** — copy only when absent, so the
  one-time seed isn't re-copied on every timer redeploy) ∪ LIVE (astra scribe
  `apps/scribe/data/saved`, always overwritten, live wins). **Wired into the
  `linguist-commit` timer akasha phase** (seed before redeploy) so new sessions' audio lands
  automatically. **85 sessions seeded (~14.4 GB** — the "31 GB" figure was the whole
  back-catalog incl. per-speaker `.aac` tracks; the combined `audio.mp3` alone is ~14.4 GB).

**THE gotcha — faerrin's nested `saved/saved/`:** faerrin mislocated its 4 most-recent
sessions' audio under `wretch/data/saved/**saved**/<date>/audio.mp3` (one level too deep),
which is why faerrin's own `static-audio.iridi.cc/2026-6-8/audio.mp3` **404'd**. A flat
`/hist/*/` glob misses them. Fix: the seed scans `audio.mp3` at **any depth** (`find … -name
audio.mp3`, `<date>` = parent dir basename, guarded to `YYYY-M-D`). astra now serving 2026-6-8
**fixes a gap that was broken on faerrin**.

**Teardown (user chose "drop the WHOLE faerrin import"):** verified all 5 faerrin blocks safe
first — eerie (10174) + lark (10175) backing services **not listening** (already dead);
heart/caster were stale static dirs replaced by astra akasha/mouthpiece; static-audio now
replaced. Removed `import …/faerrin/sites.caddyfile` from `/ruby/data/reverse-proxy/Caddyfile`
(NOT an astra-repo file — backed up first), `just caddy-validate` (clean — no dangling
`(static_files)` snippet ref) → `just caddy-reload`. **Live-verified through the public edge:**
akasha home/transcript 200, `/audio/2025-9-11.mp3` + `/audio/2026-6-8.mp3` 206 Range,
`static-audio.iridi.cc` now dead (000/unreachable). `foundry_faerrin` (port 30001) is unrelated
and untouched. **faerrin's 31 GB `wretch/data/saved` kept as backup.** SigNoz still shows
`astra.akasha-frontend` SSR spans after the recreate (incl. the transcript route).
