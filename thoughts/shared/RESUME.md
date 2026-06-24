# RESUME — pick up astra work here

A living handoff doc. To resume in a fresh session, the prompt can simply be:
**"Read `thoughts/shared/RESUME.md` and continue."**

Keep the **Current state** section below updated as work lands (it's the only part that goes stale —
everything else points at durable docs). Update it when you finish a slice/subsystem.

---

## Orient first (read before doing anything)

1. **`CONTRIBUTING.md`** (root) — the practical guide: dev process, exact CI commands, working-style
   rules, the gotchas catalog. Primary onboarding doc.
2. **`CLAUDE.md`** — authoritative conventions.
3. **`thoughts/astra/plans/0000-astra-migration-roadmap.md`** — phases + the decisions ledger A–I.
   Note **Decision I**: frontends are **SSR Compose services behind Caddy**, not prerendered static.
4. **`thoughts/shared/memory/MEMORY.md`** + its memories — especially the feedback memories
   **`verify-before-acting`** and **`no-silent-scope-cuts`**.

## How to work (hard rules — see the feedback memories)

- **Port faerrin; don't reinvent** — grep `/ruby/data/experiments/faerrin` FIRST for any logic and lift it.
- **Verify before acting** — check the real repo/config/source; don't assume or run on a default.
- **Build the spec's scope in full; never silently collapse/defer** to fit budget — surface the trade-off
  and ask. Only defer what the spec explicitly sanctions.
- **Commit each CI-green slice** (Conventional Commits) and **push on chunk completion**, after
  reproducing CI locally. Don't accumulate uncommitted work; don't watch the GHA run (confirm push + one
  status check).
- **Reproduce CI locally before pushing:**
  ```
  uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest
  bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build
  ```
  (scope to the lane/app you touched).

---

## Current state — UPDATE THIS SECTION (as of commit `7cf1c9a`, 2026-06-24)

> **The faerrin→astra migration is COMPLETE (see the 🎉 section below).** Newest work is **ordinary
> product/ops on the live stack**, not migration slices.

### Gothic / frontend design polish (2026-06-24 session — COMPLETE + PUSHED + DEPLOYED LIVE)

A critical design pass over how **gothic** renders content + the 4 public frontends (live-captured with
Playwright, each fix screenshot-verified). Audit: `thoughts/shared/research/2026-06-24-gothic-frontend-design-audit-thoughts.md`;
memory `[[gothic-frontend-design-polish]]`. 15 findings, 6 CI-green slices (`0d39ea1` audit … `1c7e507`):
- **gothic** (`e3f7581`): style bare `pre`/`code`/`blockquote`; card fill `bg-panel`→`bg-elevated`;
  padded trait pills; emoji fallbacks. **VR goldens regenerated in the pinned container (0 drift).**
- **akasha** (`da5516a`,`c95ee90`): the **`@layer base` reset fix** (THE cross-cutting gotcha — unlayered
  reset was zeroing all gothic content padding), reading-measure cap + larger prose, centered 404,
  mobile content-first, tag-index/graph-empty/search polish, dropped noise dates.
- **strider** (`d3d8b98`): faction dossier headings (member names in faction color) + reset fix + dead CSS.
- **orator** (`d889053`): compact centered sign-in card.
- **vellum-frontend** (`a9131dd`): reset fix (editor preview) + the cross-cutting gotcha documented in
  `apps/strider/README.md`.
- **akasha content** (`1c7e507`): repaired the Tormeré Situation Room transcript (mis-fenced `:::fields`).
- **Redeployed + live-verified** (`just up`, 2026-06-24): akasha/strider/orator/vellum all healthy on
  their public hosts; Tormeré transcript, faction dossier, orator sign-in confirmed live.
- **`:::deity` construct added** (`14ed961` feat + `99573a6` content + `facf263` render): a divine
  stat-block vellum kind, from a survey of heavy `:::fields` usage. `deity` is a `DOCUMENT_KIND` so it
  gets both brace forms; gothic `DeityCard` renders it **run-in (label inline with value), NOT a
  two-column grid** (`facf263` — the grid mis-aligned between sections + gapped badly). 7 Divinity pages
  migrated + Hierophant Harrow Decks fixed (same fence bug as Tormeré); `deity-mechanical` VR
  fixture/golden. Memory `[[gothic-frontend-design-polish]]` has the "how to add a `:::kind`" recipe.
- **WHOLE corpus → VSS braces** (`d1c6b73` engine + `1751aee` content; deities `76b472c`): closed two VSS
  gaps so every construct has a brace form — **block title is optional** (`@handout { … }`) and
  **`@fields`/`@timeline`** lower to `:::fields`/`:::timeline`. Swept all 21 handouts + fields + timeline
  + 7 deities to `@…{ }`; **zero `:::` openers remain** in the content tree. compileVss lowers to identical
  canonical, so renders are byte-identical (VR fixtures stay canonical → goldens untouched). `.gitattributes`
  maps `*.vellum`→Markdown for GitHub (`76b472c`). All redeployed + live-verified (`just up`).
- **Open/optional:** a first-class dialogue/transcript vellum construct (the Tormeré/Harrow pattern) —
  still surfaced, deliberately not invented ad-hoc.

### Post-migration product work — strider (2026-06-24 session, all COMPLETE + PUSHED + DEPLOYED LIVE)

All on `astra-strider` (10360 / `strider.iridi.cc`), each rebuilt via `docker compose up -d --build strider`
and verified (healthy + local 200 + public-edge 200; the faction panel screenshot-verified).

- **Map content edits** (`1ffe9df`…`bf9bc04`): added the **Final Caliber** skein node at the centre of the
  Radiant Arms base + a skein-connect to iconoclasm's `ears-that-hear-the-truth` (new
  `symbols/final-caliber.svg`); a **tithe** event 3 s before Garrick is removed; then **removed** the
  Tri-Faction Concord + the closing strider-tithe and instead formed the **Team TBD** banner
  (iconoclasm/solari-sub-surface/radiant-arms/alkahest-freight, orange `#E8702E`) on 07-19 10:00, with
  Alkahest struck 07-20 01:02 and Solari 07-20 01:47 (bases + skein nodes; dangling edges skipped at render).
