---
name: mouthpiece-frontend-0012-gotchas
description: 0012 mouthpiece-frontend (faerrin face → SSR podcast player) — COMPLETE (6 slices, deployed-local); build gotchas + decisions D1–D7
metadata:
  type: project
---

**0012 mouthpiece-frontend** = port faerrin `face` (Astro 5 SSG podcast player) → an astra **SSR** TanStack
frontend (strider/akasha template, **port 10366**). Scope gate COMPLETE 2026-06-21; spec next. Scope doc:
`thoughts/shared/research/2026-06-21-mouthpiece-frontend-0012-thoughts.md`. The renderer work is genuinely
small (1 self-contained `Player` island, 2 routes) — the load-bearing parts are the data/audio/styling seams.

**The Scope gate overturned 3 sub-plan assumptions** (plan dated 2026-06-19, pre-Decision-I, pre-0008-build):
1. Plan's "DECIDED N1: mouthpiece-backend emits `episodes.json`" is **FALSE** — 0008 writes a flat
   per-session dir tree (`episodes_path/<id>/` with `<id>.episode.mp3`, `<id>.transcript.md`, `script.json`,
   `digest.json`, `manifest.json`=audio-clip-list, `clips/`); **no cross-episode manifest** exists.
2. "static prerender → dist/" → **SSR** (Decision I), like akasha.
3. "gothic preset" but `face` is ~810 lines of **bespoke neon 'Marathon HUD' CSS** (tokens/global/player.css),
   no Tailwind/gothic.

**Decisions LOCKED with the user (2026-06-21):**
- **D1 (data source):** ADD an unpartitioned **`episodes_index` asset to mouthpiece-backend (0008)** that
  globs the per-session dirs → emits `episodes.json` (id, title, date, arc, arcTitle, hosts, synopsis, audio
  ref, transcript ref). Frontend reads it at build → `src/generated/episodes.ts`. **So 0012's first slice is
  a BACKEND change** (Python asset + test, loaded by `dagster/definitions.py`, py-CI-gated) — not pure
  frontend. Build/test against the **14 committed golden fixtures** in `apps/mouthpiece-backend/tests/fixtures/golden/`
  (7 sessions × {script,digest}.json; 6 regular + 1 mega).
- **D2 (audio):** **seed real audio from faerrin** — `faerrin/pkg/caster/out/` has the **7 real `.episode.mp3`
  (173 MB) + `.transcript.md`**, ids byte-matching the golden fixtures (verified on disk). Copy into the
  episodes dir, **mount as a Docker volume** into the mouthpiece-frontend container (this host runs both),
  serve `episode.mp3` **same-origin** (static route off the mounted dir — keep 173 MB OUT of the image layer).
  `mp3Url` = same-origin path + face's `?v=size36-mtime36` cache-bust.
- **D3 (styling):** **re-skin onto gothic** Tailwind (consistency w/ strider/akasha). Keep face's layout
  structure + `Player` behaviour; DROP its bespoke CSS + archivo/space-mono fonts. Wire `@tailwindcss/vite` +
  gothic `@source` + gothicFontsPlugin like the other frontends.

**D4–D7 open (settle in spec):** D4 render transcript from `script.json` **turns** (speaker-attributed, A/B/C
colored, `stripAudioTags` to drop ElevenLabs `[..]` cues) NOT from `transcript.md`; D5 duration (backend emits
none — read real `duration` from `loadedmetadata`, or `ffprobe` the seeded mp3s in the index asset); D6
producer/consumer split for pure helpers (`parseId`/`dateKey`/sort from `mega.date_sort_key`,
`stripCampaignPrefix`); D7 the `/episodes.json` **output** endpoint (date→{link,title}, a wiki/Discord
deep-link contract) **collides in name** with the D1 build-input manifest — keep distinct.

**Load-bearing facts:**
- **id schema** `<arcNumber>.<arcSlug>.<date>` (date UNPADDED `YYYY-M-D`); mega = `…<lastDate>-recap-of-<firstDate>`,
  shaped to sort to arc-END. Sort = `arcNo asc, then date_sort_key (y*10000+m*100+d)`; mega's date token → first
  3 hyphen groups. Naïve string sort is WRONG.
