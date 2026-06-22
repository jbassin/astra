---
name: akasha-frontend-0011-gotchas
description: Building akasha-frontend (0011) — the wiki read-surface; SSR strider-template port of faerrin aether, scope+spec done, slices 1–6 built (scaffold, slug/site lift, routes+static emits, vellum render+crossref, islands+page shell, client-only pixi/d3 graph)
metadata:
  type: project
---

Porting faerrin `aether` (Astro 5 SSG + 8 Solid islands, a Quartz port) → **akasha-frontend**, an SSR
TanStack-Start site on the strider template. **Scope+Spec gates done; slice 1 of 9 built+pushed (`c165b01`).**
Scope `thoughts/shared/research/2026-06-21-akasha-frontend-0011-thoughts.md`, spec
`thoughts/astra/specs/0011-akasha-frontend-spec.md`. The critical-path long pole; `[[migration-guide]]` +
`apps/strider/README.md` are the recipe; pairs with `[[strider-0016-gotchas]]`, `[[tanstack-start-skill]]`.

**Load-bearing reframings (the sub-plan 0011 was drafted pre-Decision-I and is stale on these):**
- **SSR, not static prerender.** No `dist/` HTML on disk → faerrin's `astro-pagefind`-over-built-HTML is dead.
- **No remark chain.** The wiki body is already vellum (akasha-backend converted it); **gothic's `DocumentView`
  renders the whole vellum union today** (handout/edict/fields/timeline/columns/GFM). Wiki render = ~0 code.
- **Transcripts are a SEPARATE artifact, merged into the page graph.** faerrin baked 76 `Script/*.md` into the
  wiki; the akasha corpus **excludes Script (0 pages)** — 141 corpus = 217 faerrin md − 76 Script.
  akasha-fe reconstitutes them from linguist `data/*.json` (77 files) at `Script/<campaign>/<date>` slugs and
  **merges into the URL set / edges / backlinks / Explorer**. The parity gate covers BOTH sets.

**The two seams already de-risked (don't re-spike):**
- **N1 Pagefind:** use `pagefind`'s **NodeJS Indexing API** (`createIndex`→`addHTMLFile({url,content})`→
  `writeFiles`) over in-memory rendered HTML at build → writes the full `/pagefind/` bundle (incl.
  `pagefind.js`); serve it static. Client Search island unchanged. No prerender.
- **N3 crossref→href:** gothic landed an optional **`resolveCrossref` context resolver** on `<DocumentView>`
  (`f13ed5f`). akasha-fe supplies `node → snapshot.edges[source,target].resolved (page-path) → slug.ts → href`.
  A hit renders `<a href>`; null/no-provider → placeholder (gothic L6 default unchanged).

**Locked decisions (set with the user 2026-06-21):**
- **N6:** consume the snapshot's parity-gated `edges` (don't re-derive in TS via lifted `site.ts`'s extractor).
- **N7:** **port `matchCampaign`** (faerrin `pkg/content/scripts/lib/campaigns.ts` — a content heuristic:
  character-name hits past `matchThreshold`; `Unsorted/` fallback) so new Dagster sessions auto-route forward;
  also lift the **billing** (player→character) for the name-toggle. Guard with a parity test vs faerrin's
  captured historical `Script/` paths (a fixture, NOT runtime data).
- **N4:** accept committer date (`%cI`, baked by 0007 M3); no parity churn. **N2:** emit RSS/sitemap/
  contentIndex + alias `<meta refresh>` stubs at build (static, served by the SSR handler). **N5:** islands now
  need per-unmount teardown (faerrin was MPA; astra is SPA). **N8:** read snapshot/corpus across the workspace;
  Dockerfile COPYs them at build. **M3:** DiceDashboard deferred (not v1).

**Data contracts (build-time inputs):** akasha snapshot `apps/akasha-backend/snapshot/akasha-snapshot.json`
(`{pages[{path,date,frontmatter,crossrefs}], edges[{source,target,resolved,heading,alias}], unresolved[]}`,
141 pages) + the `.vellum` corpus (render via `@astra/vellum-lang` `parseDocument` + gothic). linguist
`apps/linguist/data/{date}.json` = `{date, audio (external static-audio URL), script:[{start,second,text,
user:{name,color},duration}]}`. Speaker `color` is a **CSS var NAME** (`--textJorge`); the hex **values** live
in `ontology-being` `being.kdl` (player colors + `guest-color`, I5) — define the `--text<Name>` vars from there.

