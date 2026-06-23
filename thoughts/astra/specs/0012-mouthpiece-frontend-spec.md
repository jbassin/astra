# NLSpec 0012 — mouthpiece-frontend (the podcast read-surface)

**Status:** **SPEC — ready for `octo:embrace`.** Scope gate COMPLETE (`399d5cd`,
[`../../shared/research/2026-06-21-mouthpiece-frontend-0012-thoughts.md`](../../shared/research/2026-06-21-mouthpiece-frontend-0012-thoughts.md)).
This spec builds on that scope doc, carries **D1–D3 locked with the user (2026-06-21)**, and **settles
D4–D7** below.
**Source plan:** [`../plans/0012-mouthpiece-frontend.md`](../plans/0012-mouthpiece-frontend.md) (dated
2026-06-19, **pre-Decision-I, pre-0008-build** — the scope gate overturned 3 of its load-bearing claims;
this spec supersedes those, see *Decisions in force*).
**Process:** octo:spec → octo:embrace, Claude team mode (typescript-pro, frontend-developer, python-pro for
the backend slice, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** `0003` gothic (Tailwind v4 preset + fonts), `0008` mouthpiece-backend (the per-session
artifacts + the **new `episodes_index` asset** this spec adds), Phase 1 (`@astra/config`,
`@astra/observe`+`/web`, `@astra/ontology` for arc titles), `0014` strider (the SSR template +
`@astra/site-kit` + `@astra/content-build`), `0011` akasha-frontend (the closest worked example — copy it).
**Phase:** 5 (frontends). The **smallest** of the 0011–0013 frontends (1 island, 2 routes) — but with a
**cross-app first slice** (a backend asset) and three load-bearing seams (data / audio / styling).

## Goal

Rewrite faerrin's `face` (Astro 5 **SSG** podcast player + 1 Solid `Player` island) as astra's
**mouthpiece-frontend**: a **TanStack Start SSR** site (Decision I — *not* prerendered static) that lists the
roundtable episodes produced by **mouthpiece-backend** (0008), renders an episode page with the audio player
+ speaker-attributed transcript, and **preserves face's episode `id` schema and sort order** (mega recaps
sort to arc-end). Audio is **real and same-origin playable** — the 7 real episodes (173 MB) are seeded from
faerrin and served off a mounted volume, kept out of the image layer.

Like the other frontends this is a **behaviour port, not a reinvention**: lift face's `Player.tsx`,
`stripAudioTags`, `stripCampaignPrefix`, and the id/sort schema verbatim; reuse the astra spine (akasha/strider
template, `@astra/site-kit`, `@astra/content-build`, gothic). The renderer work is genuinely small; the
load-bearing parts are the **data-source contract with 0008** (which does not exist yet — this spec builds it),
**audio hosting**, and the **gothic re-skin**.

## Decisions in force (locked with the user 2026-06-21 + settled here)