- **✅ Tithe timing fix** (`f183dab`): the wave is now a **fixed-duration** animation (`TITHE_TOTAL_MS`,
  budget-independent — fill travels center→edge over `TITHE_FILL_MS`), fade quicker (`TITHE_FADE_MS`
  720→300), and playback **dwells the full wave** after a tithe layer (`TITHE_DWELL_MS`) so it completes
  before the next layer applies (timing lives in `timeline.ts`, shared by HexMap + useTimelinePlayback).
- **✅ Layers → KDL** (`fe69136` infra + `1fdef3f`; memory `[[strider-layers-kdl]]`). `content/layers/*` are
  now flat **KDL** (op = node name, `slug` positional, `hex q r`/`member` children, `faction=#null`). Parse
  seam keeps `parseChange`+folds unchanged → regenerated `layers.ts` byte-identical (the gate);
  `@bgotink/kdl` build-time devDep; `@astra/content-build` gained `listFilesWithExtension`.
- **✅ Factions → vellum** (`8161283`; memory `[[strider-factions-vellum]]`). `content/factions/*` are now
  **`.vellum`**, one document per faction, rendered build-only via gothic `DocumentView` (no-op crossref);
  member-split/cards gone (personnel = in-document headings); `@astra/vellum-lang` build-time devDep. Plain
  prose renders in gothic mechanical-mode (teal headings). NOT byte-identical — verified visually.
- **✅ Dropped the unused layer `body` field** (`1c51229`): it was parsed/stored/round-tripped but never
  rendered — removed from the schema, `Layer` type, parser/serializer, the 2 files, docs, tests.

### Prior post-migration session — strider map (banner + tithe, COMPLETE + PUSHED + DEPLOYED LIVE)

Two **strider** map "layer changes" added on top of the finished migration, each with its own gotchas memory.

- **✅ Banner / alliance layer change** (`4873609`…`13c2032`, memory `4aa6dfa`). Multiple factions ally and
  combine their land under one **banner** — a new first-class entity `{slug,name,color,symbol?,members[]}`
  with two `Change` ops `banner-form` / `banner-dissolve` (mirroring skein-connect/disconnect; dissolve
  reverts for free). Renders by appending each active banner as a **synthetic pseudo-faction** to the
  faction list, so all the existing pixi fill/hover/click/border-dissolve/flip machinery applies untouched
  (member hexes merge into one banner-colored bloc, inner seams gone). Click → an alliance Modal listing
  constituents; `banner-form` animates as a member→banner color flip; editor `banner` kind (form/dissolve).
  Seed: the **Tri-Faction Concord**. Full facts in `[[strider-banner-alliance-gotchas]]`.
- **✅ Tithe transient event** (`62ddf4e`…`47a6538`, memories `acf4862`/`90b27a7`). A one-shot visual event
  (`{op:"tithe"}`) that **changes no persistent state** — every fold ignores it; it only fires a
  `LayerAnimation`. A wave of flipping purple/black-shader hex tiles **fills** the board center→edge, holds
  briefly (`TITHE_HOLD_MS` 160), then **fades** (`TITHE_FADE_MS` 720). The purple is a **live, animated**
  copy of the page balatro shader (uniform-driven palette, `TITHE_PALETTE`), run as a **filter on a
  container of white flipping tiles, gated by input alpha** (continuous + animated — NOT a baked/tiled
  RenderTexture). Editor `event` kind → `tithe` mode. **Load-bearing pixi v8 gotchas** (filters+masks don't
  compose; RenderTexture-in-ticker is blank; the live-filter recipe; headless-RAF capture caveat) in
  `[[strider-tithe-pixi-gotchas]]`.

---