**Verbatim lifts (URL parity is the hard invariant — don't "improve" them):** `slug.ts` (240 LOC, dep
`github-slugger`, zero Astro — drop-in). `site.ts` (436 LOC) lifts with ONE input swap (`getCollection("docs")`
→ snapshot reader) + **delete `gitModifiedDates()`** (dates pre-baked) + consume snapshot edges (N6). The
TranscriptPlayer attach (faerrin `TranscriptPlayer.tsx`) ports **verbatim into a `useEffect`** — it renders
NOTHING, attaches to SSR-emitted `.transcript-line`/`audio[data-transcript]` markup (delegated click +
precomputed `seconds[]` binary search + single-root-class filter). **Never make it reactive** (1.2–1.6 MB pages).
The `<body data-slug>` attr is a load-bearing contract (Graph + TranscriptPlayer read it).

**Slice-2 lift facts (done, `bff194e`):** `slug.ts` lifts to `src/domain/lib/slug.ts` — but faerrin's
`astro/strict` is LOOSER than astra's base tsconfig (`noUncheckedIndexedAccess: true`), so the lift needs
**type-only** fixes at guarded index-access sites (`as FullSlug`, `?? ""`, destructure `as [string, string|
undefined]`) — runtime logic unchanged. biome reformats it to astra style + a `useTemplate: "off"` override in
`biome.json` marks the verbatim `+` concatenations (Quartz style). `site.ts`'s `buildSite(snapshot)` appends
`.md` to each snapshot `path` so `slugifyFilePath`/`basename` behave byte-identically to faerrin (`rel` had the
ext). **Parity gate** (`src/domain/lib/site.test.ts`): the authoritative fixture is faerrin's shipped
`contentIndex.json` keys (217 = 141 non-Script + 76 Script), filtered to the 141 non-Script, sorted →
`__fixtures__/faerrin-slugs.json`; the test asserts akasha-fe's 141 snapshot slugs (FullSlug form, folder
indexes end `/index`) byte-equal it. Generated module = `PAGES`/`EXPLORER_TREE`/`ALL_TAGS`/`ALL_FOLDERS` (Date→
ISO string, Maps rebuilt at runtime in slice 3). N6 caveat: `links` come from snapshot `edges` (resolved!=null
only) — may differ slightly from faerrin's link set (which included dead absolute edges); the SLUG gate is
unaffected, but the graph/backlink parity is a slice-4 check.

