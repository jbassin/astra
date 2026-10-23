---
date: 2026-06-21
subsystem: mouthpiece-frontend
plan: 0012
phase: 5
status: scope (pre-spec) — verified against the live repos
author: claude (/astra:load → parallel research agents → synthesis)
sources:
  - /ruby/data/experiments/faerrin/pkg/face (source app — Astro 5 SSG podcast player + 1 Solid island)
  - /ruby/data/experiments/faerrin/pkg/caster (the cross-package types/helpers face imports at build)
  - /ruby/data/experiments/astra/apps/mouthpiece-backend (the artifact producer, 0008)
  - /ruby/data/experiments/astra/apps/{strider,akasha-frontend} (the SSR frontend template + 2nd worked example)
  - /ruby/data/experiments/astra/libs/ts/{site-kit,content-build,gothic,observe}
  - /ruby/data/experiments/astra/ontology/ontology-{being,config} (campaign arc-titles, PodcastPersona, config)
supersedes_in_plan:
  - "0012 §2/§5.1 'TanStack Start static prerender → dist/' — STALE; Decision I = SSR Compose service, no prerender"
  - "0012 §3.1 / N1 'mouthpiece-backend emits episodes.json manifest' — FALSE against the code today; LOCKED D1 = ADD that asset to 0008"
decisions_locked_with_user:
  - "D1 = add an episodes_index manifest asset to mouthpiece-backend (0008) emitting episodes.json; frontend consumes it"
  - "D2 = seed real audio from faerrin caster/out (173 MB, 7 eps) into the episodes dir; mount as a Docker volume; serve same-origin"
  - "D3 = re-skin onto gothic Tailwind (NOT face's bespoke neon-HUD CSS) — consistency with strider/akasha"
---

# mouthpiece-frontend (0012) — Scope / pre-spec research

> **The podcast read-surface.** Rewrite faerrin's `face` (Astro 5 SSG + 1 Solid `Player` island) as astra's
> **mouthpiece-frontend** — a **TanStack Start SSR** site (Decision I — *not* prerendered static) that lists
> the roundtable episodes produced by **mouthpiece-backend** (0008), renders an episode page with the audio
> player + speaker-attributed transcript, and preserves face's episode **id schema** and **sort order**.
> The plan calls this the *smallest* of the 0011–0013 frontends (1 island, 2 routes) — and the renderer work
> is small, but three of the plan's load-bearing assumptions are wrong and surface real seams to settle.

This doc verifies the 0012 sub-plan against the actual code, resolves the checkable facts, and flags the
decisions to settle **before** speccing. Claims are cited to `file:line`.

---

## 1. Executive summary — what changed since the sub-plan was drafted

The 0012 sub-plan is dated 2026-06-19, **before Decision I** (frontends are SSR Compose services behind
Caddy, decided on 0014 / 2026-06-20) and before mouthpiece-backend (0008) was actually built. Three
load-bearing claims are now wrong, and the research surfaced two more seams the plan glosses:

