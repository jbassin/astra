---
name: mouthpiece-frontend-0012-gotchas
description: 0012 mouthpiece-frontend (faerrin face → SSR podcast player) — Scope gate findings + locked decisions D1–D3
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