**Slice-6 facts (done, `c9ab69b`) — client-only pixi/d3 force-graph:** ported faerrin's Solid `Graph.tsx`
island to React. **faerrin's graph does NOT use strider's PixiHost/usePixi shared-context pattern** — it
creates its OWN `new Application()` inside `renderGraph` per local/global graph, so I only needed strider's
`<ClientOnly>` wrapper (copied verbatim to `apps/akasha-frontend/src/components/ClientOnly/ClientOnly.tsx`),
not PixiHost/pixiContext. **Mount = `lazy()` + `<ClientOnly>` + `<Suspense fallback={null}>` in PageLayout's
right sidebar** (so it's on every page — ContentArticle/FolderListing/TagListing all route through PageLayout):
pixi's static `import` lives only in the lazy chunk, ClientOnly returns null on the server, so the lazy import
never fires during SSR → pixi (getComputedStyle/WebGPU at setup) never evaluates server-side (Risk 5). The
build emits a 19 KB server Graph chunk (shell only) + a 349 KB CLIENT Graph chunk (pixi) — confirm pixi is in
the CLIENT chunk. **The imperative `renderGraph` body is VERBATIM**; only the shell changed: Solid
`onMount`→`useEffect([])`, `onCleanup`→the effect's cleanup return, `let xRef`/Solid `ref={xRef}`→`useRef` +
`xRef.current`. Capture `globalIcon.current` into a local at effect-run for symmetric add/removeEventListener.
**Pure-logic split (testable, like slice-5 `explorerState.ts`):** the link/tag extraction + depth-limited
neighbourhood BFS + node/link assembly → `graphData.ts` `buildGraphData(data, slug, cfg)` (no DOM/pixi → unit-
testable under jsdom; pixi/WebGL can't run there). **COLOR REALITY (don't "fix"):** faerrin colors nodes by
PAGE-STATE — current page=`--secondary`, visited|tag=`--tertiary`, else=`--gray`; tag fill=`--light` — read
from Quartz CSS vars via `getComputedStyle`, NOT per-entity identity colors. I5 ontology-being colors are the
slice-7 transcript-SPEAKER concern, not the graph. So the spec's "graph colors from ontology-being" is a loose
paraphrase; the verbatim-port rule governs → kept page-state coloring. **Quartz var shim (load-bearing):** the
graph reads `--secondary/--tertiary/--gray/--light/--lightgray/--dark/--darkgray/--bodyFont`; define them in
`globals.css :root` as **CONCRETE hex** mirroring gothic tokens (#6dd5c0/#f0b46e/#7a8a99/#090c10/#1e2730/
#dce8f0/…) + `"Caslon Antique", serif` — **NOT `var(--color-*)`**, because `getComputedStyle().getPropertyValue`
on a custom prop can return the unresolved `var()` ref (not the substituted value) in some browsers and pixi
then can't parse the color. `.graph-slot { min-height: 290px }` reserves the column server-side (no hydration
layout shift). Re-renders on the `themechange` CustomEvent the Darkmode island dispatches; **N5** teardown
destroys every pixi app (`app.destroy()`) + every listener on unmount (+ the async-abort `disposed` guard, kept
verbatim). **biome override** (`Graph.tsx`+`graphData.ts`): `noNonNullAssertion`+`noExplicitAny`+
`useIterableCallbackReturn` off (the last for the verbatim tween `tg.getAll().forEach(tw=>tw.start())` + `Set`
`forEach(x=>set.add(x))` callbacks that return a value). **Deps added to akasha's package.json** (pixi.js ^8.18.1,
d3-{force,zoom,drag,selection} ^3, @tweenjs/tween.js ^25 + @types/d3-*) — NO new workspace member, so the four
service Dockerfiles' manifest-COPY lists are unchanged; `bun install` updates `bun.lock` and the frozen-lockfile
Dockerfiles reconcile. **Verified live:** home + /Anzu render 200; `.graph-slot` + `data-slug` present in SSR
HTML; `.graph`/`Graph View`/`global-graph-icon`/`<canvas>` ABSENT server-side (client-only confirmed).