1. **SSR, not static prerender.** The sub-plan says "TanStack Start **static prerender → `dist/`**"
   (§2, §5.1). Decision I flips this — mouthpiece-frontend runs as an **SSR server** (a Compose unit behind
   Caddy), copying strider/akasha-frontend (`apps/akasha-frontend/vite.config.ts:19-20` "SSR — no
   `prerender` block (Decision I)"). The face `episodes.json` endpoint (date→link) and any RSS/OG become
   **build-time-emitted static assets** served by the SSR static handler, exactly as akasha emits RSS/
   sitemap/contentIndex into `public/`→`dist/client` (`apps/akasha-frontend/scripts/build-content.ts:266-277`).

2. **There is NO `episodes.json` manifest — the plan's "DECIDED" N1 is false against the code today.** The
   sub-plan (§3.1, N1) asserts "mouthpiece-backend emits `episodes.json`; the frontend reads it at build."
   **It does not.** mouthpiece-backend writes a flat per-session directory tree under
   `episodes_path/<session_id>/` and emits **no cross-episode index** (grep for manifest/index/publish/
   catalog/rss → nothing; `apps/mouthpiece-backend/src/astra_mouthpiece/assets.py`). The only `manifest.json`
   is the per-session **audio clip list** (`AudioManifest`), not an episode catalog. **LOCKED (D1, with
   user): add the missing `episodes_index` asset to mouthpiece-backend (0008)** so it actually emits
   `episodes.json`, then the frontend consumes it — this expands 0012's scope into a small backend addition.

3. **face's identity is a bespoke neon-HUD CSS system, but we re-skin onto gothic.** The sub-plan says
   "gothic Tailwind preset"; `face` actually ships ~810 lines of hand-written CSS — `tokens.css` (a "Marathon
   HUD" neon design token set), `global.css`, `player.css` — with no Tailwind and no gothic
   (`/ruby/data/experiments/faerrin/pkg/face/src/styles/`). **LOCKED (D3, with user): re-skin onto gothic
   Tailwind** for visual consistency with strider/akasha — we keep face's *structure* and *behaviour* but
   rebuild the visual layer in gothic (so mouthpiece-frontend, like the other frontends, wires
   `@tailwindcss/vite` + gothic, and does NOT carry face's bespoke CSS).

4. *(seam)* **The transcript is rendered from `script.json` turns, not `transcript.md`.** face renders the
   roundtable transcript from the structured `script.turns` (speaker-attributed, audio-tags stripped, colored
   per A/B/C) inside a native `<details>` — it never reads `transcript.md`
   (`face/src/lib/episodes.ts:241-245`, `face/src/pages/[id].astro:76-94`). So there is **no markdown/vellum
   rendering** on this surface; gothic's `DocumentView` is irrelevant here (D4).

5. *(seam)* **Audio hosting + episode duration are both undefined in astra — now resolved by seeding real
   audio.** `MouthpieceConfig` has only `episodes_path` (currently `""`) + the ElevenLabs key — no base URL,
   no static-audio host (`libs/py/config/src/astra_config/models.py:69-72`, `config.kdl:68-71`). **LOCKED
   (D2, with user): seed real audio from faerrin** — `caster/out/` holds all **7 real `.episode.mp3` (173 MB:
   6 regular + 1 mega) + 7 `.transcript.md`**, ids matching the 14 golden fixtures exactly (verified on disk
   2026-06-21). Copy these into mouthpiece-backend's `episodes_path` output layout, **mount that dir as a
   Docker volume** into the mouthpiece-frontend container (this host runs both), and serve `episode.mp3`
   **same-origin** — so audio is real and playable, not deferred. Duration (D5) still isn't emitted; the
   player reads real `duration` from `loadedmetadata` at play time.

**Net:** the renderer/island work is genuinely small (one self-contained `Player` island, two routes, plain
transcript spans) — but the **data-source contract with 0008 is unbuilt**, and **audio hosting + duration +
styling** are open. mouthpiece-frontend is "small app, load-bearing seams."

---

## 2. What mouthpiece-backend actually produces (the real contract, 0008)

Per-session, written to `_session_dir = episodes_path/<session_id>/` (`assets.py:59-66`):

| File | Asset | Shape | Committed? |
|---|---|---|---|
| `<id>.episode.mp3` | `session_episode` (`assemble.py:236`) | final audio | **no** (gate-K deferred/paid; never materialized) |
| `<id>.transcript.md` | `session_episode` (`assemble.py:237`) | plain CommonMark, `**Host:** text` per turn | **no** |
| `script.json` | `session_script` (`assets.py:124`) | `Script` — the **primary metadata source** | **golden fixtures only** |
| `digest.json` | `session_digest` (`assets.py:109`) | `SessionDigest` (synopsis + beats) | **golden fixtures only** |
| `manifest.json` | `session_audio_clips` (`assets.py:137`) | `AudioManifest` (per-clip durations) | no |
| `clips/NNN.<fmt>` | `session_audio_clips` | raw per-turn clips (intermediate) | no |

- **`Script`** (camelCase wire format, ported from caster): keys `["sessionId","title","hosts","turns"]`;
  `hosts = {A:{name,persona}, B:…, C:…}`; `turns = [{speaker:"A"|"B"|"C", text}]` (`schemas.py:170-198`;
  verified in `apps/mouthpiece-backend/tests/fixtures/golden/*.script.json`). `title` is the episode's own
  title only — arc + date are **not** in it, they come from the id (`schemas.py:140-146`).
- **`SessionDigest`**: `["sessionId","synopsis","beats","discarded"]` — `synopsis` is what face shows on the
  episode/grid pages.
- **Committed fixtures**: `tests/fixtures/golden/` has **14 files = 7 sessions × {digest,script}.json**
  (6 regular + 1 mega `…2026-6-8-recap-of-2026-5-7`). **No `.episode.mp3` / `.transcript.md` samples** —
  audio is unmaterialized. These 14 JSON files are the only real artifact data available to build/test against.

### The id schema (preserve byte-for-byte)
- `session_id = "<arcNumber>.<arcSlug>.<date>"`, date **unpadded** `YYYY-M-D` (`linguist_io.py:24,39-41`),
  e.g. `000.through-a-song-darkly.2026-5-7`.
- **mega/recap**: `"<arcNumber>.<arcSlug>.<lastDate>-recap-of-<firstDate>"` (`mega.py:64-73`), deliberately
  shaped "so the consuming site treats it like any other episode (sorts to the END of its arc as a capstone)."
- **Sort key** (port verbatim): `date_sort_key = y*10000 + m*100 + d` (`mega.py:30-34`); the mega's date token
  `"2026-6-8-recap-of-…"` reduces to its **first three hyphen groups** (the last covered date) — face does the
  same with `dateKey` taking `parts.slice(0,3)` (`face/src/lib/episodes.ts:106-109`). Final order:
  `arcNo asc, then date_sort_key asc`. A naïve string sort on the unpadded date is **wrong**.

### Hosts (Bram/Maeve/Pip)
`PodcastPersona` in ontology-being (`being.kdl:340-359`): A→**Bram** (the Recapper), B→**Maeve** (the
Lorekeeper), C→**Pip** (the Instigator), each with an ElevenLabs `voice_id`/`voice_name`. **The frontend does
not need to load ontology-being for hosts** — the host names+personas are baked into every `script.json`'s
`hosts` block, and the A/B/C→role labels are a 3-line constant (`assemble.py:185-187`). `voice_id` is TTS-only.

### Arc display title (NEW vs faerrin)
faerrin read arc titles from `caster/content/shibboleth.json` (`buildArcTitles`). In astra the arc display
title is the **ontology-being `campaign.name`** — e.g. campaign `"through-a-song-darkly"` → `name "Through a
Song, Darkly"` (`being.kdl:70-71`). akasha-frontend **already imports the `@astra/ontology` `Campaign` shape**
and ports `matchCampaign` (`apps/akasha-frontend/src/domain/lib/campaigns.ts:1-60`), so the
arcSlug→campaign.name lookup is a clean, precedented seam (no shibboleth.json port).

---

## 3. faerrin `face` inventory (what to port)

Source: `/ruby/data/experiments/faerrin/pkg/face`. Astro 5 SSG, brand name "Caster", deployed `caster.iridi.cc`.

### 3.1 Routes (3)
- `/` — `src/pages/index.astro`: masthead + hero (episode count + summed runtime) + grid of `EpisodeCard`s
  (or an empty-state). `loadEpisodes()` (`index.astro:7-8`).
- `/<id>/` — `src/pages/[id].astro`: meta chips, title, arc, hosts, the `<Player>` island
  (`client:load`, `[id].astro:55`), synopsis, and the transcript in a native `<details>` (`[id].astro:76-94`).
  `getStaticPaths` maps each episode → one page (`[id].astro:9-12`). **The id contains dots** (e.g.
  `000.through-a-song-darkly.2026-5-25`) used verbatim as the path — the TanStack `episode/$id` param must
  capture dots (Risk).
- `/episodes.json` — `src/pages/episodes.json.ts`: a static **output endpoint** mapping session **date** →
  `{link, title}` (absolute URLs against `site` origin), a cross-system deep-link contract consumed by the
  wiki/Discord (`episodes.json.ts:13,24-31`). Reproduce as a build-emitted static asset (D7).

### 3.2 Build-time data — `src/lib/episodes.ts` (264 lines, the load-bearing module)
Scans the sibling `caster/out/` for `*.episode.mp3` (the required gate), then reads sidecars per id:
`<id>.script.json` (**required**, skip if absent), `<id>.digest.json` (optional synopsis), `<id>.audio.json`
(optional runtime fallback) (`episodes.ts:191-253`). It **cross-imports live TS from `caster/src/`**
(`episodes.ts:17-26`): types `Script`/`SessionDigest`/`AudioManifest`/`Shibboleth`, plus pure helpers
`stripAudioTags`, `buildArcTitles`/`buildMainArcs`, `dateSortKey`/`parseFilename`. Emits an `Episode`
(`episodes.ts:46-79`): `id, arcNo, arcTitle, episodeNo, isMain, date, title, episodeTitle, hostA/B/C,
runtimeMs, synopsis, mp3Url, transcript[]`. Notable derived fields:
- `episodeTitle = stripCampaignPrefix(script.title, arcTitle)` — strips a leading `"<ArcTitle> — "` if present
  (`episodes.ts:159-167`).
- `hostC` guarded (`?? ""`) — legacy two-host scripts lack `hosts.C` (`episodes.ts:222`); UI renders the 3rd
  host conditionally.
- `isMain = mainArcs.has(slug) || arcNo < 100` (`episodes.ts:231`) → "Campaign" vs "One-Shot" label.
- `episodeNo` = rank among **all** the campaign's transcript filenames (independent of render status,
  `episodes.ts:127-151`); recaps get `0`. (In astra, the transcript-filename source is linguist's `data/*.json`
  — same source akasha-frontend's transcript reconstitution uses.)
- `runtimeMs` via build-time **`ffprobe`** on the mp3, falling back to summed `manifest.clips[].durationMs`
  (`episodes.ts:169-185`) — a build-time subprocess dep (D5).
- `mp3Url = /audio/<id>.mp3?v=<size36>-<mtime36>` — same-origin, cache-busted by the source mp3's
  size+mtime (`episodes.ts:96-103,240`).
- `transcript[] = script.turns.map(t => ({speaker, name: hosts[speaker].name, text: stripAudioTags(...)}))`
  (`episodes.ts:241-245`) — **the transcript source is the script JSON, not transcript.md** (D4).

`stripAudioTags` removes ElevenLabs `[…]` inline cues (`caster/src/tts/tags.ts:13-19`) — must port; the v3
delivery tags are embedded in the spoken text and would otherwise show in the displayed transcript.

### 3.3 Audio copy hook
`astro.config.mjs:15-42` — an `astro:build:done` hook copies every `caster/out/*.episode.mp3` →
`dist/audio/<id>.mp3`. The astra equivalent (no Astro) = either the content-build script copies mp3s into the
served static dir, or audio is served off-image from an external origin (D2).

### 3.4 `Player.tsx` — the Solid audio island (~289 lines, the dense port)
`src/islands/Player.tsx`. Props `{id, src, title, artist?, runtimeMs, iconVersion?}`. Behaviour to port 1:1
(Solid `createSignal`/`onMount`/`onCleanup` → React `useState`/`useEffect`/`useRef`):
- **localStorage resume**: key `caster:pos:<id>`; restore on `loadedmetadata` only if `0 < saved <
  duration-1`; clear on `ended`; save on pause/pointerup/skip/seekto/`beforeunload`/unmount (`:32,44-50,127-154`).
- **Pointer-capture scrubbing**: `setPointerCapture`, `clamp((clientX-rect.left)/rect.width,0,1)*duration`;
  CSS `touch-action:none` on the track is **required** for touch scrub; don't overwrite `current` while
  scrubbing (`:52-80,135`, `player.css:110`).
- **MediaSession API** (SSR-guarded): `MediaMetadata` with **raster PNG** artwork `/icon-{192,256,512}.png`
  (iOS won't render SVG lock-screen art); `setPositionState` clamped + try/catch'd; action handlers
  play/pause/seek±15/seekto via a guarded `setAction` wrapper (`:104-223`). `SKIP = 15s`.
- **All browser-API access must sit inside a mount effect / client-only boundary** — the SSR template
  renders this on the server otherwise (the strider/akasha islands pattern).

### 3.5 Styling — bespoke neon-HUD CSS (NOT gothic) — see D3
`src/styles/{tokens.css (161), global.css (465), player.css (184)}` — a hand-rolled "Marathon HUD" design
system: black-default + light-theme tokens, type scale, crop-marks/hazard-stripes/scanlines, the player
transport. Dark/light is a `data-theme` on `<html>` with an **inline pre-paint FOUC head script** reading
`localStorage["caster:theme"]` (default dark) — the same pattern akasha-frontend already uses for Darkmode.
Fonts are self-hosted `@fontsource-variable/archivo` + `@fontsource/space-mono` (`Layout.astro:2-4`) — to be
self-served from the container like gothic's fonts are (D3).

---

## 4. The astra SSR template (how a new frontend is stamped)

Confirmed against `apps/strider/README.md:45-86` + what akasha-frontend did. mouthpiece-frontend is a near-pure
stamp of **akasha-frontend** (the closest precedent: build-time content → `src/generated/*`, `createServerFn`
for heavy server-only payloads, no editor).

- **Copy the shell** (`server.ts`, `vite.config.ts`, `vitest.*`, `tsconfig.json`, `Dockerfile`,
  `scripts/generate-routes.ts`, `src/router.tsx`, `src/observe/{rum,rumConfig}.ts`, `src/components/ClientOnly`,
  `src/lib`); replace `src/domain/` + `content/` + route bodies (`README.md:47-53`). Depend on
  `@astra/{site-kit,content-build,observe,config}` via `workspace:*` (gothic only if D3 keeps it).
- **Build-time content** via `@astra/content-build` `defineContentSource`/`buildContent` →
  `emitModule("src/generated/…")`, wired into vite by `contentWatchPlugin` (runs at `buildStart`, re-runs on
  edits in dev) so `fs`/parsers never reach the client bundle
  (`apps/akasha-frontend/scripts/build-content.ts`, `libs/ts/site-kit/src/vitePlugins.ts:30-66`).
- **Heavy server-only payloads** (long transcripts): akasha **code-splits one lazy module per item**
  (`src/generated/transcripts/<i>.ts`) behind a `createServerFn` GET handler so the client bundle stays small
  and the body loads server-side on full-page nav (`apps/akasha-frontend/src/domain/lib/transcriptBodyFn.ts`,
  `build-content.ts:198-230`). Directly applicable if mouthpiece transcripts are large.
- **Gotchas that bite** (`README.md:68-86`): vite **`--configLoader runner`** in dev/build (so vite.config can
  import a workspace TS pkg); **`createServerFn` stays in app source**; build stage must **`COPY
  ontology/ontology-config`** (vite.config reads service-name/port from config.kdl at build); commit
  `src/routeTree.gen.ts`; OTLP endpoint is in-cluster **`signoz-otel-collector:4318`**, never localhost; add
  the new app's `package.json` to the Dockerfile manifest-COPY list for `--frozen-lockfile`.
- **Config**: a **new** `mouthpiece-frontend` namespace (the existing `mouthpiece` is the backend) — mirror in
  `config.kdl` + Zod (`libs/ts/config`) + Pydantic (`libs/py/config`); RUM name derives `${serviceName}-rum`.
- **Ports**: 10350–10365 taken (10365 = akasha-frontend). **Recommend `10366`** for mouthpiece-frontend
  (kdl `port` + Compose `"10366:10366"`).
- **Deploy checklist**: Dockerfile (`ARG APP`, two-stage, copy ontology-config in both), Compose service
  (`build.args.APP`, no PORT env, healthcheck, `restart: unless-stopped`, `signoz-net`), Caddy block
  `mouthpiece.iridi.cc { import astra_site; reverse_proxy localhost:10366 }`, root `pyproject.toml` uv
  `exclude` += `apps/mouthpiece-frontend`. Apply with `just up` + `just caddy-reload` ([[deploy-apply-with-just]]).
- **RUM**: copy akasha's `src/observe/{rum,rumConfig}.ts`, change `cfg.akashaFrontend` → `cfg.mouthpieceFrontend`.

---

## 5. Decisions — D1/D2/D3 LOCKED with the user (2026-06-21); D4–D7 recommended for the spec

| # | Decision | Resolution |
|---|---|---|
| **D1** | **Episode data-source seam** (supersedes plan N1 — *no* `episodes.json` exists) | **LOCKED: add the manifest asset to 0008 first.** mouthpiece-backend gains a small unpartitioned `episodes_index` asset that globs the per-session dirs (`script.json` + `digest.json` + the emitted `.episode.mp3`/`.transcript.md`) and writes **`episodes.json`** (id, title, date, arc, arcTitle, hosts, synopsis, audio ref, transcript ref). mouthpiece-frontend reads that manifest at build → `src/generated/episodes.ts` (akasha-snapshot pattern). **Scope impact: 0012 includes a backend addition to 0008** (a new asset + its test, loaded by `dagster/definitions.py`). Build/test against the 14 committed golden `script`/`digest` fixtures. |
| **D2** | **Audio hosting / `mp3Url`** (undefined in astra; F4 host doesn't exist) | **LOCKED: seed real audio from faerrin + mount as a volume, serve same-origin.** Copy faerrin `caster/out/*.episode.mp3` (**7 eps, 173 MB**, verified) + `*.transcript.md` into mouthpiece-backend's `episodes_path` layout (a one-time seed; later the live pipeline materializes them there). **Mount `episodes_path` as a Docker volume** into the mouthpiece-frontend container (this host runs both) and serve `episode.mp3` **same-origin** (a static route off the mounted dir, NOT baked into the image — 173 MB stays out of the layer). `mp3Url` is a same-origin path with face's `?v=` cache-bust. The audio dir + volume are config-sourced, not hardcoded. |
| **D3** | **Styling** | **LOCKED: re-skin onto gothic Tailwind** (not face's bespoke CSS) — consistency with strider/akasha. Keep face's *layout structure* + *player behaviour*; rebuild the visual layer in gothic. Wire `@tailwindcss/vite` + gothic `@source` + the gothicFontsPlugin like the other frontends; **do not** carry `tokens/global/player.css` or the archivo/space-mono fonts. Keep the FOUC head script + a Darkmode island only if we want a theme toggle (akasha already has the pattern). |
| **D4** | **Transcript source** | **Recommend: script.json `turns`** — face's approach: speaker-attributed, audio-tag-stripped, A/B/C-colored spans in a `<details>`. No markdown/vellum render. (The real `transcript.md` is also seeded alongside the audio, but `script.json` is the richer structured source.) |
| **D5** | **Episode duration** (backend emits none) | **Recommend: read real `duration` from `loadedmetadata` at play time**, and optionally have the new D1 `episodes_index` asset `ffprobe` the seeded mp3s to bake a `durationMs` into `episodes.json` for the grid runtime display (mp3s now exist on disk, so a build-time/asset-time probe is viable). Decide in the spec whether the grid shows runtime. |
| **D6** | **Pure-helper porting** | **Recommend:** port the small pure helpers to TS in `src/domain/lib`: `parseId`/`dateKey`/sort (from `mega.date_sort_key`), `stripCampaignPrefix`, `stripAudioTags`. **Reuse** the `@astra/ontology` `Campaign` shape + `nameBySlug` already used by akasha's `campaigns.ts` for arcSlug→`campaign.name` (no shibboleth.json port). Some of this can live in the backend `episodes_index` asset instead (it already has `mega.date_sort_key` in Python) — decide the producer/consumer split in the spec. |
| **D7** | **The `/episodes.json` output endpoint** (date→{link,title}, a wiki/Discord deep-link contract) | **Recommend: reproduce** as a build-emitted static asset into `public/`→`dist/client` (like akasha's RSS/sitemap), using the config `public-origin`. **NB naming:** this output endpoint collides in name with the D1 build-input `episodes.json` manifest — keep them distinct (e.g. the cross-system deep-link map stays `/episodes.json`; the backend manifest can be `episodes-index.json` or live as a 0008 asset artifact). Settle the naming in the spec. |

---

## 6. Risks

1. **Data-source contract is unbuilt — 0012 must build it (D1).** The plan assumed a manifest that doesn't
   exist; the locked path adds an `episodes_index` asset to mouthpiece-backend. This is a **cross-app change**
   (a Python asset + test in 0008, loaded by `dagster/definitions.py`) inside a frontend slice — the spec must
   treat it as a first slice, with its own py-CI gate, before the frontend can consume the manifest. Build/test
   against the 14 committed golden fixtures.
2. **TanStack `$id` param with dots.** Episode ids contain dots (`000.through-a-song-darkly.2026-5-25`). akasha
   used a catch-all `$` for slashes; verify a single `episode/$id` param captures dotted ids losslessly (no
   decode surprises), or use a splat.
3. **Player port fidelity (small but fiddly).** MediaSession + pointer-capture + localStorage are easy to get
   subtly wrong: keep every try/catch (engines throw on `setPositionState`/`setActionHandler`), the
   `!scrubbing` guard, the resume `saved < duration-1` guard, `touch-action:none`, and PNG (not SVG) artwork.
   All browser APIs behind a client-only mount effect (SSR template renders on the server).
4. **id-schema sort + mega capstone.** Port `date_sort_key` exactly (unpadded date; mega → first-3 hyphen
   groups → arc-end). A wrong comparator misorders the grid and misplaces recaps.
5. **Styling decision is visible (D3).** Whichever way D3 goes is user-facing; settle it before speccing so the
   spec doesn't bake the wrong aesthetic.
6. **Audio is seeded, not pipeline-fresh (D2).** Audio is real (173 MB copied from faerrin) and same-origin
   playable from a mounted volume — but it's a **manual seed**, decoupled from a live mouthpiece-backend run
   (gate-K materialization is still deferred/paid). The spec should make the seed step explicit (where the
   files land, how the volume mounts, that ids must match the manifest) and treat the live-pipeline→audio path
   as the deferred follow-up. Keep the 173 MB **out of the image layer** (volume only).

---

## 7. Sketch of scope-in / scope-out (for the spec)

**In:** (1) a new **`episodes_index` asset in mouthpiece-backend** (0008) emitting `episodes.json` (D1) +
its test, loaded by `dagster/definitions.py`; (2) `apps/mouthpiece-frontend` SSR app (strider/akasha template,
port 10366); build-time reader of the manifest → `src/generated/episodes.ts`; routes `index` (grid) +
`episode/$id` (player + transcript); `Player` island ported 1:1 (MediaSession/scrubbing/localStorage,
client-only); transcript from script turns (D4); **gothic re-skin** (D3, `@tailwindcss/vite` + gothic fonts);
the `/episodes.json` deep-link output endpoint (D7); pure helpers ported (D6); **audio seeded from faerrin +
volume-mounted, served same-origin** (D2); telemetry (server OTel via site-kit + client RUM); the deploy
quintet (Dockerfile/Compose with the audio volume/Caddy/config.kdl×2/uv-exclude).

**Out / deferred:** the live ElevenLabs-materialized pipeline→audio path (gate-K, paid — the seed substitutes
for now, D2); `mouthpiece.iridi.cc` DNS (public-edge, deferred like strider/akasha/orator); per-episode
duration persistence in the backend beyond an optional `ffprobe` in the index asset (D5).

**Acceptance gate (draft):** the `episodes_index` asset emits a valid `episodes.json` over the golden
fixtures (py-CI green); app scaffolded, both CI lanes green; grid + episode pages render from the manifest;
`Player` plays/scrubs/resumes/MediaSession against the **real seeded audio** (same-origin volume); ids sort by
the schema (recaps at arc-end) matching face; transcript renders speaker-colored from script turns; the
`/episodes.json` deep-link endpoint emits; SSR spans land in SigNoz; deployed-local healthy on 10366 with the
audio volume mounted.

---

*Next gate: author the NLSpec (`octo:spec`) → `thoughts/astra/specs/0012-mouthpiece-frontend-spec.md`.
D1–D3 are locked with the user (2026-06-21); settle D4–D7 (transcript source, duration display, helper
producer/consumer split, the `episodes.json` naming collision) during speccing.*
