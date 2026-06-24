# Scope — bring the combined session audio into astra (akasha same-origin `/audio`)

Date: 2026-06-24
Status: SCOPE (pre-implementation) — not yet built
Related memory: [[akasha-frontend-0011-gotchas]], [[mouthpiece-frontend-0012-gotchas]],
[[pipeline-live-run-gotchas]], [[deploy-apply-with-just]], [[config-single-source]]

## Problem

akasha's transcript player (the 76 `Script/*` pages) plays the **combined Craig session
recording** for each session. Today that audio is **not served by astra** — it's still
fetched from **faerrin's** `static-audio.iridi.cc`, the one faerrin edge block that was
never decommissioned. Verified chain:

- **linguist** bakes the URL: `apps/linguist/src/astra_linguist/assets.py:45`
  `STATIC_AUDIO_BASE = "https://static-audio.iridi.cc"` → `process_session(date,
  f"{STATIC_AUDIO_BASE}/{date}/audio.mp3", …)` → the transcript JSON `audio` field.
- **akasha-frontend** uses it verbatim: `transcript.ts` (`audio` field) →
  `transcriptBuild.ts:55` `<source src="${attr(audio)}">`.
- astra's `sites.caddyfile` has **no** static-audio block. It works only because the shared
  proxy `/ruby/data/reverse-proxy/Caddyfile:211` still `import`s faerrin's caddyfile, whose
  `static-audio.iridi.cc { import static_files wretch/data/saved }` serves it.

### Verified facts (checked 2026-06-24)

- Back-catalog: **85 sessions, 31 GB** in `faerrin/pkg/wretch/data/saved/<date>/audio.mp3`
  (~186–209 MB each). `static-audio.iridi.cc/2025-9-11/audio.mp3` → **200** (live).
- **New sessions 404 there:** astra's scribe writes the combined recording to
  `apps/scribe/data/saved/<date>/audio.mp3` (198 MB for 2026-6-18), **not** faerrin's wretch.
  `static-audio.iridi.cc/2026-6-18/audio.mp3` → **404**. So the back-catalog plays but any
  session the live pipeline adds going forward has **broken transcript audio**.

So this is both a **decoupling** (drop the surviving faerrin dependency) and a **bug fix**
(new sessions currently have no working transcript audio).

## Decision (locked by user)

Serve the audio **same-origin under the akasha host** — `akasha.iridi.cc/audio/<date>.mp3` —
mirroring how mouthpiece serves episodes (`[[mouthpiece-frontend-0012-gotchas]]`), **not** a
standalone `static-audio` host. The audio is a **runtime volume**, never baked into the image
(D2 in mouthpiece terms).

## The mouthpiece `/audio` pattern this copies (verified)

- `apps/mouthpiece-frontend/server.ts:23` —
  `createSsrServer({ …, staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }] })`.
- config `mouthpieceFrontend.audio-dir = "/audio"` in **both** schemas
  (`libs/py/config/models.py:141`, `libs/ts/config/config.ts:147`) + `config.kdl:168`.
- compose `mouthpiece-audio:/audio:ro` runtime volume (`docker-compose.yml:241`); the catch-all
  Caddy `reverse_proxy localhost:10366` passes `/audio/*` straight through (no edge change).
- `just mouthpiece-seed` creates the volume + copies the audio in via a throwaway container.
- akasha already uses `createSsrServer` (`apps/akasha-frontend/server.ts:16`) but passes **no**
  `staticMounts` yet, and `akashaFrontend` config has **no** `audio-dir`. Clean drop-in.

## Proposed design

`akasha.iridi.cc/audio/<date>.mp3` served by the akasha SSR process off an `akasha-audio`
volume; transcript `<source>` URLs become same-origin `/audio/<date>.mp3`.