**Slice-5 facts (done, `30d6e47`) — islands → React + the page shell:** ported faerrin's 4 Solid islands to
React (`src/domain/components/islands/`): Solid `onMount/onCleanup` → `useEffect` + cleanup return (**N5** unmount
teardown). All SSR-render + hydrate (no `<ClientOnly>` needed — none touch WebGL; that's Graph/slice 6). **Darkmode
is dark-only** (gothic ships the dark palette unconditionally) — the OS prefers-color-scheme listener is omitted,
the button hidden (CSS), kept only for the click path + the `themechange` CustomEvent the Graph island subscribes
to; the FOUC pre-paint `<html saved-theme="dark">` is an **inline `<script dangerouslySetInnerHTML>` in `__root`'s
`<head>`** (before HeadContent, runs pre-hydration). **Explorer SSR-safe collapse pattern (important):** seed the
open-map from `currentSlug` ONLY in `useState(() => …)` (NO localStorage) so the first client render byte-matches
SSR, then apply saved state in a `useEffect` — reading localStorage during render = hydration mismatch. Prefix-of-
current auto-open uses `simplifySlug` segment-boundary match; pure logic (`folderSlugs`/`isPrefixOfCurrent`/
`computeOpen(tree,currentSlug,saved)`) lives in `explorerState.ts` (testable without router/DOM). `currentSlug`
comes from `useRouterState` (deepest match's `loaderData.slug`, same selector as `__root`'s data-slug). **Popover**
binds to **`a[data-crossref]` (gothic crossref links) + `a.internal`** (our backlink/tag/breadcrumb/listing links),
fetches the target + extracts its `.popover-hint`, floats via **@floating-ui/dom** (new external dep, 7-line lock
delta); re-binds in a `useEffect([pathname])` (the dep is a re-run TRIGGER, not read in the body → needs a
`biome-ignore useExhaustiveDependencies`). **PageLayout** is now the full Quartz 3-column grid (`#quartz-body`):
left sidebar (PageTitle + Darkmode/ReaderMode + Explorer), center, right sidebar (SidebarImage + **Backlinks moved
out of the center**), Popover mounted once. Wrote **functional gothic-toned CSS** in `globals.css` (grid, explorer
tree/collapse via `.folder-outer`/`.folder-outer.open`, popover card, tag/breadcrumb/listing chrome, reader-mode
sidebar fade, 1-col mobile) — NOT a port of faerrin's Quartz custom.scss (akasha is gothic-skinned). **biome a11y:**
a clickable chevron must be a `<button>` (not `<svg onClick>` → `useKeyWithClickEvents`); `aria-expanded` only on
button-role elements (not a bare div → `useAriaPropsSupportedByRole`); use `<nav>` not `<div role="group">`
(`useSemanticElements`). **Navigation is full-page `<a href>` throughout** (gothic crossrefs are plain `<a>`, so
mixing TanStack `<Link>` client-nav would be inconsistent) — islands still implement N5 cleanup for correctness.
Graph (slice 6) + Search (slice 8) join the sidebars in their slices; TableOfContents is out of v1 scope (not in
the 7-island acceptance set).

**Slice-4 facts (done, `c58517c`) — vellum body render + crossref hrefs:** the wiki body renders at **BUILD
time**, not runtime — `build-content` (under bun) calls `renderToStaticMarkup(<DocumentView document=
parseDocument(vellum) resolveCrossref=…/>)` and bakes the HTML string per page into `src/generated/bodies.ts`
(`BODIES: slug→{html,minutes}`, 141 pages incl. folder-index bodies, ~295 KB); the route injects via
`dangerouslySetInnerHTML` into the slice-3 `data-pagefind-body` article. Build-time (not runtime DocumentView)
keeps react-dom/server + gothic's renderer + vellum-lang OUT of the client bundle, matches faerrin's SSG-baked
pages, and lets the slice-5 Popover attach to the static `a[data-crossref]` links via DOM (no React body needed).
**N3 resolver** (`crossref.ts`, build-only): per source page-path, map a `[[target#heading]]` node → the snapshot
edge `(source,target,heading).resolved` (the parity-gated SSOT, N6) → `slugifyFilePath`→`simplifySlug`→
`resolveRelative(sourceSlug, destSimple)` href; `resolved==null` (dangling) → return null → gothic keeps the
placeholder span. **`renderBody.tsx` is build-only** (imported only by build-content) — never a route/runtime
import, so the heavy deps stay out of the client bundle; needs `@astra/vellum-lang` as a dep (added; 1-line lock
delta — all 4 service Dockerfiles already COPY akasha's manifest). **LOAD-BEARING gothic fix:** gothic's React
components carry **Tailwind utility classes** (DocumentView `flex flex-col gap-5 font-body text-ink`, CrossRef
`text-accent underline decoration-dotted`), but **Tailwind v4 auto-detection skips `node_modules`** (+ gitignored
`src/generated`), so a consumer rendering DocumentView shipped those classes **UNSTYLED** (only gothic's
hand-written `.gothic-prose`/`.gothic-card` CSS in theme.css survives). Fix = **`@source "./"` in gothic
`theme.css`** (right after `@import "tailwindcss"`) — forces Tailwind to scan gothic's own source from wherever
theme.css is imported, generating exactly the utilities gothic emits. This is the template fix (mouthpiece-fe/
vellum-fe will hit it too); strider was the first gothic consumer but only used PRIMITIVES (hand-written CSS), so
it never tripped it — re-verified strider builds + gothic tests green after the change. **ContentMeta** (date +
reading-time) was deferred from slice 3 (needs the body); reading-time = `Math.max(1, ceil(words/200))` from raw
source (display parity not required, N4). Dropped faerrin's `show-comma="true"` attr (non-standard → fails strict
TSX; cosmetic CSS hook, re-add typed if the custom.scss port needs it). **Popover island = slice 5** (the
resolved links already carry `data-crossref-*` it attaches to — not a scope cut, the spec lists Popover under the
slice-5 island set).

**Slice-3 facts (done, `67dfbd3`) — routes + static emits:** faerrin's catch-all `[...slug].astro` (which
emitted content + folder + alias) ports to a TanStack **splat `$.tsx`** route (param `_splat`); `index.tsx` owns
`/` (home = content slug "index"); tags get their own `tags/index.tsx` (all-tags) + `tags/$.tsx` (per-tag,
hierarchical) — TanStack ranks the literal `tags` prefix above the root splat. **URL→slug mapping** (faerrin
`build:{format:"file"}`, `trailingSlash:"ignore"`): content `Foo/Bar`→`/Foo/Bar`; folder-index `Foo/index`→
served at **both `/Foo` and `/Foo/index`** (Astro emitted `Foo/index.html`) — so `resolvePath` checks content,
then `FOLDER_SET.has(slug)`, then `slug.endsWith("/index")`. **`runtimeSite.ts`** reconstructs a queryable
`SiteData` from the generated `PAGES` (reusing site.ts's extracted **`indexDocs`** — same backlink semantics as
the build) and exposes serializable **view models with pre-resolved hrefs** (components stay dumb; loaders return
plain data, dates as ISO strings). **site.ts made node-free** (replaced `path.basename` with a pure `baseStem`)
so it's safe in the SSR **and client** bundle — TanStack re-runs loaders on client nav, so loader-imported code
must not pull `node:*`. **Aliases:** `buildAliases` (ported from getStaticPaths) bakes an `ALIASES` map; the
catch-all renders a **`<meta http-equiv="refresh">` stub via React 19 head hoisting** (render `<title>`/`<link
rel=canonical>`/`<meta>` in the component → React 19 hoists to `<head>`), NOT a server 301 (N2 — Popover
fetchCanonical + bookmarks). **Static endpoints** (RSS/sitemap/contentIndex) are emitted by build-content into
**`public/`** (vite copies `public/`→`dist/client`, where createSsrServer static-serves them; a `public/.gitignore`
keeps the generated ones out of git but tracks `favicon.svg`) — there are NO file server routes in the pinned
react-start, so "static" = real files, not endpoints. **`body[data-slug]`** is set in `__root` via
`useRouterState` reading the deepest match's `loaderData.slug` (every route returns `slug`). **Config:** added
`public-origin` (the RSS/sitemap absolute base URL) to the akasha-frontend block + BOTH schemas; build-content
reads it via **site-kit `loadSiteConfig()`** (node-safe — `@astra/config`'s `loadConfig()` needs Bun's
`import.meta.dir`, undefined under vitest). **Dates** formatted with `timeZone:"UTC"` (deterministic SSR↔client,
no hydration drift; exact faerrin day not required — N4). **Deferred to slice 4:** ContentMeta (needs body) +
the vellum article body (the `data-pagefind-body` container ships empty); sidebars/islands = slice 5.