- **✅ 0013 vellum-frontend COMPLETE — all 7 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
  (`3835dae`(s1)…`f1171fd`(s7)). The **final** 0011–0013 frontend: faerrin's `vellum` (CodeMirror editor +
  Playwright PNG render service) → **two Compose units** — `vellum-frontend` (SSR editor, **10367**) +
  `vellum-render` (Bun+Playwright, **10368**, the **first browser-in-a-container** in astra). Scope+spec
  gates done (`ab04539`/`0dba4ef`/`5bf93b8`); D2/D4/D5 user-locked. Slices: (1) SSR scaffold + the
  `vellum-frontend`/`vellum-render` config namespaces (both schemas); (2) editor port (`ssr:false` route,
  faerrin `src/app/`→`src/domain/editor/` ~verbatim, gothic `--color-*` remap, ⇄ Syntax dropped per D5); (3)
  full-vellum `:::fields`/`:::timeline`/`[[crossref]]` authoring + the R2 SIGIL-sync gate; (4) the render
  service (warm Chromium, egress-block, Semaphore(2), caps, render span); (5) export wiring (same-origin
  `/render` + dev Vite proxy — round-trip verified); (6) deploy (Chromium Dockerfile, sibling-manifest
  ripple, two Compose units, Caddy `vellum.iridi.cc`, **faerrin's `vellum.iridi.cc` decommissioned**); (7)
  the **visual-regression gate** (goldens regenerated against astra-gothic in the pinned `oven/bun:1.3.14`
  container + a `ci.yml` job, 7 fixtures @ 0.000% drift). **Verified live:** both containers healthy,
  containerized Chromium renders a real PNG, SigNoz has spans for both services. **DNS deferred.** Full
  facts in `[[vellum-frontend-0013-gotchas]]`.
- **🔴 LIVE PIPELINE IS RUNNING + VERIFIED END-TO-END (this session, `851c1c6`…`079c045`).** The Dagster
  pipeline (craig→scribe→linguist→akasha→mouthpiece) ran its **first real end-to-end run** on two Craig
  sessions (2026-6-18, 2026-6-22) → both produced complete `episode.mp3` + transcript; the 42 migrated-seed
  transcripts were never reprocessed. Landed: cascade-sensor **backlog adoption** so sensors re-enable
  without sweeping seed (`851c1c6`); four scribe Groq/ffmpeg fixes (`3400c60`/`628bebe`/`97501e7` + the
  s16/480s chunk cap); transient-provider resilience (litellm `num_retries` `56081e6` + mouthpiece
  `RetryPolicy` `19c945c`); **config.kdl now authoritative for the scribe/mouthpiece models** (`93641e9`);
  a **host-side `linguist-commit` systemd timer** that auto-commits+pushes new transcripts AND
  auto-rebuilds+redeploys **akasha-frontend** (`96e0b96`/`079c045`); akasha cutover gates loosened for live
  growth (`ed3c561`). **akasha-frontend is live with the 2 new sessions** (HTTP 200). All in
  `[[pipeline-live-run-gotchas]]`.
  - **✅ mouthpiece-frontend LIVE-PIPELINE INTEGRATION — DONE + LIVE-VERIFIED** (`a472d54`…`7c25d2f`, this
    session, all 5 steps). The frontend now serves the **full 9-episode corpus** (7 migrated historical ∪ 2
    live), and auto-publishes as the pipeline produces more. (1) `discover_sessions` reads the id from
    `script.json` not the date-keyed dir; (2) `astra_mouthpiece.migrate` (`just mouthpiece-migrate-history`)
    seeds faerrin's flat back-catalog into id-keyed dirs, live-precedence + `_dedup_by_id`; (3) `mouthpiece-seed`
    gathers faerrin-historical then astra-live (live overwrites); (4) `astra_mouthpiece.publish` regenerates the
    committed snapshot from the live corpus (9 eps) + the gates went content-agnostic (superset-of-golden floor,
    "exactly one recap"); (5) the `linguist-commit` timer auto-publishes + redeploys mouthpiece-frontend on a new
    episode (deterministic no-op otherwise). Verified live: 10366 healthy, `/episodes.json`=9, SSR home 9 cards
    incl. live "Six Sandwiches", live episode 200 + audio Range 206. Full facts in `[[pipeline-live-run-gotchas]]`.
- **0012 mouthpiece-frontend — COMPLETE: all 6 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
  (`032e107`(s1)…`9639bd5`(s6)). The podcast read-surface (faerrin `face` → SSR TanStack), the **third
  0011–0013 frontend** on the strider/akasha template, healthy on **10366**. Scope+spec gates done
  (`399d5cd` scope, `b223abd` spec). **D1–D3 locked; D4–D7 settled in the spec; D6 REVISED mid-build
  (user-approved): the transcript is INLINED into the manifest** so the frontend is a pure single-artifact
  consumer (the backend already owns `strip_audio_tags` + `episode_title`) — the frontend ports NO helpers.
  - **s1 (`032e107`)** `episodes_index` **backend** asset (D1) — globs `episodes_path/<id>/` → one sorted
    `episodes-index.json`; backend owns ALL shaping (id-parse + `mega.date_sort_key` sort + per-arc
    `episode_no` + arcTitle from `campaign.name` + ffprobe durationMs + audioVersion + the inlined stripped
    transcript). 2 documented refinements over face (materialized-session numbering; deterministic recap-last
    tiebreak). Wired into app `defs` + `dagster/definitions.py`. Tested over the 14 golden fixtures.
  - **s2 (`669b50d`)** scaffold from the akasha SSR shell — SLIM deps (no pixi/d3/pagefind/vellum/ontology),
    config namespace `mouthpiece-frontend` (10366) in kdl+Zod+Pydantic, **new-member Dockerfile ripple
    handled** (5 siblings).
  - **s3 (`ecbfcee`)** build-content reads the committed `apps/mouthpiece-backend/snapshot/episodes-index.json`
    (akasha-snapshot pattern + freshness-gate test) → `src/generated/{episodes,transcripts}.ts` (split) +
    `public/episodes.json` (D7 deep-links). Routes read static modules directly (not `useLoaderData`). Dotted
    `$id` losslessly (Risk 2 ✓).
  - **s4 (`887b961`)** gothic re-skin (D3) — masthead/hero/EpisodeCard grid + episode page + speaker-colored
    transcript (3 fixed hosts).
  - **s5 (`4ab82aa`)** the `Player` island (Solid→React 1:1) — MediaSession/scrubbing/localStorage; the
    live-ref fix for React's stale-closure trap; SSR-renders (no ClientOnly); icon PNGs.
  - **s6 (`9639bd5`)** deploy (D2) — `createSsrServer` `staticMounts` (Range-serving audio), `audio-dir`
    config, `mouthpiece-audio` volume + `just mouthpiece-seed`, Compose @10366 + Caddy block. **Verified
    live:** healthy; /, /episode, /episodes.json 200; `/audio/<id>.mp3` HTTP 206 Range (real 24 MB mp3);
    SigNoz `astra.mouthpiece-frontend` SSR spans.
  **Spec-sanctioned deferrals:** `mouthpiece.iridi.cc` DNS (outward-facing; Caddy block authored + validated,
  no `caddy-reload`); the live ElevenLabs pipeline→audio path (manual seed substitutes); grid summed-runtime
  (durationMs=0 in the committed snapshot — the Player's `loadedmetadata` is authoritative, D5). See
  `[[mouthpiece-frontend-0012-gotchas]]`.
- **0011 akasha-frontend BUILT (Phase 5) — ALL 9 slices DONE + PUSHED** (1–9 pushed; HEAD now `0184ed9`,
  four post-slice-9 CI-fix/docs commits: `34b92c3` 0011-COMPLETE docs, `b72ffd4`/`03f0fcd` build-content-test
  + SSR-smoke fixes, `0184ed9` CI-only-test gotchas). The wiki read-surface + the critical-path long pole — **COMPLETE**, deployed locally
  + verified live. **URL-parity cutover gate GREEN** (217 produced slugs == faerrin's contentIndex EXACTLY).
  akasha-frontend is the **second 0011–0013 SSR frontend** on the strider template. **Scope + Spec gates COMPLETE:** scope
  `thoughts/shared/research/2026-06-21-akasha-frontend-0011-thoughts.md`, spec `thoughts/astra/specs/0011-akasha-frontend-spec.md`.
  Two seams **pre-proven**: **N1** Pagefind via the NodeJS Indexing API over in-memory HTML (no prerender),
  **N3** the gothic **`resolveCrossref`** seam (`f13ed5f`). **Slice 1 (`c165b01`):** scaffolded the SSR app from
  the strider template (config namespace 10365 mirrored in both schemas, the shell + RUM seam + SSR smoke,
  placeholder content source, templated Dockerfile, uv exclude). **Slice 2 (`bff194e`):** lifted `slug.ts`
  **verbatim** + `folderIndex` + `site.ts` (input swapped to a snapshot reader, edges **consumed** per N6,
  `gitModifiedDates`/Astro `entry` dropped); generated site module from the committed `akasha-snapshot.json`.
  **THE PARITY GATE IS GREEN** — 141 snapshot slugs **byte-equal** faerrin's 141 non-Script `contentIndex` slugs.
  **Slice 3 (`67dfbd3`):** TanStack SSR **catch-all `$`** route (content / folder-listing `Foo`+`Foo/index` /
  alias) + `index` (home) + `tags/`+`tags/$` + faerrin 404; **`body[data-slug]`** from `__root` (Graph +
  TranscriptPlayer contract); **build-emit** RSS (`index.xml`), `sitemap.xml`, `/static/contentIndex.json` into
  `public/`→`dist/client` (gitignored); **alias `<meta http-equiv=refresh>` stubs via React 19 head hoisting**
  (NOT a 301 — N2). `runtimeSite.ts` reconstructs SiteData from the generated PAGES (reuses site.ts `indexDocs`);
  site.ts made **node-free** (pure basename, so client/SSR-safe) + `buildAliases` added; ported server components
  (Breadcrumbs/ArticleTitle/TagList/Backlinks/PageList + PageLayout/ContentArticle/FolderListing/TagListing);
  added `public-origin` config (both schemas). Routes verified live via the built SSR handler.
  **Slice 4 (`c58517c`):** **vellum body rendering + crossref hrefs** — **build-time**
  `renderToStaticMarkup(gothic DocumentView)` (in build-content, never the client bundle) with the **N3
  `resolveCrossref`** seam: a per-page resolver maps a `[[crossref]]` node → snapshot `edge.resolved` → `slug.ts`
  → `resolveRelative` href (dangling → placeholder). Baked to `generated/bodies.ts` (`BODIES: slug→{html,minutes}`,
  141 pages incl. folder-index bodies, ~295 KB) + injected via `dangerouslySetInnerHTML` into the slice-3
  `data-pagefind-body` article; **ContentMeta** (committer date + reading-time) wired. **gothic `theme.css @source
  "./"`** added — Tailwind v4 skips node_modules, so a DocumentView consumer shipped gothic's utility classes
  (`flex/gap-5/text-accent/decoration-dotted/…`) UNSTYLED; declaring gothic's own source fixes it for all
  consumers (strider re-verified, gothic tests green). Added `@astra/vellum-lang` dep (1-line lock delta).
  CI-green both lanes (typecheck, **33 fe tests**, build, biome; uv ruff/ty/pytest 180). Verified live:
  `:::handout`/`:::fields`/`:::timeline`/prose/GFM render with resolved crossref `<a data-crossref>` links + folder
  bodies + ContentMeta. **Resume at slice 5:** islands → React (Darkmode keep dark-only FOUC inline script,
  ReaderMode, **Popover** — attaches to the slice-4 `a[data-crossref]` links — Explorer from the generated tree;
  per-island unmount teardown, N5). Remaining 6–9: Graph(M2) → transcripts+player(D4,N7) → Pagefind(N1) →
  URL-parity gate (snapshot ∪ transcripts) + deploy. **Decisions:** SSR (I), consume snapshot edges (N6), port
  `matchCampaign` (N7), committer date (N4), DiceDashboard deferred (M3).
  **Slice 5 (`30d6e47`):** **islands → React** — ported faerrin's 4 Solid islands (Darkmode/ReaderMode/Popover/
  Explorer) + built the full **Quartz 3-column page shell** (PageLayout: left sidebar = PageTitle + Darkmode +
  ReaderMode + Explorer; center; right sidebar = SidebarImage + Backlinks moved out of center) + functional
  gothic-toned CSS. All SSR-render + hydrate; **N5 teardown** = `useEffect` cleanup. **Darkmode** is dark-only
  (gothic ships dark unconditionally) — kept for the click path + `themechange` (Graph subscribes); FOUC pre-paint
  `<html saved-theme="dark">` is an inline head script in `__root`. **Popover** binds to `a[data-crossref]` +
  `a.internal`, fetches the target's `.popover-hint`, floats via **@floating-ui/dom** (new dep), re-binds on route
  change. **Explorer** = recursive tree from generated `EXPLORER_TREE` with **SSR-safe collapse** (seed open-map
  from currentSlug only in `useState` init → first client render matches SSR; localStorage merged in a
  `useEffect`); prefix-of-current auto-open; pure state logic in `explorerState.ts` (tested). CI-green both lanes
  (biome, typecheck, **40 fe tests**, build; uv 180). Verified live: sidebars + islands render, Explorer
  auto-opens the current branch.
  **Slice 6 (`c9ab69b`):** **pixi/d3 force-graph (client-only)** — ported faerrin's Solid Graph island to
  React; the imperative pixi/d3 `renderGraph` body lifted **VERBATIM**, only the shell changed
  (onMount→useEffect, onCleanup→cleanup return, ref locals→useRef). The pure data-shaping (link/tag extract +
  depth-limited neighbourhood BFS + node/link assembly) split into **`graphData.ts`** + unit-tested (4 tests),
  mirroring slice-5's `explorerState.ts`. Mounted in PageLayout's right sidebar behind **`lazy()` +
  strider's `<ClientOnly>`** (copied to `src/components/ClientOnly/`) — NOT PixiHost/usePixi (faerrin's graph
  creates its OWN `new Application()` per local/global graph, unlike strider's shared-context HexMap). So pixi
  (getComputedStyle/WebGPU at setup) never reaches the SSR eval path (Risk 5): SSR renders only the reserved
  `.graph-slot`, the graph hydrates client-side. Reads `/static/contentIndex.json` + `body[data-slug]`;
  re-renders on `themechange`; N5 teardown destroys every pixi app + listener on unmount. **Color reality:**
  faerrin colors nodes by PAGE-STATE (current/visited/tag) via Quartz CSS vars read with getComputedStyle —
  NOT per-entity identity colors (I5 ontology-being colors are a slice-7 transcript-speaker concern). Kept
  verbatim; the Quartz var names (`--secondary/--tertiary/--gray/--light/--lightgray/--dark/--bodyFont`) are
  **shimmed to the gothic void palette as CONCRETE hex** in globals.css (a `var()` ref returns unresolved
  from getComputedStyle in some browsers → pixi can't parse it). biome override for the verbatim
  any/non-null-assert/`useIterableCallbackReturn` (tween/Set forEach callbacks) idioms. Verified live: home +
  /Anzu render 200, `.graph-slot` + `data-slug` present in SSR HTML, **no `<canvas>`/pixi server-side**. CI
  green whole repo (biome, typecheck, **44 fe tests**, build all workspaces).
  **Slice 7 (`97e0cec`):** **transcripts (D4/N7)** — reconstitute faerrin's 76 Script pages from linguist
  `data/*.json` and merge into the site graph. **`matchCampaign`** (faerrin content heuristic, adapted to the
  `@astra/ontology` Campaign shape — flat `Role[]`, `role.player` is a slug → billing re-keyed to display
  name; first campaign past threshold-15 in being order wins → `Script/<campaign>/<date>`, else Unsorted).
  **`linker.ts`** (proper-noun auto-linker, longest-first regex over wiki titles+aliases → resolved
  `<a class="internal">` on HTML-escaped text — no remark chain). **transcriptBuild** server-emits faerrin's
  remark-transcript OUTPUT shape (`audio[data-transcript]` + `.transcript-line` rows). **TranscriptPlayer**
  React-ported VERBATIM (renders null, attaches to SSR markup, never reactive — Risk 2). **Speaker colors
  (I5)** `--text<Name>` + per-speaker rules generated from ontology-being → `SPEAKER_CSS` in `__root`. **N7
  PARITY GATE GREEN: reproduces faerrin's 76 Script slugs EXACTLY (1:1).** **Architecture (load-bearing):**
  transcript bodies are ~115 MB (76 × ~1 MB) — too big for in-bundle BODIES, so code-split one lazy module
  per session + loaded server-side via a `transcriptBody` **createServerFn** (full-page nav → loader runs on
  the server; client bundle stays 2.3 MB, transcripts server-only). contentIndex now 217 (141 wiki + 76 tx) =
  faerrin's 217. CI green whole repo (biome, typecheck, **56 fe tests**, build).
  **Slice 8 (`92d551d`):** **search via Pagefind (N1)** — `scripts/build-search.ts` runs AFTER `vite build`
  (dist/client + generated modules exist) and uses Pagefind's **NodeJS Indexing API** (`createIndex` →
  `addHTMLFile({url, content})` → `writeFiles`) over **in-memory** HTML docs (no prerendered static HTML —
  Decision I): wiki bodies from `BODIES`, transcript bodies from the code-split lazy chunks; writes the full
  `/pagefind/` bundle into `dist/client/pagefind` (static-served). Build-time only (the `build` script — NOT
  typecheck/test, so the pagefind binary + 115 MB never load under vitest). `searchDoc.ts` = pure unit-tested
  doc-shape helpers. **Search.tsx** = React port of faerrin's Solid island (sidebar trigger + Ctrl/Cmd-K modal,
  lazy `import("/pagefind/pagefind.js")` via `@vite-ignore` variable path, debounced `pf.search`, result cards;
  N5 teardown), mounted in the left sidebar; gothic `.search-*` CSS. Search is empty under `vite dev` until a
  build (faerrin's caveat). Added `pagefind` devDep. CI green whole repo (biome, typecheck, **59 fe tests**,
  build). Verified live: pagefind indexed **217 pages (217 fragments)**, `/pagefind/pagefind.js` +
  `pagefind-entry.json` serve 200, the Search button SSRs.
  **Slice 9 (`99f6657`) — DONE (the last slice):** **URL-parity cutover gate + deploy.** `urlParity.test.ts`
  asserts the produced slug set (141 wiki ∪ 76 transcripts) **byte-matches faerrin's full contentIndex keys
  EXACTLY (217, no missing/extra/overlap)** — the cutover gate. Deploy: Dockerfile gained `COPY
  ontology/ontology-being` (loadBeing — else the transcript build throws); `akasha-frontend` Compose service
  (ARG APP, 10365, healthcheck, restart unless-stopped) mirroring strider; `akasha.iridi.cc` Caddy block
  (read-only, no /editor; fonts + /pagefind/ self-serve). **Deployed locally + verified live:** image builds,
  container **healthy on 10365**, serves `/` + `/Anzu` + a transcript + `/pagefind/pagefind.js` +
  `/static/contentIndex.json` + `/tags` (all 200), **restart-survives**; **telemetry confirmed via SigNoz MCP**
  — `service.name=astra.akasha-frontend` SSR spans (incl. `SSR GET /Script/Fae-and-Forest/2025-9-11`, the
  server-loaded transcript route). **Deferred (spec-sanctioned):** the public edge (`just caddy-reload` +
  `akasha.iridi.cc` DNS record — outward-facing, like strider/orator/weal-overlay). CI green whole repo (biome,
  typecheck, **61 fe tests**, build). **0011 is COMPLETE.** See `[[akasha-frontend-0011-gotchas]]`.
- **Deploy now fully healthy (this session's detours):** fixed `just up` end-to-end — the dagster image was
  stale Phase-0 (now `uv sync`s the pipeline workspace from repo root, `4ac8b94`); weal Dockerfiles needed the
  full manifest set after the new member (`33377b3`); and — load-bearing — **built the repo-wide SOPS
  secret-injection** the deploy never had (`just up` decrypts on the host + injects UPPER_CASED env; config's
  env-override resolves in-container — `20195ec`). **weal-bot is now LIVE** (real token). See
  `[[deploy-sops-injection]]`.
- **Phases 0–3 COMPLETE:** substrate + shared libs + the full pipeline (scribe → linguist →
  akasha-backend → mouthpiece-backend), all wired in `dagster/definitions.py`.
- **0010 orator BUILT (Phase 4) — all 9 slices DONE + PUSHED** (`98b5618`…`2c2fd10`; the slice-9 chain pushes
  with this docs commit). orator-backend is **deployed locally + verified live** (container healthy on
  `10363`, serves the SPA + `/api/v1/*` + fonts, survives restart) against the **migrated** library; the
  remaining manual step is the public edge (`just caddy-reload` + an `orator.iridi.cc` DNS record — outward-
  facing, like strider/weal-overlay). Scope+spec at
  `thoughts/{shared/research/2026-06-20-orator-0010-thoughts.md, astra/specs/0010-orator-spec.md}`; decisions
  **M1–M5** locked. Lifting faerrin `lark` → **orator-backend** (Bun Compose service) + merging `birdfeed` →
  **orator-controller** (Node/Elgato). Done: (1) **scaffold** both apps + M1 ontology-derived allowlist; (2)
  **Postgres library store** — lark's 9-table schema SQLite→PG + the async `LibraryStore`/`PostgresStore`
  (sync `bun:sqlite`→async Bun `SQL`) + `orator-postgres` Compose unit (10364); (3) **bot+voice+REST** —
  `@discordjs/voice` adapter + the single-session playback engine + the `/api/v1/*` router/library/playback
  routes; (4) **auth** — OAuth2-identify→signed cookie OR Bearer key, session-gated key mgmt, `lark_`→`orator_`
  rebrands; (5) **ingest** — yt-dlp+ffmpeg+R128 + SSE jobs + upload; (6) **data migrator** — lark.sqlite→PG
  (preserve ids) + audio copy (M2, runs at deploy); (7) **operator UI** (`866463c`) — lark's React SPA →
  **`@tanstack/react-router` client SPA** in `orator-backend/src/web/` (code-based router, no routeTree.gen),
  gothic-skinned (Tailwind v4 via `@tailwindcss/vite`), Vite-built to static `dist/` served by the existing
  `serveStatic`; client RUM via a new **public `/api/v1/rum-config`** route (no `createServerFn` — Start-only);
  a `gothicFontsPlugin` copies fonts → `dist/fonts/` so the static dist is self-contained; (8) **orator-controller**
  (`d14557f`) — birdfeed lifted (nav/grid/tags/svg/color pure logic + controller/Slot/plugin) with the
  **configurable origin** (M4: PI Origin field + `normalizeOrigin(settings.oratorOrigin)`; key minting stays
  server-side, plugin only consumes a pasted `orator_` key); Bearer client + 2500ms now-playing poll +
  collection→tag nav (5 named tags + "other") preserved; rollup bundles `bin/plugin.js` (not CI-gated);
  (config scrub `8157a42`) **config-single-source** — dropped the migrator/entrypoint env overrides, kdl now
  holds the real deploy values (port 10363, public-origin, new `data-dir`; mirrored in BOTH config schemas);
  (9) **deploy** (`8b937ca`) — orator-backend Dockerfile (Vite-builds the SPA; ffmpeg+yt-dlp on PATH; davey is
  a **prebuilt napi** module, no compile; all app manifests copied so `--frozen-lockfile` reconciles the shared
  lock), Compose `orator-backend`@10363 + `orator-audio` volume@`/data` (zero config env), Caddy
  `orator.iridi.cc` (self-serves fonts, SSE `flush_interval -1`). **Verified live:** image builds; `docker
  compose config` + `caddy validate` pass; the **M2 migrator RAN** (87 tracks/1 coll/5 tags/87 audio, 0
  missing, loudness preserved, `file_path`→`/data/audio`); orator-backend boots healthy, serves SPA+API+fonts,
  survives restart. Found+fixed a real PG bug en route (`2c2fd10` `listJobsByStatus` — Bun `SQL.unsafe` array
  param → `= any($1)` "malformed array literal"; expand to `in (…)`). **Deferred (spec-sanctioned):** the public
  edge (`just caddy-reload` + `orator.iridi.cc` DNS — outward-facing/manual) + live Discord run (SOPS token) +
  the physical Stream Deck hardware test. CI green both toolchains (121 backend + 36 controller tests). See
  `[[orator-0010-gotchas]]`.
- **0009 weal BUILT (Phase 4) — first bun *service*.** Scope+spec at `thoughts/{shared/research/
  2026-06-20-weal-0009-thoughts.md, astra/specs/0009-weal-spec.md}`. Six CI-green slices (`c40a026`…
  `21d1f18`; last `21d1f18` deploy-wiring is the only UNPUSHED commit): (1) **roller** hand-ported
  faithfully + the **K1 parity harness** (parse/eval-given-faces/plot/property + a serde-codec
  round-trip on the 10 real `mouth.db` `funcs` payloads — the gate); (2) **hosts** — GSR/Rex/Els/
  Whiskers flavor banks lifted into `ontology-being` `weal-host` `lines{}` (py+ts model+reader,
  canonical-JSON parity holds); GSR-only but host-swappable (K8); (3) **Postgres** store + `save_die`
  guards + dedicated `weal-postgres` Compose unit (K9); (4) **discord.js gateway** — full message
  pipeline tested dry via injected deps (acceptance D), I/O shell (gateway/speak/index) typechecked;
  (5) **weal-overlay** — eerie lifted (Bun.serve SPA+SSE, K7), v1-only schema, gothic v4 re-consume,
  client RUM; (6) **deploy** — both Dockerfiles + Compose units + overlay Caddy block (`flush_interval
  -1`). **weal-bot is LIVE** (real SOPS token). **SQLite→PG data migration DONE** (2026-06-23): 8,932 dice +
  10 funcs migrated from `mouth.db` into weal-postgres, ids/player_ids preserved, sequence reset (the 36 live
  rows were truncated first, user-approved). Only remaining nicety: webhook rotation. See
  `[[weal-0009-gotchas]]`.
- **strider (0014) COMPLETE + PUSHED + DEPLOYED LIVE.** The first `apps/*` TS frontend and the canonical
  **SSR-Compose-behind-Caddy template** for 0011–0013. All on `origin/main`. The 7 build slices (`fedd4b8`
  …`a91a72b`): build-content+data-model, pixi hexmap, MapView+routes, editor, SSR Compose deploy
  (`server.ts`/Dockerfile), server `observe`+client RUM. Then this session hardened + shipped it:
  - **Styling fix** (`abbf017`) — the scaffold never wired `@tailwindcss/vite`, so gothic's `@theme`/`@apply`
    shipped raw (black text, no panel bg); add the plugin + the missing `public/` assets.
  - **RUM lib** (`171f28d`) — browser RUM extracted to **`@astra/observe/web`** (`initRum`); frontends import
    it, the `createServerFn` config seam stays per-app.
  - **Host edge** (`e6b3878`, `9374fb4`, `a9a0bf4`, `6a0fdaf`, `15aab1a`) — root **`sites.caddyfile`** is the
    real prod edge (the compose Caddy was dropped): `strider.iridi.cc` (SSR), `otel.iridi.cc` (browser-RUM
    OTLP ingest, CORS for `*.iridi.cc`), `signoz.iridi.cc` (UI). Fonts served from gothic via Caddy (no
    vendored copies; dev middleware for parity). `/editor` + `signoz` gated **local-only**. CF token from
    SOPS via `just caddy-reload`.
  - **Editor → server fn** (`9b87a1b`) — the editor write is now a **`createServerFn`** in the one SSR
    process (the sidecar/`editor-server` is gone). This stack (react-start 1.168) has **no file server
    routes** — `createServerFn` is the server primitive (see `[[tanstack-start-skill]]`).
- **Tooling:** `just up` (rebuild+recreate the stack), `just down`, `just caddy-reload`/`caddy-validate`.
  Apply deploy/edge changes with these — `[[deploy-apply-with-just]]`.
- **Live + verified:** `astra-strider` healthy; the edge serves `/`, `/editor` (local), `/fonts/*`,
  `signoz.iridi.cc` (all 200 via the loopback edge test). **Open:** `otel.iridi.cc` needs a **DNS record**
  before browser RUM spans actually land in SigNoz (cert + reachability); the write server fn isn't itself
  IP-gated (only the `/editor` UI is — **accepted won't-fix**, `[[strider-editor-auth-accepted]]`).
- **strider HARDENING (spec 0016) — COMPLETE: all 7 slices BUILT + PUSHED + LIVE-VERIFIED** (`68fcff0`…`0aaae5f`).
  Readies strider as the *copy* template per the 2026-06-21 review
  (`thoughts/shared/research/2026-06-21-strider-template-review-thoughts.md`); spec
  `thoughts/astra/specs/0016-strider-hardening-spec.md`. **NB renumber:** drafted/committed as "0015" but
  `0015` is the reserved **cutover** plan, so the spec is **0016** (early commit messages still say 0015;
  6b onward use 0016). Done + pushed: (1) idiom/correctness — frontend `verbatimModuleSyntax:false`, router
  error/not-found boundaries, `/editor` `ssr:false`, dead-code + the misapplied `noFocusedTests` ignore;
  (2) tests — `build-content` parsers, `writeLayer` guards, an SSR render smoke (`scripts/ssrSmoke.ts` via
  `src/ssrSmoke.test.ts`, builds-if-needed) + `ssr.fetch`-exists insurance; (3a) one source of hex geometry
  (`hexCorners`/`HEX_SIZE`/`HEX_NEIGHBORS` in hexUtils; pixiScene derives); (3b) shared region paint + skein
  helpers (`mapPaint.ts`, `connKey`/`connectionEndpoints` in skeinGeometry, `strokePolyline` in pixiScene);
  (4) perf — incremental hex updates (reuse unchanged / recreate changed → flip contract intact) + reused
  hover GlowFilter (pixi-filters subpath = 0 B; rollup already tree-shakes); (5) observability — `writeLayerFn`
  traced (span+counter+log), `@astra/observe` preload flushes on SIGTERM/SIGINT, dropped dead CONTENT_HASH,
  rewrote stale layer docs to SSR/server-fn; (6a) extracted **`@astra/content-build`** (generic markdown→
  modules pipeline + `defineContentSource`/`buildContent`), strider consumes it. All CI-green locally;
  **renderer changes (3–4) visually verified in dev.** Nitro+bun migration deferred (non-nightly).
  **6b DONE + PUSHED + LIVE-VERIFIED** (`a03f06c`, `0ac2cec`): extracted **`libs/ts/site-kit`**
  (`createSsrServer`, `startRum` on `./web`, `contentWatchPlugin`/`gothicFontsPlugin`/`generateRouteTree`,
  `loadSiteConfig`); `strider { service-name; port }` in **config.kdl** mirrored in both schemas; Dockerfile
  `ARG APP`; **fonts now self-served from the container** (build copies → `dist/client/fonts`; dropped Caddy
  `gothic_fonts`). **Load-bearing:** importing a workspace TS pkg from `vite.config` needs vite
  `--configLoader runner` (added to dev/build); createServerFn stays in app source; the build stage must COPY
  `ontology/ontology-config`. Live re-verified via the edge (`:2651`, not 443). **Found a pre-existing telemetry
  gap (not a 6b regression):** containers export to `otlp-endpoint=localhost:10353` which is unreachable
  in-container (collector = `signoz-otel-collector:4318`); server-side SSR spans for strider/orator/weal never
  land — its own cross-cutting fix. See `[[strider-0016-gotchas]]`.
  **7 DONE** (`0aaae5f`): split `apps/strider/src` into a thin shell vs **`src/domain/`** (47 renames; the
  faction/hex/skein/editor domain relocated, shell = generic components/hooks + observe + router/routes) +
  `apps/strider/README.md` port recipe. biome.json lint-override globs repointed to `src/domain/`.
  **Telemetry endpoint FIXED** (`ee8f831`): OTLP → `signoz-otel-collector:4318` (in-cluster); `astra.strider`
  SSR spans now land in SigNoz (also fixes orator/weal/Dagster on redeploy). Live re-verified after both.
  **0016 is COMPLETE — no open items.** See `[[strider-0016-gotchas]]`.

### 🎉 MIGRATION COMPLETE — Phases 0–6 all done (2026-06-23)

**The faerrin → astra migration program (`0000`–`0015`) is finished. astra is the campaign's live stack.**
Phase-6 cutover (`0015`) is **COMPLETE**: every public host serves astra
(strider/akasha/mouthpiece/orator/vellum/weal-overlay/dagster `.iridi.cc` all 200, `otel` OTLP ingest
reachable); the Dagster pipeline runs live + verified e2e; the bots/services are live Compose units with
SigNoz traces; the data migrations are done (weal roll history 8,932+10, orator library, the akasha/mouthpiece
content corpora — ids/player_ids intact); faerrin's `strider.iridi.cc` + `vellum.iridi.cc` blocks
decommissioned in-repo.

**No remaining migration work.** Standing leftovers are by-design or optional, NOT blockers:
- strider editor write-endpoint auth — **accepted won't-fix** (`[[strider-editor-auth-accepted]]`).
- Nitro+bun preset migration — deferred until TanStack Start is non-nightly.
- weal webhook rotation — acknowledged nice-to-have (the user opted to skip it).

Future work is now ordinary product/ops on the live stack, not the migration. (Historical per-subsystem build
notes are retained below for reference.)
2. **0013 vellum-frontend — COMPLETE** (all 7 slices built + pushed + deployed-local + verified live; the
   editor on 10367 + the render service on 10368; containerized Chromium renders PNGs; SigNoz spans for both;
   the VR gate is green in the pinned container). **NOW FULLY LIVE on `https://vellum.iridi.cc`** (DNS set +
   `just caddy-reload` applied 2026-06-23 — `/`+`/editor` 200, `/health` ready, `POST /render` returns a real
   PNG through the public TLS edge). **No open items** — the first 0011–0013 frontend taken all the way to the
   public edge. See `[[vellum-frontend-0013-gotchas]]`.
3. **0012 mouthpiece-frontend — COMPLETE** (all 6 slices built + pushed + deployed-local + verified live on
   10366; audio Range-serves, SigNoz SSR spans). Only open item = the manual `mouthpiece.iridi.cc` DNS edge
   (outward-facing; Caddy block authored + validated). See `[[mouthpiece-frontend-0012-gotchas]]`.
3. **0011 akasha-frontend — COMPLETE (all 9 slices built + PUSHED).** Deployed locally + verified live (healthy
   on 10365, telemetry in SigNoz), URL-parity cutover gate GREEN. **Only open item = the manual public edge**
   (`just caddy-reload` + an `akasha.iridi.cc` DNS record — outward-facing, like strider/orator/weal-overlay;
   the Caddy block is authored + in `sites.caddyfile`). See `[[akasha-frontend-0011-gotchas]]`.
3. **Frontends 0012–0013** (mouthpiece-fe, vellum-fe) — the strider SSR template copy; 0011 is a second worked
   example alongside strider (esp. build-time content + the createServerFn server-only-data pattern + Pagefind).
   **READ FIRST:** `apps/strider/README.md` + `apps/akasha-frontend` (Dockerfile/compose/Caddy + build-content),
   the migration guide, `[[strider-0016-gotchas]]`, `[[akasha-frontend-0011-gotchas]]`.
3. **Phase 4 services DONE** — 0009 weal + 0010 orator both **BUILT** (deployed-local; public edge + live
   Discord run deferred on SOPS/DNS). **strider 0016 COMPLETE** — the copy-ready template.
4. **Phase 6 cutover** (plan `0015-cutover.md`) big-bang, last — needs frontends 0012–0013 first.

**Frontend gotchas (template — full list in `[[astra-migration-research]]`):** SSR (no `prerender` block);
commit `src/routeTree.gen.ts` (biome-ignored); `vite.config` is ESM and **cannot import `@astra/config`**;
**wire `@tailwindcss/vite`** + ship `public/` (favicon, symbols) or gothic styling is dead; gothic v4
`--color-*` token rename on lifted CSS + Caddy `gothic_fonts` serves the webfonts; pixi behind
`lazy()`+`<ClientOnly>`; server-side endpoints = **`createServerFn`** (no middleware — `[[tanstack-start-skill]]`);
client RUM = `@astra/observe/web`; new `apps/*` TS dir → add to `pyproject.toml` `[tool.uv.workspace]` `exclude`.

---

*Start by reading the orient docs, then pick up at the "Next" item above.*
