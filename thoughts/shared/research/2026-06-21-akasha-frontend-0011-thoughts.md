---
date: 2026-06-21
subsystem: akasha-frontend
plan: 0011
phase: 5
status: scope (pre-spec) — verified against the live repos
author: octo:auto → parallel research agents → synthesis
sources:
  - /ruby/data/experiments/faerrin/pkg/aether (source app — Astro 5 SSG + 8 Solid islands)
  - /ruby/data/experiments/faerrin/pkg/content (wiki corpus + the transcript exporter/linker)
  - /ruby/data/experiments/astra/apps/akasha-backend (the build-time snapshot)
  - /ruby/data/experiments/astra/apps/linguist (transcript data)
  - /ruby/data/experiments/astra/apps/strider (the SSR template)
  - /ruby/data/experiments/astra/libs/ts/{gothic,site-kit,content-build,vellum-lang}
  - /ruby/data/experiments/astra/ontology/ontology-being (identity colors, I5)
supersedes_in_plan:
  - "0011 §2/§3 'static prerender → dist/' — STALE; Decision I = SSR Compose service, no prerender"
  - "0011 §3.1 'remark chain port' — the wiki body is already vellum; gothic renders it. No remark chain."
---

# akasha-frontend (0011) — Scope / pre-spec research

> **The wiki read-surface.** Rewrite faerrin's `aether` (Astro 5 SSG + 8 Solid islands) as astra's
> **akasha-frontend** — a **TanStack Start SSR** site (Decision I — *not* prerendered static) that renders
> the akasha vellum corpus via gothic, reconstitutes transcript pages from linguist data, with **URL slugs
> preserved byte-for-byte**. The critical-path long pole (roadmap §6).

This doc verifies the 0011 sub-plan against the actual code, resolves the checkable facts, and flags the
decisions to settle **before** speccing. Every claim is cited to `file:line`.

---

## 1. Executive summary — what changed since the sub-plan was drafted

The 0011 sub-plan is dated 2026-06-19, **before Decision I** (frontends are SSR Compose services behind
Caddy, decided on 0014 / 2026-06-20). Three load-bearing things in the sub-plan are now wrong or
incomplete, and the research surfaced two more integration seams the plan didn't name:

1. **SSR, not static prerender.** The sub-plan says "TanStack Start **static prerender → `dist/`**"
   throughout (§2, §3.2, §5.1). Decision I flips this: akasha-frontend runs as an **SSR server** (a Compose
   unit behind Caddy), copying strider. **There is no `dist/` HTML on disk** (verified: strider's
   `dist/client` has **0** `.html` files; `apps/strider/vite.config.ts:21-23` has no `prerender` block).
   This breaks the plan's Pagefind approach (§6 below) and reframes the "static endpoints" (RSS, sitemap,
   contentIndex.json) as **build-time-emitted static assets** served by the SSR static handler / Caddy.

2. **No remark chain to port.** The sub-plan §3.1 frames the work as porting faerrin's Obsidian-markdown
   **remark chain** (directive → callouts → wikilinks → transcript) to render wiki pages. But the wiki body
   is **already converted to vellum** by akasha-backend's one-shot converter, and **gothic's
   `DocumentView` renderer handles the entire vellum node union today** (handout/edict/statblock/fields/
   timeline/columns/crossref/all GFM markdown — §4.3). So the wiki-page render path is **zero renderer
   work**. The only remark-ish logic that survives is (a) **crossref → href resolution** (gothic emits a
   placeholder with no href — §4.3/N3) and (b) the **transcript markup builder + proper-noun auto-linker**
   (transcripts are *not* vellum — §5).