- **arc display title** = ontology-being **`campaign.name`** (e.g. `through-a-song-darkly` → "Through a Song,
  Darkly", `being.kdl:70-71`) — NOT faerrin's shibboleth.json. akasha's `campaigns.ts` already imports the
  `@astra/ontology` `Campaign` shape + `nameBySlug`.
- **hosts** baked into every `script.json` `hosts` block (A=Bram/Recapper, B=Maeve/Lorekeeper, C=Pip/Instigator),
  so the frontend does NOT load ontology-being for hosts; `voice_id` is TTS-only.
- **`Player.tsx`** (~289 lines, the dense port): MediaSession (PNG artwork, not SVG; setPositionState/
  setActionHandler each try/catch'd — engines throw), pointer-capture scrubbing (`touch-action:none` required;
  don't overwrite `current` while scrubbing), localStorage resume (`caster:pos:<id>`, restore only if
  `0<saved<duration-1`). **All browser APIs behind a client-only mount effect** (SSR template).
- episode ids contain **dots** (`000.through-a-song-darkly.2026-5-25`) → verify TanStack `episode/$id` captures
  dots losslessly (akasha used catch-all `$` for slashes).

Template/deploy: stamp from akasha-frontend (closest precedent — build-time content→generated, createServerFn
for heavy server-only payloads, no editor). New config namespace **`mouthpiece-frontend`** (the existing
`mouthpiece` is the BACKEND) mirrored in kdl+Zod+Pydantic. See `[[strider-0016-gotchas]]`,
`[[akasha-frontend-0011-gotchas]]`, `[[migration-guide]]`, `[[deploy-apply-with-just]]`,
`[[tanstack-start-skill]]`.

---

## BUILD COMPLETE (2026-06-23) — all 6 slices pushed + deployed-local + verified live

Commits `032e107`(s1)…`9639bd5`(s6). Healthy on **10366**; the third 0011–0013 SSR frontend. **D4–D7
settled in the spec** (`thoughts/astra/specs/0012-mouthpiece-frontend-spec.md`); one **mid-build decision
revised D6** (see below).

**Slice 1 — `episodes_index` backend asset (D1).** 0012's first slice is a **mouthpiece-BACKEND** change
(not pure frontend): `apps/mouthpiece-backend/src/astra_mouthpiece/episodes_index.py` — unpartitioned asset
globbing `episodes_path/<id>/` → one sorted `episodes-index.json`. **Backend owns ALL shaping** (id-parse +
sort via reused `mega.date_sort_key` + per-arc `episode_no` + arcTitle from ontology-being `campaign.name`
(arc slug == `campaign.slug`; use `astra_ontology_being.load`, NOT `load_being()` no-arg) + ffprobe
durationMs + `audioVersion`). Pure helpers `strip_audio_tags`/`parse_id`/`episode_title` ported 1:1 from
face `episodes.ts`. **Two documented refinements over face** (not silent cuts): episode numbering ranks
*materialized* sessions (face ranks all corpus transcripts — equal when fully rendered); recap capstone
sorts **deterministically last** within a same-date tie (face left it to readdir order). Wired into BOTH the
app `defs` AND top-level `dagster/definitions.py` (which is loaded by FILE PATH, not import — `dagster` the
pkg shadows the dir). Tested over the 14 golden fixtures.

**REVISED D6 (mid-build, user-approved): the transcript is INLINED into the manifest.** Spec D6 had the
frontend read `script.json` + port `stripAudioTags`/`stripCampaignPrefix` to TS — but slice 1 already put
both helpers in Python (`episode_title` IS a manifest field; `strip_audio_tags` runs on synopsis). So slice 3
extended the asset to inline a per-episode `transcript: [{speaker,name,text}]` (stripped, host-named) →
**the frontend is a pure single-artifact consumer, ports NO helpers** (cleaner + DRY, the akasha-snapshot
pattern). `script.json` is read format-agnostically (faerrin wire `{sessionId,hosts:{A..}}` vs astra
`model_dump` `{session_id,hosts:{a..}}` both key `title`/`synopsis`/`turns`/`speaker`/`text`); host NAMES
come from `load_hosts()` (always Bram/Maeve/Pip), NOT the script's echoed block.

**The committed build artifact = `apps/mouthpiece-backend/snapshot/episodes-index.json`** (akasha-snapshot
pattern). Generated from the golden fixtures through the **production `discover_sessions` path** (so it's
byte-identical to what the live asset emits) + a freshness-gate test (`test_episodes_snapshot.py`;
`UPDATE_SNAPSHOT=1 uv run pytest -k snapshot` to refresh). **durationMs=0/audioVersion="" in the committed
snapshot** (no mp3s in git → CI-deterministic); the **Player reads real duration from `loadedmetadata`**
(D5, authoritative), so the grid omits summed runtime until the live pipeline materializes audio. Dockerfile
COPYs `apps/mouthpiece-backend/snapshot` into the build stage.

**Slice 2 scaffold gotchas:** SLIM deps — NO pixi/d3/pagefind/vellum (akasha-only) and **no `@astra/ontology`
at runtime** (arcTitle backend-resolved). **New-member ripple (Risk 6): adding `apps/mouthpiece-frontend`
forced `COPY apps/mouthpiece-frontend/package.json` into the 5 sibling image Dockerfiles**
(akasha/orator-backend/strider/weal-bot/weal-overlay) or their `--frozen-lockfile` breaks. uv `exclude` += the
app. `src/generated/.gitignore` = `*` + `!.gitignore`.

**Routes read the static generated modules DIRECTLY, not via `useLoaderData`** — the `@ts-nocheck`
generated route tree leaves `useLoaderData()` loosely typed (maps over it trip noImplicitAny). `EPISODES`/
`TRANSCRIPTS` are static fully-typed imports; the loader only does the SSR `notFound()`. **Dotted `$id`
captures losslessly** (Risk 2 RESOLVED — a single `episode/$id` segment, no catch-all needed unlike akasha's
slashes; verified live via a SigNoz `SSR GET /episode/000.through-a-song-darkly.2026-5-7` span).

**gothic re-skin (D3, slice 4):** globals.css is **plain CSS layered AFTER gothic's theme.css** (which owns
the `@import "tailwindcss"` + `@source "./"`) — do NOT re-import tailwindcss (double). Speaker colors are the
**3 fixed podcast hosts** (A=Bram/B=Maeve/C=Pip → teal/amber/rose), NOT ontology-being wiki-player colors.
The CSS bundle compiling `--color-void` + the app classes is the unstyled-gothic-regression guard.