| # | Decision | Choice |
|---|----------|--------|
| I (roadmap) | Frontend hosting | **SSR Compose service behind Caddy** (client RUM) — **not** prerendered static `dist/`. Supersedes the plan's "static prerender → dist/" (§2/§5.1). |
| **D1** | **Episode data-source seam** | **LOCKED: add an `episodes_index` asset to mouthpiece-backend (0008).** The plan's "DECIDED N1: 0008 emits `episodes.json`" is **FALSE** against the code — 0008 writes a flat per-session dir tree, no cross-episode index. So **slice 1 is a BACKEND change**: a new unpartitioned asset that globs the session dirs → emits a sorted **`episodes-index.json`**; the frontend reads it at build → `src/generated/episodes.ts`. Built/tested against the **14 committed golden fixtures**. |
| **D2** | **Audio hosting / `mp3Url`** | **LOCKED: seed real audio from faerrin + mount as a volume, serve same-origin.** Copy `faerrin/pkg/caster/out/*.episode.mp3` (**7 eps, 173 MB**) + `*.transcript.md` into mouthpiece-backend's `episodes_path` layout (one-time seed; later the live pipeline materializes them there). **Mount `episodes_path` as a Docker volume** into the mouthpiece-frontend container and serve `episode.mp3` **same-origin** off the mounted dir (a static route — **173 MB stays OUT of the image layer**). `mp3Url` = same-origin path + face's `?v=` cache-bust. The audio dir + volume are **config-sourced**, not hardcoded. |
| **D3** | **Styling** | **LOCKED: re-skin onto gothic Tailwind** (not face's ~810 lines of bespoke "Marathon HUD" neon CSS) — consistency with strider/akasha. Keep face's *layout structure* + *player behaviour*; rebuild the visual layer in gothic. Wire `@tailwindcss/vite` + gothic `@source` + the `gothicFontsPlugin` like the other frontends; **do not** carry `tokens/global/player.css` or the archivo/space-mono fonts. |
| **D4** | **Transcript source** | **SETTLED: render from `script.json` `turns`** (face's approach) — speaker-attributed, `stripAudioTags`-cleaned, A/B/C-colored spans inside a native `<details>`. **No markdown/vellum render** (gothic's `DocumentView` is irrelevant here). The real `transcript.md` is seeded alongside the audio but `script.json` is the richer structured source. |
| **D5** | **Episode duration** | **SETTLED: the backend `episodes_index` asset `ffprobe`s the seeded mp3s** → bakes `durationMs` into `episodes-index.json` (the mp3s exist on disk at index time, so a build-time/asset-time probe is viable — the grid hero shows summed runtime). The **`Player` island also reads the real `duration` from `loadedmetadata`** at play time (authoritative for scrubbing). No per-episode duration is persisted in 0008 beyond this asset's probe. |
| **D6** | **Helper producer/consumer split** | **SETTLED. Backend asset owns** id-parse + **sort** (`mega.date_sort_key`, already Python) + `episodeNo` ranking + **arcTitle from ontology-being `campaign.name`** (Python is the ontology truth) + `durationMs` (D5). The manifest ships **already-sorted, arc-titled, duration-stamped**. **Frontend ports only the display-shaping helpers** faerrin's `episodes.ts` applies — `stripAudioTags` (turn text) + `stripCampaignPrefix` (episodeTitle from `title`+`arcTitle`) — verbatim to TS in `src/domain/lib`. The frontend does **not** re-derive sort/arc-title (no shibboleth.json port; no `@astra/ontology` import needed at runtime). |
| **D7** | **The `/episodes.json` output endpoint** (naming collision) | **SETTLED: the two are distinct artifacts.** (a) The **build-input** manifest (the D1 asset's output) = **`episodes-index.json`** — not web-served, consumed only at build. (b) The **web-output** endpoint = **`/episodes.json`** (date→`{link,title}`, the wiki/Discord deep-link contract) — **build-emitted** static into `public/`→`dist/client` using config `public-origin`, exactly like akasha emits RSS/sitemap. Different names → no collision. |

## Scope (in)

Slices (each CI-green before commit; push on chunk completion; reproduce the relevant lane locally per
[[no-ci-monitoring]]):

1. **`episodes_index` backend asset (D1/D5/D6) — Python, in mouthpiece-backend.** A new **unpartitioned**
   asset in `apps/mouthpiece-backend/src/astra_mouthpiece/assets.py` that globs the per-session dirs under
   `episodes_path/<id>/`, reads each `script.json` (required — skip a session without one) + `digest.json`
   (optional synopsis), and emits a **sorted** `episodes-index.json`: per episode `{id, arcNo, arcSlug,
   arcTitle, episodeNo, isMain, date, dateSortKey, title, hosts:{A,B,C?:{name,persona}}, synopsis, durationMs,
   hasAudio, hasTranscript, audioVersion}`. Owns: **id-parse** (`<arcNumber>.<arcSlug>.<date>`, mega =
   `…<lastDate>-recap-of-<firstDate>`), **sort** (`arcNo asc, then dateSortKey = y*10000+m*100+d`; mega's date
   token → first 3 hyphen groups — port `mega.date_sort_key` verbatim, naïve string sort is WRONG),
   **`episodeNo`** ranking (rank among the arc's sessions; recaps → 0), **`isMain`** (`arcNo < 100` ||
   main-arc), **`arcTitle`** resolved from ontology-being `campaign.name` (`through-a-song-darkly` → "Through a
   Song, Darkly"), **`durationMs`** via **`ffprobe`** on the seeded mp3 (fallback: summed
   `manifest.clips[].durationMs`), **`audioVersion`** = `size36-mtime36` (D2 cache-bust, baked here because the
   frontend build never sees the mp3). **Loaded by `dagster/definitions.py`.** Test over the **14 committed
   golden fixtures** (7 sessions × {script,digest}.json; assert sort order, mega-at-arc-end, arcTitle
   resolution, the id/dateSortKey of every fixture). **py-CI gate** (`uv run ruff/ty/pytest`).

2. **Scaffold `apps/mouthpiece-frontend`** from the akasha/strider SSR shell (`server.ts`, `vite.config.ts`
   with `--configLoader runner` + `@tailwindcss/vite`, `vitest.config.ts`, `tsconfig.json`, `Dockerfile`,
   `scripts/`, `src/router.tsx`, `src/observe/{rum,rumConfig}.ts` with `cfg.mouthpieceFrontend`, generic
   `src/components/ClientOnly` + `src/lib`, `src/styles` wiring gothic `@source` + the `gothicFontsPlugin`).
   Depend on `@astra/{site-kit,content-build,gothic,observe,config}` (`workspace:*`). **Config namespace**
   `mouthpiece-frontend { service-name "astra.mouthpiece-frontend"; port 10366 }` in `config.kdl`, **mirrored
   in both** `libs/ts/config` (Zod) **and** `libs/py/config` (Pydantic) — distinct from the existing
   `mouthpiece` (the backend). Telemetry-first via `createSsrServer` ([[telemetry-built-in]]). Add
   `apps/mouthpiece-frontend` to `pyproject.toml` uv `exclude`. A placeholder content source + **≥1 test**
   (else `bun test` exits 1). CI-green skeleton that boots SSR.

3. **Build-content: manifest read + pure helpers + the `/episodes.json` output endpoint (D4/D6/D7).** A
   `@astra/content-build` source that reads the build-input **`episodes-index.json`** (already sorted/
   arc-titled/duration-stamped from slice 1) **+** each session's `script.json` (for the transcript `turns`) →
   emits `src/generated/episodes.ts` (typed `Episode[]`). Port to TS in `src/domain/lib` **verbatim**:
   `stripAudioTags` (removes ElevenLabs `[…]` inline cues from turn text) + `stripCampaignPrefix` (strips a
   leading `"<ArcTitle> — "` from `title` → `episodeTitle`). Build `transcript[] =
   turns.map(t => ({speaker, name: hosts[speaker].name, text: stripAudioTags(t.text)}))` (`hosts.C` guarded —
   legacy two-host scripts). `mp3Url` = same-origin path (config audio mount) + `?v=<audioVersion>` (from the
   manifest — the frontend never touches the 173 MB). **Build-emit the `/episodes.json` web endpoint** (D7:
   date→`{link,title}` against config `public-origin`) into `public/`→`dist/client`, like akasha's RSS/sitemap.
   **Build inputs:** the committed golden fixtures are the deterministic build corpus (COPY into the Dockerfile
   build stage like akasha COPYs the snapshot) — see Risk 1.

4. **Routes + gothic re-skin (D3).** TanStack SSR routes + loaders: **`index`** (masthead + hero =
   episode-count + summed runtime + an `EpisodeCard` grid, or the empty-state) + **`episode/$id`** (meta chips,
   title, arc, hosts, the `<Player>` island slot, synopsis, and the **transcript** in a native `<details>`).
   **Verify the dotted `$id`** captures `000.through-a-song-darkly.2026-5-25` losslessly (Risk 2). Render the
   transcript (D4) as **A/B/C speaker-colored spans** (gothic-toned 3-color scheme — hosts are the fixed
   Bram/Maeve/Pip slots baked in `script.hosts`, **no ontology-being load needed**). Re-skin face's structure
   onto gothic utilities; keep the optional FOUC/Darkmode head-script pattern only if a theme toggle is wanted
   (akasha has the pattern). `body[data-slug]` not needed (no graph here).

5. **`Player` island (Solid → React) — the dense port (~289 lines).** Port `Player.tsx` **1:1**
   (`createSignal`/`onMount`/`onCleanup` → `useState`/`useEffect`/`useRef`), behind a **client-only mount
   effect** (all browser APIs; the SSR template renders on the server otherwise):
   - **localStorage resume** — key `caster:pos:<id>`; restore on `loadedmetadata` only if `0 < saved <
     duration-1`; clear on `ended`; save on pause/pointerup/skip/seekto/`beforeunload`/unmount.
   - **Pointer-capture scrubbing** — `setPointerCapture`; `clamp((clientX-rect.left)/rect.width,0,1)*duration`;
     **`touch-action:none` on the track is required** for touch scrub; **don't overwrite `current` while
     scrubbing** (`!scrubbing` guard).
   - **MediaSession API** (SSR-guarded) — `MediaMetadata` with **raster PNG** artwork (`/icon-{192,256,512}.png`
     — iOS won't render SVG lock-screen art; ship the PNGs in `public/`); `setPositionState` clamped +
     try/catch'd; action handlers play/pause/seek±15/seekto via a guarded `setAction` wrapper; **`SKIP = 15s`**.
   - Reads the real `duration` from `loadedmetadata` (D5). Keep **every try/catch** (engines throw on
     `setPositionState`/`setActionHandler`).

6. **Audio seed + volume + deploy (D2) + telemetry.** Seed the **7 real `.episode.mp3` (173 MB) +
   `.transcript.md`** from `faerrin/pkg/caster/out/` into mouthpiece-backend's `episodes_path` layout (ids
   byte-match the golden fixtures — verified on disk; document the seed step explicitly: where files land, that
   ids must match the manifest). The templated `ARG APP` **Dockerfile** (COPY all app manifests +
   `ontology/ontology-config` + the committed golden fixtures for the build; runtime COPYs `dist`,
   `src/generated`, `server.ts`, `node_modules`, `libs/ts` — **173 MB audio NOT in the image**). A **Compose
   unit** `mouthpiece-frontend` on **10366** (no PORT env, healthcheck, `restart: unless-stopped`, `signoz-net`)
   **+ the `episodes_path` audio volume** mounted read-only; a static route serves `episode.mp3` same-origin off
   the mount. A **Caddy block** `mouthpiece.iridi.cc { import astra_site; reverse_proxy localhost:10366 }`
   (fonts self-serve from the container). Add to uv `exclude`. **Telemetry verified** — a
   `service.name=astra.mouthpiece-frontend` SSR span lands in SigNoz via the `signoz_*` MCP ([[signoz-mcp]]);
   browser RUM via the `createServerFn` `rumConfig` seam + `@astra/observe/web`. Apply with `just up` +
   `just caddy-reload` ([[deploy-apply-with-just]]).

## Scope (out)

- **The live ElevenLabs-materialized pipeline → audio path** (gate-K, paid) — the **seed substitutes** for now
  (D2); the live-run-fills-`episodes_path` path is the deferred follow-up. The spec makes the manual seed
  explicit; it does not trigger a paid materialization.
- **Public DNS / outward-facing edge** — `mouthpiece.iridi.cc` DNS record is a manual, outward-facing step
  (like strider/akasha/orator); the Caddy block is authored + validated but the record is **deferred** unless
  told to proceed ([[deploy-apply-with-just]]).
- **Per-episode duration persistence in the backend beyond the index asset's `ffprobe`** (D5) — no DB column,
  no separate duration asset.
- **Markdown/vellum rendering of the transcript** — D4 renders from `script.json` turns, not `transcript.md`;
  gothic `DocumentView` is not used here.
- **face's bespoke "Marathon HUD" CSS + archivo/space-mono fonts** (D3) — dropped; gothic re-skin only.
- **Re-transcription / data regeneration** — the golden fixtures + seeded audio are inputs, consumed as-is.

## Locked technical decisions

| # | Decision | Choice |
|---|----------|--------|
| Framework | Build flavor | **`@tanstack/react-start` (SSR)** — the akasha/strider template; no `prerender` block (Decision I). |
| Port | mouthpiece-frontend | **10366** (next free after 10365 akasha-frontend; behind Caddy). |
| Data source | Episode discovery | **A new `episodes_index` asset in 0008** emits the sorted **`episodes-index.json`** (D1); frontend reads it at build → `src/generated/episodes.ts`. Build corpus = the 14 committed golden fixtures. |
| Producer/consumer | Helper split | **Backend owns** id-parse/sort/`episodeNo`/arcTitle/`durationMs`/`audioVersion` (D6); **frontend ports** `stripAudioTags` + `stripCampaignPrefix` verbatim. |
| Transcript | Source | **`script.json` turns** — A/B/C speaker-colored spans in `<details>`, `stripAudioTags`-cleaned (D4). No vellum/markdown render. |
| Duration | Source | **Asset `ffprobe` → `durationMs`** (grid runtime) + **`loadedmetadata`** at play time (scrub authority) (D5). |
| Audio | Hosting | **Seeded from faerrin (173 MB), Docker-volume-mounted, served same-origin** off the mount — out of the image layer (D2). `mp3Url` = same-origin path + `?v=<audioVersion>`. |
| Output endpoint | `/episodes.json` | **Build-emitted static** (date→`{link,title}`, config `public-origin`) — distinct from the build-input `episodes-index.json` (D7). |
| Styling | Visual layer | **gothic Tailwind re-skin** — `@tailwindcss/vite` + gothic `@source` + `gothicFontsPlugin`; face's CSS/fonts dropped (D3). |
| Player | Port | **`Player.tsx` 1:1**, client-only mount effect; keep every try/catch, the `!scrubbing` guard, `touch-action:none`, PNG artwork, `SKIP=15s`, the `0<saved<duration-1` resume guard (Risk 3). |
| Routing | `episode/$id` | **Single `$id` param** (ids carry dots, not slashes — verify lossless capture; no catch-all needed, unlike akasha's slug-with-slashes) (Risk 2). |
| Vendoring | Build inputs | Read across workspace; Dockerfile COPYs `ontology/ontology-config` + the golden fixtures (like akasha COPYs the snapshot). Audio is a **runtime volume**, never a build input. |

## Acceptance criteria (exit gate)

- [ ] **Both toolchains green locally** before pushing (per [[no-ci-monitoring]]): the py lane
      (`uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest`) for the slice-1
      asset, and `bun --filter '*' {typecheck,test,build}` + `bunx biome ci .` over the **whole** repo for the
      frontend.
- [ ] **`episodes_index` asset (D1):** emits a valid sorted `episodes-index.json` over the 14 golden fixtures —
      ids parsed, sort order correct (`arcNo` then `dateSortKey`), **mega recaps at arc-end**, arcTitle resolved
      from ontology-being `campaign.name`, `durationMs`/`audioVersion` stamped. Loaded by
      `dagster/definitions.py`. py-CI green.
- [ ] **Grid + episode pages render from the manifest:** `index` shows the episode count + summed runtime + the
      `EpisodeCard` grid; `episode/$id` renders meta/title/arc/hosts/synopsis. Episodes **sort by the id schema
      (recaps at arc-end), matching face**. Dotted `$id` captures losslessly.
- [ ] **`Player` (D2/D5):** plays/scrubs/resumes against the **real seeded audio** (same-origin volume),
      MediaSession metadata + position + action handlers work, localStorage resume restores within the guard,
      pointer-capture scrubbing works on touch (`touch-action:none`). Client-only — no browser-API access on the
      SSR path.
- [ ] **Transcript (D4):** renders speaker-colored from `script.turns` (A/B/C), `stripAudioTags` removes the
      `[…]` cues, `hosts.C` guarded for two-host scripts.
- [ ] **`/episodes.json` output endpoint (D7):** build-emits the date→`{link,title}` deep-link map against
      `public-origin`; distinct from the build-input `episodes-index.json`.
- [ ] **gothic re-skin (D3):** `@tailwindcss/vite` + gothic wired; face's bespoke CSS/fonts absent; styling is
      gothic throughout.
- [ ] **SSR + deploy:** runs as an SSR Compose service on 10366 (no PORT env) behind a Caddy `astra_site` block,
      the **audio volume mounted** + `episode.mp3` served same-origin, fonts self-served, healthcheck green,
      restart-survives. Telemetry verified — `service.name=astra.mouthpiece-frontend` SSR spans in SigNoz (MCP).
      **(Public DNS deferred — `just caddy-reload` + `mouthpiece.iridi.cc` record, outward-facing.)**
- [ ] Memory updated (`thoughts/shared/memory/mouthpiece-frontend-0012-gotchas.md`) with the build-time
      load-bearing gotchas; RESUME "Current state" bumped; committed per-slice + pushed.

## Risks

1. **Data-source contract is unbuilt — 0012 must build it (D1).** The plan assumed a manifest that doesn't
   exist; slice 1 adds the `episodes_index` asset to mouthpiece-backend — a **cross-app Python change** (asset +
   test, loaded by `dagster/definitions.py`) inside a frontend slice, with its **own py-CI gate** before the
   frontend can consume the manifest. **Mitigation:** build/test against the 14 committed golden fixtures; treat
   slice 1 as a self-contained backend slice that lands green before slice 2.
2. **TanStack `$id` with dots.** Episode ids contain dots (`000.through-a-song-darkly.2026-5-25`). akasha used a
   catch-all `$` for *slashes*; here a single `episode/$id` segment should capture dots. **Mitigation:** a
   route-param round-trip test on a dotted id (no decode surprises) in slice 4; fall back to a splat only if it
   doesn't.
3. **`Player` port fidelity (small but fiddly).** MediaSession + pointer-capture + localStorage are easy to get
   subtly wrong. **Mitigation:** port `Player.tsx` verbatim — keep every try/catch (engines throw on
   `setPositionState`/`setActionHandler`), the `!scrubbing` guard, the resume `saved < duration-1` guard,
   `touch-action:none`, PNG (not SVG) artwork; all browser APIs behind a client-only mount effect; verify on the
   real seeded audio.
4. **id-schema sort + mega capstone.** A wrong comparator misorders the grid and misplaces recaps.
   **Mitigation:** the sort lives in the backend asset (slice 1) where `mega.date_sort_key` already exists —
   port it verbatim (unpadded date; mega → first-3 hyphen groups → arc-end) and assert the order over the
   golden fixtures.
5. **Audio is seeded, not pipeline-fresh (D2).** Audio is real (173 MB copied) and same-origin playable from a
   mounted volume, but it's a **manual seed** decoupled from a live mouthpiece-backend run (gate-K
   materialization deferred/paid). **Mitigation:** the spec makes the seed step explicit (files land in
   `episodes_path`, ids match the manifest, volume mounts read-only, **173 MB stays out of the image layer**);
   the live-pipeline→audio path is the deferred follow-up.
6. **New-workspace-member ripple.** Adding `apps/mouthpiece-frontend` re-runs `bun install` (can bump biome
   within semver) and a partial Dockerfile manifest-COPY breaks `--frozen-lockfile`. **Mitigation:** COPY all
   app manifests; `bunx biome ci .` over the whole repo; add the new dir to uv `exclude` (uv rejects a
   manifest-less member dir — the dir gets its `package.json` in slice 2). The strider/akasha lesson.
7. **gothic re-skin drift (D3).** Re-skinning face's structure risks shipping gothic utilities unstyled
   (Tailwind v4 skips `node_modules` → a gothic consumer needs the `@source "./"` declared, the
   akasha-frontend slice-4 lesson). **Mitigation:** wire `@tailwindcss/vite` + gothic `@source` per
   [[strider-0016-gotchas]] / [[akasha-frontend-0011-gotchas]]; verify styling live, not just that it builds.

## Hand-off

mouthpiece-frontend is the podcast **read surface** and the third 0011–0013 SSR frontend on the strider
template (akasha-frontend is the closest worked example — copy it). It consumes a **new `episodes_index`
manifest** that this spec adds to mouthpiece-backend (0008), renders an episode grid + a player page with a
speaker-attributed transcript, and serves **real seeded audio** off a mounted volume same-origin. The
`Player.tsx` island is the densest port (MediaSession + scrubbing + localStorage, verbatim); everything else is
small. D1–D3 are locked with the user; D4–D7 are settled here. The one spec-sanctioned deferral is the **live
pipeline→audio materialization** (the manual seed substitutes); the public DNS edge is deferred like the other
frontends. Next after this: **0013 vellum-fe**, then **Phase 6 cutover** (plan `0015`).