Note the **filename flattening**: source is `<date>/audio.mp3` (nested), served target is
`<date>.mp3` (flat, mirroring mouthpiece's `<id>.mp3`). Dates are unique per session → no
collisions.

### Open decision — where to flip the URL (recommend A)

The existing 76 committed transcript JSONs already have `audio:
https://static-audio.iridi.cc/<date>/audio.mp3` baked in. Two ways to make them same-origin:

- **A (recommended): normalize at akasha build time.** In `transcriptBuild.ts` (or
  `transcript.ts` load), map any `…/<date>/audio.mp3` → `/audio/<date>.mp3`. One place, robust
  to BOTH the existing 76 (old URL) and future ones, **no mass re-gen of linguist output**.
  Also flip linguist `STATIC_AUDIO_BASE` → `/audio` (relative) going forward so new transcript
  JSON is already correct and the normalizer becomes belt-and-suspenders.
- **B: linguist only.** Change `STATIC_AUDIO_BASE` and re-run linguist for all sessions to
  rewrite the `audio` field. More expensive (re-materializes transcripts) and leaves a window
  where committed data is stale.

## Implementation slices

1. **Serving seam.** Add `akashaFrontend.audio-dir = "/audio"` (both config schemas +
   `config.kdl`); akasha `server.ts` gains `staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }]`;
   compose mounts `akasha-audio:/audio:ro`. No Caddy change (catch-all proxy already passes `/audio/*`).
2. **Same-origin URLs (decision A).** Build-time normalize the transcript `audio` field to
   `/audio/<date>.mp3`; flip linguist `STATIC_AUDIO_BASE` to `/audio`. Update the URL-parity /
   transcript tests.
3. **Seed recipe.** `just akasha-seed` — create `astra-audio` volume, copy faerrin back-catalog
   (`wretch/data/saved/<date>/audio.mp3` → `<date>.mp3`, flatten) **∪** astra scribe live
   (`apps/scribe/data/saved/<date>/audio.mp3`, live wins), mirroring `mouthpiece-seed`. Wire it
   into the `linguist-commit` timer (`justfile`) so new sessions' audio lands in the volume on
   the auto-redeploy (same place `mouthpiece-seed` runs — `[[pipeline-live-run-gotchas]]`).
4. **Migrate + deploy + decommission.** Run `just akasha-seed` (one-time 31 GB copy),
   `just up` akasha-frontend, verify (below), then **drop the faerrin static-audio dependency**
   (see open question on the parent-proxy import).

## Acceptance gate

- Every akasha `Script/*` page's `<audio>` resolves **200 same-origin** off
  `akasha.iridi.cc/audio/<date>.mp3`; **no `static-audio.iridi.cc` string remains** in served HTML.
- A **back-catalog** session (e.g. 2025-9-11) AND a **new live** session (2026-6-18) both play.
- faerrin's `static-audio.iridi.cc` is no longer required by astra.

## Risks / open questions

- **31 GB volume.** Biggest cost — a 31 GB `akasha-audio` volume on the host (vs mouthpiece's
  173 MB). Confirm disk headroom before the seed. Open: host **all 85** or a subset? (Recommend
  all — completeness; the transcript pages already link them all.)
- **Decommissioning faerrin cleanly.** The parent proxy imports faerrin's **whole** caddyfile
  (heart/caster/static-audio/eerie/lark). Dropping the import kills all five. Options: (a) delete
  just the `static-audio` block from faerrin's caddyfile (leave the rest), or (b) confirm
  heart/caster/eerie/lark are dead (astra replaced them) and drop the whole import. **Separate
  decision** — out of scope here beyond "astra no longer needs static-audio." Keep faerrin's 31 GB
  `wretch/data/saved` as the backup until the astra volume is verified.
- **Image must not bake the 31 GB** — runtime volume only (D2). The akasha Dockerfile copies
  content/ontology, never the audio.
- **Existing committed transcript JSONs** keep the old absolute URL until re-gen — decision A's
  build-time normalizer covers this, so no data migration of the 76 files is required.

## Not in scope

- Streaming/transcoding/bitrate reduction of the 31 GB (kept as-is, like faerrin).
- Removing faerrin's other edge blocks (heart/caster/eerie/lark) — that's the broader
  faerrin-edge teardown, decided separately.