3. **Transcripts are a separate artifact and must be *merged* into the page graph.** faerrin had **76
   `Script/*.md` pages baked into the wiki**; the akasha corpus **excludes Script entirely** (verified: **0**
   Script `.vellum` files; the corpus is 141 pages = faerrin's 217 `.md` minus the 76 Script pages).
   akasha-frontend **reconstitutes** transcript pages from linguist's **77 `data/*.json`** files at the same
   `Script/<campaign>/<date>` slugs, and must **merge them into the URL set, the graph edges, backlinks, and
   the Explorer tree** — the URL-parity gate (Risk 1) covers **both** sets, not just the 141 snapshot pages.

4. *(new seam)* **Speaker colors are a name→value mapping across two systems.** linguist emits a CSS
   **variable name** per speaker (`color: "--textJorge"`, `apps/linguist/.../models.py:24`); the actual hex
   **values** live in `ontology-being` (`being.kdl:14-66` — e.g. `josh → rgb(232,184,232)`, plus
   `guest-color "rgb(235,235,236)"`). akasha-frontend must define the `--text<Name>` CSS custom properties
   from ontology-being (I5) so the transcript/graph/dice palettes resolve.

5. *(new seam)* **`body[data-slug]` is a load-bearing runtime contract** between the page shell and two
   islands (Graph reads `document.body.dataset.slug` at `Graph.tsx:513`; TranscriptPlayer at
   `TranscriptPlayer.tsx:279`). The SSR shell must emit it. And the **MPA→SPA shift** (faerrin was MPA /
   full-page-loads; astra is SSR + TanStack client routing) means island teardown now matters — see N5.

**Net:** akasha-frontend is *less* renderer work than the plan implies (gothic owns vellum) but *more*
integration work (SSR reconciliation, crossref-href resolution, transcript reconstitution + merge,
Pagefind-under-SSR, color mapping). The dice dashboard stays **deferred** (M3, confirmed).

---

## 2. The data contracts akasha-frontend consumes (build-time)

Three inputs, all build-time (no live content API — Decision D):

### 2.1 The akasha snapshot — `apps/akasha-backend/snapshot/akasha-snapshot.json` + the vellum corpus
Real committed artifact: **141 pages, 354 edges, 71 unresolved** (160 KB, canonical JSON). Shape
(`apps/akasha-backend/src/astra_akasha_backend/snapshot.py:35-53`):

```jsonc
{
  "pages": [ { "path": "Anzu",                       // POSIX path, no .vellum ext
               "date": "2026-06-06T22:12:21-04:00",  // baked faerrin git date (ISO+offset) or null
               "frontmatter": {"title": null, "tags": [], "aliases": [], "img": null,
                                "extra": {"date": "..."}},   // Frontmatter.model_dump()
               "crossrefs": [{"target":"Anzu","alias":null,"heading":null}] } ],
  "edges":  [ { "source":"Divinity/Celestial Prescence", "target":"Geography/Calaria/Hallia/index",
                "resolved":"Org/Iridescent Church/index", "heading":null, "alias":"Iridescent Church" } ],
  "unresolved": [ {"source":"Argyle","target":"Scale"} ]   // derived view of edges where resolved===null
}
```

- **The snapshot carries NO vellum body** — no source, no AST, no HTML (`snapshot.py:38-46` emits only
  path/date/frontmatter/crossrefs). The **vellum body lives in the raw `.vellum` files** under
  `apps/akasha-backend/content/**` (141 files), stored verbatim (`corpus.py:46`). akasha-frontend reads
  those and **renders them with gothic's TS `VellumDocument` parser + `DocumentView`** at build.
- **Edges are resolved page-path → page-path in Python** (Quartz "shortest" rule over paths,
  `crossref.py:43-55`). The snapshot **does not** give slugs or backlinks — by design: the *slug* form and
  the *backlink inversion* are akasha-frontend's job via the lifted `slug.ts` / `site.ts` (`crossref.py:5-8`).
- `date` is **duplicated** (top-level `pages[].date` and `frontmatter.extra.date`); read the top-level one.
- Contract guarantee: `test_snapshot_is_deterministic_and_committed` makes the committed JSON a
  byte-identical, regenerable function of the corpus (`tests/test_akasha_backend.py:48-58`).

### 2.2 linguist transcripts — `apps/linguist/data/{date}.json` (77 files)
Per-transcript (`apps/linguist/src/astra_linguist/models.py:39-44`): `{ date, audio, script: FormattedLine[] }`.
Per-line (`:22-36`): `{ start: "HH:MM:SS", second: float, text, user: {name, color}, duration }`.
- `audio` is an **external** URL (`apps/linguist/data/2026-6-8.json:3` =
  `https://static-audio.iridi.cc/2026-6-8/audio.mp3`) — not bundled.
- `user.color` is a CSS **var name** (`"--textJorge"`), values from ontology-being (§1.4).
- Fixtures are large (`2026-6-8.json` = 915 KB); rendered transcript HTML hit **1.6 MB** in faerrin
  (`pkg/aether/public/Script/The-First-Spark/2025-5-21.html` = 1,616,941 B) — the "do not re-render
  reactively" mandate (N5).

### 2.3 ontology-being identity colors (I5) — `ontology/ontology-being/being.kdl:14-66`
Player colors (`player-id` 1–5 → rgb hex) + `guest-color` fallback. The accessor lib already exists
(py + ts readers). Used for transcript speaker chips, graph node colors, and (later) dice palettes.

---

## 3. Verified current state — faerrin `aether`

Astro 5 **SSG, MPA** (no ClientRouter — deliberate, `astro.config.mjs:10-12`), `publicDir: ./assets`,
`outDir: ./public`, `build.format: "file"` (emits `foo.html`, `astro.config.mjs:20-24`). It is a faithful
**Quartz** port into Astro+Solid (nearly every island names its Quartz origin).

**8 Solid islands** (`src/components/islands/`), hydration set at the call sites:

| Island | LOC | Hydration | Role | Port difficulty |
|---|---|---|---|---|
| Darkmode | 59 | `client:load` | dark-only void theme toggle + `themechange` event | Easy (note FOUC inline script) |
| ReaderMode | 45 | `client:idle` | toggles `<html reader-mode>`; non-persistent | Easy |
| Popover | 143 | `client:idle` | hover previews; `fetchCanonical` + @floating-ui; binds all `a.internal` | Easy–medium (SPA teardown, N5) |
| Search | 130 | `client:idle` | Pagefind modal; lazy `import("/pagefind/pagefind.js")` | Client trivial; **index production = open (N1)** |
| Explorer | 202 | `client:only` | recursive folder tree from `buildExplorerTree` (site.ts) | Medium (signals→useState) |
| Graph | 598 | `client:only` | **pixi + d3-force** over `/static/contentIndex.json` | **Hard** — largest island (M2) |
| TranscriptPlayer | 440 | `client:idle` | **progressive-enhancement DOM-attach**; renders nothing | **Hard** — non-reactive (N5) |
| DiceDashboard | 577 | `client:only` | ECharts roll viz at `/dice` | **Deferred (M3)** |

**Routes** (`src/pages/`): `[...slug].astro` (content + folder-listing + alias-redirect, 209 LOC),
`tags/[...tag].astro` (86), `index.xml.ts` (RSS, hand-rolled), `sitemap.xml.ts` (hand-rolled),
`static/contentIndex.json.ts` (the **slim `{title,links,tags}` graph contract** — Graph fetches it at
`Graph.tsx:114`), `404.astro`, `dice.astro`. **No `@astrojs/rss` / sitemap integrations** — both are
hand-rolled route files, so they port to a build-time emit cleanly.

**The two verbatim-lift files** (the URL-parity spine):
- **`slug.ts`** (240 LOC) — Quartz `path.ts` port; **one dep `github-slugger`, zero Astro, isomorphic**
  (`slug.ts:13-14`). Drop-in portable. Header warns: *"any change to casing/punctuation silently breaks
  every internal link, alias redirect, sitemap entry, and inbound bookmark"* (`slug.ts:5-7`).
- **`site.ts`** (436 LOC) — the build-time index (slugs, link edges, backlinks, folder-index pages,
  breadcrumbs, hierarchical tags, the Explorer tree, git dates). **Lifts verbatim except one input swap**:
  replace `getCollection("docs")` + the `e.filePath/data/body` reads (`site.ts:144-165`) with a
  **snapshot reader**, and **delete `gitModifiedDates()`** (`site.ts:103-126`) — dates are pre-baked in the
  snapshot. The `entry`/`render()` coupling (`site.ts:51`) repoints to the gothic vellum renderer.

---

## 4. Reuse map — what akasha-frontend gets for free

### 4.1 The strider template (copy recipe in `apps/strider/README.md:45-66`)
Copy the **shell** (`server.ts`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `Dockerfile`,
`scripts/`, `src/router.tsx`, `src/observe/`, generic `src/components/` + `src/lib/`, `src/styles/`).
Delete `src/domain/` + `content/*`; add akasha's own. Net-new per app: `src/domain/`, `content/`, the route
*bodies*, `scripts/build-content.ts`, a config namespace (+ Zod/Pydantic mirror), deploy + uv-exclude.

### 4.2 The reusable spine (already in libs — don't re-copy)
- **`@astra/site-kit`** — `createSsrServer({serviceName,port,ssr,clientDir})` (OTel + span/req + SIGTERM
  flush + static serve w/ traversal guard), `startRum` (`./web`), `contentWatchPlugin`/`gothicFontsPlugin`,
  `generateRouteTree`, `loadSiteConfig` (node-safe config locator for `vite.config`).
- **`@astra/content-build`** — `defineContentSource`/`buildContent` (runs sources in declaration order),
  `emitModule`, `parseFrontmatter`, `markdownToHtml`, `listMarkdownFiles`, `hashFiles`. strider's
  `scripts/build-content.ts` is the worked example (two sources sharing a closure for cross-source deps).
- **The Dockerfile** is templated on a single `ARG APP`; Compose/Caddy are pattern-copies.
- **The RUM seam** copies verbatim except the config namespace: `src/observe/rumConfig.ts` keeps a
  `createServerFn` (must stay in app source — the tanstackStart plugin only transforms app server fns)
  returning `{endpoint, serviceName: "${cfg.akasha.serviceName}-rum"}`; `rum.ts` calls `@astra/site-kit/web`.

### 4.3 gothic's vellum renderer — covers the whole corpus
`DocumentView({document: VellumDocument})` (`libs/ts/gothic/src/render/components/DocumentView.tsx`)
exhaustively handles the closed `VellumNode` union: `:::handout`/`:::edict` → `ProseCard`;
`:::statblock`/`:::hazard`/`:::item`/`:::spell` → `StatCard`; `:::fields` → `Fields`; `:::timeline` →
`TimelineBlock`; `:::columns` → recursive; prose → full GFM mdast renderer (`mdastToReact.tsx:54-191`,
total — unknown nodes degrade to a visible `ErrorChip`). Corpus reality: **19 pages `:::handout`, 10
`:::fields` (incl. the deity cluster), 1 `:::timeline` (Timeline.vellum)** — all render today.

**The one gap (by design): crossref → href.** `CrossRef.tsx` renders a **placeholder `<span>` with NO
`href`**, carrying `data-crossref-target` / `data-crossref-heading` (`CrossRef.tsx:12-29`; *"gothic does
NOT resolve targets (L6) — there is no `href` here, by design"*). The component's doc-comment says
"akasha-backend (0007) resolves it" — but backend only resolves to **page-paths** (the `edges` list);
turning a page-path into a **URL** (and the final anchor) is **akasha-frontend's** job via lifted `slug.ts`.
**How** akasha-frontend injects the href is an open design question — see N3.

---

## 5. The rewrite, area by area (corrected from sub-plan §3)

### 5.1 Wiki page render — gothic, not remark
Per page: parse the raw `.vellum` source with `@astra/vellum-lang`'s `parseDocument`, render with gothic's
`DocumentView`. Resolve crossref hrefs from the snapshot `edges` + lifted `slug.ts` (N3). Popover previews
ride on the resolved internal links (faerrin's Popover `fetchCanonical`s the target — needs real hrefs +
the alias-redirect pages, §5.3). **No remark chain.**

### 5.2 slug.ts / site.ts verbatim lift + the snapshot adapter
Lift `slug.ts` byte-for-byte. Lift `site.ts`, swapping its input from the Astro collection to a snapshot
reader that yields the four fields site.ts consumes per page — `{filePath/id, frontmatter (data), body,
date}`. **Caveat:** site.ts extracted link edges from `e.body` via regex (`site.ts:57-95`); the snapshot
**already provides resolved `edges`** (path→path). Decide whether to (a) feed the lifted edge-extraction
the vellum body (re-derive in TS, keeps site.ts untouched) or (b) consume the snapshot `edges` directly
(less duplicated logic, but diverges from the verbatim lift). **Recommend (b)** — the snapshot edges are the
parity-gated source of truth; re-running a *different* (vellum-aware) extractor in TS risks divergence. This
is a real "verbatim vs adapt" tension to settle in the spec (N6).

### 5.3 Routes under SSR (the prerender→SSR reconciliation)
Every faerrin route maps to a TanStack route, but the **static endpoints become build-time-emitted static
assets** (emitted into the client output dir, served by `createSsrServer`'s static handler / Caddy), since
there's no prerender pass:
- Content / folder-listing / `tags/$slug` → SSR routes + loaders reading generated modules.
- **Alias redirects** → faerrin emitted bare `<meta http-equiv="refresh">` HTML pages (`[...slug].astro:111-125`)
  that Popover's `fetchCanonical` follows. Under SSR these become either redirect routes or emitted static
  stubs — decide (N7). The redirect targets must keep byte-parity (inbound bookmarks).
- `index.xml` (RSS), `sitemap.xml`, `static/contentIndex.json` → **emit at build** from the snapshot into
  static files at those exact paths (Graph hard-codes `fetch("/static/contentIndex.json")`).
- `404`.
- The **page list** for routing + the slug-parity diff = **snapshot pages (141) ∪ transcript pages (77)**.

### 5.4 Islands → React (7 for v1; Dice deferred)
- **Darkmode / ReaderMode / Popover** — easy ports (Solid `onMount/onCleanup` → React `useEffect`). Keep
  the dark-only FOUC inline script in the SSR document head.
- **Explorer** — recursive tree from `buildExplorerTree` (site.ts); signals → `useState`/refs;
  localStorage collapse-state.
- **Graph** — pixi + d3-force; **client-only behind strider's `<ClientOnly>` + `PixiHost`** (pixi calls
  `getComputedStyle`/`devicePixelRatio` — crashes under SSR, `Graph.tsx:5`). The pixi/d3 body is
  framework-agnostic → ports as-is; only the Solid shell changes. Reads `/static/contentIndex.json` (§5.3)
  + `body[data-slug]`. **M2 — the hard island.**
- **Search** — the client contract (`import("/pagefind/pagefind.js")` + `pf.search`) is framework-agnostic
  and copies verbatim; **the index *production* is the open question (N1).**
- **TranscriptPlayer** — **the hard one.** It renders **nothing** (`return null`); `initTranscriptPlayer()`
  attaches to **server-rendered `.transcript-line` / `audio[data-transcript]` markup** via delegated click +
  precomputed `seconds[]` binary search + single-root-class filtering (`TranscriptPlayer.tsx:14-18, 56-431`).
  Port the body verbatim into a `useEffect(() => initTranscriptPlayer(), [])`; **the markup must be
  SSR-emitted** (§5.5), not React-rendered per line. **DO NOT make it reactive** (1.6 MB pages).

### 5.5 Transcripts (D4) — reconstitute + merge
Transcripts are **not** in the akasha corpus (§1.3). akasha-frontend owns the full faerrin export pipeline,
ported to a **build-content source**:
1. Read linguist `data/{date}.json` (77 files).
2. **Auto-link proper nouns** against the akasha corpus — lift faerrin's `linker.ts:21-52` (one combined
   longest-first case-insensitive `\b(name|…)\b` regex over every akasha page's **title + aliases**, rewrite
   mentions to internal links). The corpus title/alias set comes from the snapshot frontmatter.
3. **Emit the `.transcript-line` / `audio[data-transcript]` markup server-side** (port the *output shape* of
   faerrin's `remark-transcript.mjs` — the `data-second`/`data-user`/`data-char`/`id="{second}-{user}"`
   attributes are the contract TranscriptPlayer attaches to). Audio `<source src>` = the external
   `static-audio` URL verbatim.
4. Place pages at `Script/<campaign>/<date>` slugs (campaign from ontology-being; faerrin used
   `Unsorted` as the fallback bucket — verify the campaign mapping source).
5. Merge these pages into the routing list, the graph edges, backlinks, and the Explorer tree (§5.3).
Speaker name/color from `user` + ontology-being (§1.4); the character↔real name toggle data
(`data-char`/`data-real`) carries through.

### 5.6 Pagefind under SSR (the open question — N1)
faerrin used `astro-pagefind` to run the Pagefind CLI over built `dist/` HTML, scoped by
`data-pagefind-body`. **Under Decision I there is no static HTML on disk.** Options (decide in spec):
- **(a) prerender-just-for-index** — render routes to HTML at build only to feed the CLI. Reintroduces the
  prerender Decision I removed; rejected unless nothing else works.
- **(b) Pagefind NodeJS Indexing API** (`pagefind` package: `createIndex` + `addHTMLFile`/`addCustomRecord`)
  — build the index at build time directly from the rendered corpus (render each vellum page + transcript
  to an HTML/text string, add a record), write the `/pagefind/` bundle into the client output dir, serve it
  static. **Recommended** — fits the build-content step, no prerender. **Spike early (Risk 4).**
- The **client Search island is unaffected** either way (just imports `/pagefind/pagefind.js` + searches).

### 5.7 Dice dashboard — DEFERRED (M3, confirmed)
Not in v1. A later iteration ports the dice-data-webui-plan (ECharts over a weal-PG snapshot export). v1 =
wiki pages + transcripts + search + graph.

---

## 6. Decisions to revisit before speccing

| # | Decision | Why it's open | Recommendation |
|---|---|---|---|
| **N1** | **Pagefind index production under SSR** | Plan assumed CLI over `dist/` HTML; Decision I → no static HTML | ✅ **RESOLVED — spiked 2026-06-21** (§6.1). Pagefind's **NodeJS Indexing API** builds the full `/pagefind/` bundle from in-memory HTML strings; serve it static. No prerender needed. |
| **N2** | Static endpoints (RSS/sitemap/contentIndex/alias-redirects) under SSR | No prerender pass to emit them | **Emit at build** into the client output dir as static files at the exact faerrin paths; SSR static-serves them. |
| **N3** | **Crossref → href resolution seam** | gothic `CrossRef` has no `href` by design; emits `data-crossref-target` | ✅ **RESOLVED — landed 2026-06-21** (§6.2). gothic now takes an optional **`resolveCrossref` context resolver** (backward-compatible); akasha-fe supplies `node → {href}` from snapshot `edges` + lifted `slug.ts`. |
| **N4** | Date semantics: author vs committer | faerrin site.ts used `--format=@%aI` (author); akasha M3 bakes `%cI` (committer) | Usually identical. If displayed-date parity matters, ask 0007 to switch to `%aI`. Low priority — likely **accept committer date**. |
| **N5** | MPA→SPA island lifecycle | faerrin relied on full-page unload for teardown; astra keeps the app alive across client nav | Scope every island's listeners/pixi-app/global-handlers to component unmount (`useEffect` cleanup). Audit Popover/Graph/TranscriptPlayer specifically. |
| **N6** | site.ts edges: re-derive vs consume snapshot | Verbatim-lift extracts edges from body; the snapshot already has parity-gated `edges` | **Consume the snapshot `edges`** (single source of truth); adapt site.ts's edge-extraction out. Document the deviation from "verbatim." |
| **N7** | Transcript campaign/slug mapping | Need the `Script/<campaign>/<date>` campaign source + the `Unsorted` fallback | Verify campaign assignment (ontology-being campaigns vs faerrin's export logic) before building; the slugs are URL-parity-gated. |
| **N8** | Snapshot vendoring | Does akasha-frontend read the snapshot from `apps/akasha-backend/` across the monorepo, or is it copied in? | Read across the workspace at build (it's committed + deterministic); COPY `apps/akasha-backend/snapshot` + `content` into the Dockerfile build stage (like strider COPYs `ontology/`). |

### 6.1 Spike N1 — Pagefind under SSR (RESOLVED ✅)
Ran the real `pagefind@1.5.2` NodeJS Indexing API against 3 synthetic akasha-shaped pages **as in-memory
HTML strings** (no static `dist/` on disk — the Decision-I constraint):
```js
const { index } = await pagefind.createIndex();
await index.addHTMLFile({ url: "/Anzu/", content: "<html>…<main data-pagefind-body>…</main>…</html>" });
await index.writeFiles({ outputPath: "./pagefind-out" });
```
**Result:** a complete `/pagefind/` bundle was produced — **`pagefind.js` (the exact file the Search island
lazy-loads), `pagefind-worker.js`, `wasm.en.pagefind`, one `fragment/*.pf_fragment` per page, `index/*.pf_index`,
`pagefind-entry.json`**. URLs were preserved verbatim, including the spaced `/Script/A Hunt of Metal and
Vine/2025-6-16/` transcript path. **Conclusion:** akasha-fe's build-content step renders each page (vellum +
transcripts) to an HTML string, feeds `addHTMLFile`, `writeFiles` the bundle into the client output dir, and
the SSR static handler / Caddy serves `/pagefind/`. The **client Search island is unchanged** (still
`import("/pagefind/pagefind.js")` + `pf.search`). The `data-pagefind-body` scoping marker carries over.
*(Spike scratch: `/tmp/pagefind-spike/spike.mjs` — throwaway; the real integration is a build-content source.)*

### 6.2 Spike N3 — gothic crossref→href resolver (RESOLVED ✅, change landed)
Added a **backward-compatible, SSR-safe** resolver seam to `@astra/gothic` (not throwaway — a small enabling
change, default behaviour byte-unchanged so vellum-frontend/the render service are unaffected):
- new `libs/ts/gothic/src/render/crossrefResolver.ts` — `CrossRefResolver = (node) => {href} | null` + a
  `CrossRefResolverContext`;
- `CrossRef` consumes the context: a hit renders a real `<a href>` (keeping the `data-crossref-*` attrs for
  Popover/backlink tooling), a `null`/no-provider falls back to the placeholder `<span>` (honouring L6);
- `DocumentView` takes an optional `resolveCrossref` prop and wraps its subtree in the provider;
- proven by `crossrefResolver.test.tsx` (renders via `react-dom/server`): resolver hits → `href="/Belvedere/"`,
  **nested crossrefs inside `:::fields` resolve through the same context** (`href="/Iridescent-Host/"`),
  dangling targets stay placeholders, and no-resolver output is unchanged.
**akasha-fe's job** is just to supply the resolver: `node → snapshot.edges[source=…,target=node.target].resolved
→ slug.ts → href`. gothic still doesn't *know how* to resolve (L6 intact) — it calls the consumer's function.
gothic: 11/11 tests pass, typecheck clean, biome clean over the whole repo.

---

## 7. Proposed slice plan (preliminary — for the spec to ratify)

1. **Scaffold** — copy the strider shell; `apps/akasha-frontend` config namespace (`service-name`, `port` in
   the 10350–10399 band) mirrored in both schemas; OTel via `createSsrServer`; uv `exclude`; `@tailwindcss/vite`;
   a placeholder content source + ≥1 test (so `bun test` isn't empty). CI-green.
2. **slug.ts + site.ts lift + snapshot adapter** — lift both verbatim, swap the input to a snapshot reader,
   consume snapshot `edges` (N6), delete `gitModifiedDates`. Emit generated modules (page index, backlinks,
   folder-index, breadcrumbs, tags, Explorer tree) via `@astra/content-build`. **Slug-parity unit test vs a
   captured faerrin slug set** (the gate, Risk 1).
3. **Routes + static emits** — content/folder/alias/`tags/$slug` SSR routes + loaders; build-emit RSS,
   sitemap, `/static/contentIndex.json`, alias redirects (N2). 404. `body[data-slug]` in the shell.
4. **Vellum rendering + crossref hrefs** — render `.vellum` via gothic; wire crossref→href (N3); verify
   handout/edict, fields, timeline, Popover previews against real pages.
5. **Islands → React (easy + Explorer)** — Darkmode/ReaderMode/Popover/Explorer; FOUC script; MPA→SPA
   teardown (N5).
6. **Graph (M2)** — pixi+d3 behind `<ClientOnly>`/`PixiHost`; reads contentIndex + ontology colors.
7. **Transcripts (D4)** — the linguist build-content source: auto-linker lift, server-emitted line markup,
   `Script/<campaign>/<date>` slugs merged into the graph; **TranscriptPlayer** non-reactive attach.
8. **Search / Pagefind (N1)** — NodeJS indexing API at build; serve `/pagefind/`; the Search island.
9. **URL-parity gate + deploy** — full slug-set diff vs faerrin (snapshot ∪ transcript pages); Dockerfile
   (COPY akasha snapshot + corpus + linguist data), Compose unit, Caddy block; live-verify (`just up` +
   `caddy-reload` + curl + a SigNoz `service.name=astra.akasha-frontend` SSR span).

*(Dice dashboard deferred — M3.)*

## 8. Risks

1. **URL parity** — the single hard invariant. `slug.ts` lifts verbatim; the gate is a slug-set diff vs
   faerrin covering **both** snapshot pages **and** reconstituted transcript pages. Any divergence breaks
   inbound links/bookmarks. The corpus has Unicode/space/apostrophe filenames (`Anaïs Marchal`,
   `Ætherion Limited`) — exactly what `sluggify` preserves; do not "improve" it.
2. **TranscriptPlayer port** — naive React reactivity re-renders 1.6 MB of markup. SSR-emit the line markup;
   attach imperatively in `useEffect`; port the warning comment verbatim.
3. **Crossref-href seam (N3)** — ✅ **retired** (§6.2): gothic now exposes a resolver seam; akasha-fe wires
   `node → edges → slug → href`. Residual: Popover previews still need the resolved internal links to exist.
4. **Pagefind on TanStack SSR (N1)** — ✅ **retired** (§6.1): the NodeJS indexing path is proven against
   in-memory HTML; no prerender needed.
5. **Graph/pixi under SSR (M2)** — must stay strictly client-only; SSR/loaders must never touch WebGL.
6. **Transcript reconstitution + merge** — transcripts leave linguist as data and must rejoin the page graph
   (slugs, edges, backlinks, Explorer) to match faerrin; the campaign→slug mapping (N7) is parity-critical.

## 9. Open verification still owed (small, do during spec/slice-1)
- Confirm gothic's `DocumentView`/`CrossRef` public API can take a crossref resolver (N3) — talk to the
  gothic surface / read its props; else plan the post-render transform.
- Confirm the transcript **campaign mapping** source + `Unsorted` fallback (N7).
- Capture faerrin's authoritative **slug set** (run the old `site.ts` once, or enumerate the live
  `pkg/aether/public/**/*.html`) as the parity fixture for slice 2/9.

---

*Next gate: author the NLSpec (`octo:spec` → `thoughts/astra/specs/0011-akasha-frontend-spec.md`) on this
scope + the settled N-decisions. Then implement per the slice plan, copying strider, building the spec's
scope in full.*