**Player port (slice 5):** the load-bearing Solid→React trap — Solid's `scrubbing()`/`duration()` accessors
are always-current, but React closures capture state at effect-run time; the DOM + MediaSession listeners are
attached ONCE at mount, so they read **live values via refs (`scrubbingRef`/`durationRef`)** or a scrub gets
overwritten by `timeupdate` and `skip`'s clamp uses a stale duration. State drives render; refs mirror it.
**SSR-renders + hydrates (no `ClientOnly`)** — all browser APIs are in the effect, so unlike pixi it doesn't
crash SSR. Generated 3 MediaSession icon PNGs (192/256/512) via system-python PIL into `public/`. biome
override for the custom `role="slider"` scrub track (`a11y/useSemanticElements: off`).

**Deploy (slice 6, D2):** `createSsrServer` gained a generic backward-compatible **`staticMounts`** (path
under a prefix → `Bun.file` from disk, which **honours Range requests so audio seeking works**, or 404; never
SSR'd). Pure `staticMountPath()` is traversal-guarded + unit-tested. Config **`mouthpiece-frontend.audio-dir`
("/audio")** mirrored in all 3 schemas; server.ts passes `staticMounts:[{/audio/→audioDir}]`. **Audio is a
runtime named volume `mouthpiece-audio` mounted ro at /audio** — the 173 MB never enters the image (Decision
I). **`just mouthpiece-seed`** populates it from faerrin `caster/out` (flattens `<id>.episode.mp3`→`<id>.mp3`;
`MOUTHPIECE_AUDIO_SRC` overridable) — a MANUAL step; the live pipeline→audio path is the deferred follow-up.
Compose service @10366 + Caddy `mouthpiece.iridi.cc` (validated). **Verified live:** healthy; /, /episode,
/episodes.json all 200; `/audio/<id>.mp3` → **HTTP 206 + content-range `0-1023/24305624`** (real 24 MB mp3,
seeking); traversal/unknown → 404; **SigNoz `astra.mouthpiece-frontend` SSR spans** (audio served by the
static short-circuit creates NO SSR span — correct).

**Deferred (spec-sanctioned):** the `mouthpiece.iridi.cc` DNS record (outward-facing, like
strider/akasha/orator/weal-overlay — Caddy block authored + `caddy validate` Valid, but no `caddy-reload`);
the live ElevenLabs pipeline→audio materialization (gate-K paid — the manual seed substitutes); per-episode
duration persistence (the Player's `loadedmetadata` is authoritative).