**Slice-1 scaffold facts:** config namespace `akasha-frontend { service-name "astra.akasha-frontend"; port
10365 }` → Zod key `akashaFrontend`, Pydantic `akasha_frontend` (kdl kebab auto-maps); **mirror in BOTH
schemas + spot-check tests**. Adding the workspace member: ran `bun install` (updates `bun.lock`), then added akasha's manifest to
**ALL FOUR** frozen-lockfile service Dockerfiles — strider, orator-backend, **weal-bot, weal-overlay** (else
their `bun install --frozen-lockfile` fails "lockfile had changes": the root `apps/*` glob resolves the full
workspace, so any new member must appear in every service's manifest-COPY list — weal's two used a minimal
single-manifest pattern and broke `just up` until brought up to the full set). Added `apps/akasha-frontend`
to `pyproject.toml` uv `exclude`. `src/generated/` gitignored; `src/routeTree.gen.ts` committed (biome-ignored).
Standard frontend gotchas still apply: vite `--configLoader runner` (to import `@astra/site-kit` from
vite.config), `@tailwindcss/vite` (or gothic styling ships raw), pixi behind `<ClientOnly>`, `createServerFn`
stays in app source. **OTLP must be the in-cluster collector** (`signoz-otel-collector:4318`), not localhost.
