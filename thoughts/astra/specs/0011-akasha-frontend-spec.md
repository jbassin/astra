# NLSpec 0011 — akasha-frontend (the wiki read-surface)

**Status:** **IN PROGRESS** — **slices 1–8 of 9 BUILT** (1–7 pushed; slice 8 `92d551d`); **only slice 9
(URL-parity gate + deploy) remains.** slice 8 = **search via Pagefind (N1)** — `build-search.ts` builds the
`/pagefind/` bundle via the NodeJS Indexing API over in-memory HTML docs (wiki + transcripts) after `vite
build`; the **Search island** is a React port of faerrin's Solid one (Ctrl/Cmd-K modal, lazy
`import("/pagefind/pagefind.js")`); 217 pages indexed, verified served live. slice 7 =
**transcripts (D4/N7)** — reconstitute faerrin's 76 Script pages from linguist `data/*.json`: `matchCampaign`
(faerrin heuristic adapted to the ontology Campaign shape) → `Script/<campaign>/<date>`, the proper-noun
auto-linker (`linker.ts` → resolved `<a class="internal">`), faerrin's remark-transcript OUTPUT markup, the
verbatim `TranscriptPlayer` (renders null, attaches at SSR), speaker colors from ontology-being (I5). **N7
PARITY GATE GREEN: reproduces faerrin's 76 Script slugs EXACTLY (1:1).** Bodies (~115 MB) code-split + loaded
server-side via a `transcriptBody` createServerFn (client bundle stays 2.3 MB); contentIndex = 217 = faerrin's.
CI-green whole repo (56 fe tests). **Resume at slice 8** (Search/Pagefind N1). slice 6 =
**pixi/d3 force-graph (client-only)** — faerrin's Solid Graph island ported to React (imperative `renderGraph`
body VERBATIM; pure data-shaping split to `graphData.ts`), mounted in PageLayout's right sidebar behind
`lazy()` + strider's `<ClientOnly>` so pixi never reaches SSR (Risk 5); reads `/static/contentIndex.json` +
`body[data-slug]`, re-renders on `themechange`, Quartz color vars shimmed to the gothic palette. slice 5 =
**islands → React** (Darkmode dark-only + FOUC head script, ReaderMode, Popover on `a[data-crossref]`/
`a.internal` via @floating-ui/dom, Explorer recursive tree w/ SSR-safe localStorage collapse) + the full 3-column
Quartz page shell (sidebars) + functional gothic CSS; N5 unmount teardown. Earlier slices: (1) scaffold
on the strider SSR template; (2) `slug.ts`/`site.ts` verbatim lift + snapshot adapter (edges consumed per N6) +
generated modules — **the URL-parity gate is GREEN** (141 snapshot slugs byte-equal faerrin's 141 authoritative
non-Script slugs); (3) **routes + static emits** — TanStack SSR catch-all (content/folder/alias) + `tags`
routes + 404, `body[data-slug]`, build-emitted RSS/sitemap/contentIndex (N2) + alias `meta-refresh` stubs (React
19 head hoisting); (4) **vellum body rendering + crossref hrefs** — build-time `renderToStaticMarkup(gothic
DocumentView)` with the **N3 `resolveCrossref`** seam (snapshot edges → slug → href), baked to
`generated/bodies.ts` + injected via `dangerouslySetInnerHTML`; ContentMeta wired; gothic `theme.css @source "./"`
(so a DocumentView consumer ships gothic's utility CSS). CI-green both lanes (typecheck, 33 fe tests, build,
biome; uv re-verified). Scope gate complete (N1/N3 spiked, N2/N4–N8 decided). **Resume at slice 5** (islands →
React: Darkmode/ReaderMode/Popover/Explorer). **Phase:** 5 (frontends).
**Source plan:** [`../plans/0011-akasha-frontend.md`](../plans/0011-akasha-frontend.md).
**Pre-impl thoughts:** [`../../shared/research/2026-06-21-akasha-frontend-0011-thoughts.md`](../../shared/research/2026-06-21-akasha-frontend-0011-thoughts.md).
**Process:** octo:spec → octo:embrace, Claude team mode (typescript-pro, frontend-developer, code-reviewer), per astra `CLAUDE.md`.
**Depends-on:** `0003` gothic (vellum renderer + the new `resolveCrossref` seam, landed `f13ed5f`), `0004`
vellum-lang (`parseDocument`/AST), `0006` linguist (transcript `data/*.json`), `0007` akasha-backend (the
committed snapshot + `.vellum` corpus), Phase 1 (`@astra/config`, `@astra/observe`+`/web`, `@astra/ontology`
identity colors), `0014` strider (the SSR template + `@astra/site-kit` + `@astra/content-build`).
**Runs after** akasha-backend; **the critical-path long pole** (roadmap §6). No live backend at runtime
(Decision D — build-time snapshot only).

## Goal

Rewrite faerrin's `aether` (Astro 5 **SSG** + 8 Solid islands, a Quartz port) as astra's **akasha-frontend**:
a **TanStack Start SSR** site (Decision I — *not* prerendered static) that renders the akasha **vellum corpus**
via gothic, **reconstitutes transcript pages** from linguist data, and serves search + a force-graph — with
**URL slugs preserved byte-for-byte** (the one hard invariant; inbound links/bookmarks must survive cutover).

Unlike orator (a same-language lift) this is a **framework rewrite** (Astro/Solid → TanStack/React) but a
**behaviour port**: lift the load-bearing Quartz logic verbatim (`slug.ts`, `site.ts`, the campaign matcher,
the proper-noun linker, the TranscriptPlayer attach), and reuse the astra spine (strider template,
`@astra/site-kit`, `@astra/content-build`, gothic's renderer) rather than reinventing it. The work is **less
renderer code than the sub-plan implied** (gothic already renders the whole vellum union — no remark chain)
and **more integration** (SSR reconciliation, crossref-href resolution, transcript reconstitution + graph
merge, Pagefind-under-SSR, the speaker-color name→value seam).

## Decisions in force (roadmap + sub-plan)

| # | Decision | Choice |
|---|---|---|
| D (roadmap) | akasha consumption | **Build-time snapshot** — no live content API; akasha-fe reads the committed `akasha-snapshot.json` + `.vellum` corpus at build. |
| I (roadmap) | Frontend hosting | **SSR Compose service behind Caddy** (client RUM) — **not** prerendered static `dist/`. Revises the sub-plan's "static prerender" wording. |
| E1 (plan) | Slug/graph | **Lift `slug.ts` + `site.ts`** (Quartz-faithful, build-time TS) — URL parity + backlink/folder/tag/Explorer graph. |
| D4 (plan) | Transcripts | **Rendered here** (not in linguist) — from linguist `data/*.json`, auto-linked against the akasha corpus, driving the TranscriptPlayer. |
| I5 (plan) | Identity colors | Speaker/graph colors from **ontology-being** (`being.kdl` player colors + `guest-color`). |
| #4 (CLAUDE) | Template | **strider is the template** — consume `@astra/site-kit` + `@astra/content-build`; build-time-content → generated modules → route loaders; SSR. |
| M3 (plan) | DiceDashboard | **Deferred** — not in v1 (later iteration ports the dice-data-webui-plan over a weal-PG snapshot). |

### N1 — **RESOLVED (spiked): Pagefind via the NodeJS Indexing API**

Decision I means **no static `dist/` HTML** to index, so faerrin's `astro-pagefind`-over-built-HTML approach is
dead. Spiked `pagefind@1.5.2`'s **NodeJS Indexing API** (`createIndex` → `addHTMLFile({url, content})` →
`writeFiles`): it builds the full `/pagefind/` bundle (incl. `pagefind.js`, the exact file the Search island
lazy-loads, + per-page fragments + wasm) from **in-memory HTML strings**, URLs preserved. akasha-fe's
build-content step renders each page (vellum + transcript) to an HTML string, feeds the index, and writes
`/pagefind/` into the client output dir; the SSR static handler / Caddy serves it. **The client Search island
is unchanged** (`import("/pagefind/pagefind.js")` + `pf.search`), `data-pagefind-body` scoping carries over.

### N3 — **RESOLVED (landed `f13ed5f`): gothic `resolveCrossref` seam**

gothic's `<CrossRef>` renders a placeholder `<span>` with no `href` by design (L6). gothic now accepts an
optional **`resolveCrossref` context resolver** on `<DocumentView>`: a hit renders a real `<a href>` (keeping
the `data-crossref-*` attrs for Popover/backlink tooling), `null`/no-provider falls back to the placeholder.
SSR-safe (`react-dom/server`); nested crossrefs (e.g. inside `:::fields`) resolve through the same context.
**akasha-fe supplies** `node → snapshot.edges[source,target].resolved (page-path) → lifted slug.ts → href`.
gothic's default and the vellum-frontend render service are byte-unchanged.

### N6 — **DECIDED: consume the snapshot's parity-gated `edges`**

`site.ts` extracts link edges by regex over page bodies; the akasha snapshot **already ships resolved `edges`**
(path→path), gated by akasha-backend's deterministic test. akasha-fe **consumes the snapshot edges** (the
canonical source of truth) and adapts `site.ts`'s in-TS edge-extraction out — re-deriving with a *different*
(vellum-aware) extractor risks silently diverging the graph from the gated Python one. This is a **conscious,
spec-sanctioned bend of the "lift verbatim" rule** (the gated edges *are* the behaviour to preserve) — not a
silent change. slug computation, backlink **inversion**, folder-index, breadcrumbs, tags, and the Explorer tree
still lift verbatim from `site.ts`.

### N7 — **DECIDED: port `matchCampaign` (live heuristic), guard with a parity fixture**

A transcript's `Script/<campaign>/<date>` folder — URL-parity-critical — is decided by faerrin's **content
heuristic** `matchCampaign` (`pkg/content/scripts/lib/campaigns.ts`: counts each campaign's character-name hits
in the transcript text; first past `matchThreshold` wins; else `Unsorted/`). Because the pipeline is **live**
(Dagster ingests new sessions), a frozen date→campaign table would go stale — so akasha-fe **ports the
heuristic** (matcher + threshold + roster/campaigns from ontology-being) to auto-route forward, and **also lifts
the billing inference** (player→character per session) for the transcript name-toggle. **Parity guard:** capture
faerrin's *historical* `Script/` output paths as the **URL-parity test fixture** (a test, not runtime data) and
assert the port reproduces them.

### N2 / N4 / N5 / N8 — **DECIDED (compact)**

- **N2 — static endpoints:** RSS (`index.xml`), `sitemap.xml`, `static/contentIndex.json` are **emitted at
  build** into the client output dir at the exact faerrin paths; the SSR static handler / Caddy serve them.
  **Alias redirects stay `<meta http-equiv="refresh">` static stubs** (Popover `fetchCanonical` + bookmarks
  rely on them), not server 301s.
- **N4 — dates:** **accept the committer date** baked by akasha-backend M3 (`%cI`); no 0007 churn, displayed-
  date byte-parity not required.
- **N5 — MPA→SPA teardown:** faerrin was MPA (relied on page unload); astra keeps the app alive across client
  nav, so every island scopes its listeners / pixi app / global handlers to component unmount (`useEffect`
  cleanup) — audit Popover/Graph/TranscriptPlayer.
- **N8 — vendoring:** read the snapshot + corpus across the workspace at build (committed + deterministic);
  COPY `apps/akasha-backend/{snapshot,content}` + `apps/linguist/data` into the Dockerfile build stage (like
  strider COPYs `ontology/`).

## Scope (in)

Slices (each CI-green before commit; push on chunk completion; reproduce both lanes locally):

1. **Scaffold** `apps/akasha-frontend` from the strider shell (`server.ts`, `vite.config.ts` with
   `--configLoader runner` + `@tailwindcss/vite`, `vitest.config.ts`, `tsconfig.json`, `Dockerfile`, `scripts/`,
   `src/router.tsx`, `src/observe/`, generic `src/components` + `src/lib`, `src/styles`). Depend on
   `@astra/{site-kit,content-build,gothic,observe,config}` (`workspace:*`). **Config namespace**
   `akasha-frontend { service-name "astra.akasha-frontend"; port 10365 }` in `config.kdl`, **mirrored in both**
   `libs/ts/config` (Zod) **and** `libs/py/config` (Pydantic). Telemetry-first via `createSsrServer`
   ([[telemetry-built-in]]). Add `apps/akasha-frontend` to `pyproject.toml` uv `exclude`. A placeholder content
   source + **≥1 test** (else `bun test` exits 1). CI-green skeleton that boots SSR.
2. **slug/site lift + snapshot adapter** — lift `slug.ts` **verbatim** (240 LOC, one dep `github-slugger`,
   zero Astro); lift `site.ts` swapping its input from `getCollection("docs")` to a **snapshot reader**
   (`pages[].{path,frontmatter,date}`), **consume the snapshot `edges`** for the graph (N6), **delete
   `gitModifiedDates()`** (dates pre-baked). Emit generated modules via `@astra/content-build`: page index,
   backlinks, folder-index, breadcrumbs, hierarchical tags, the Explorer tree. **Slug-parity unit test** vs a
   captured faerrin slug set (the gate, Risk 1).
3. **Routes + static emits** — TanStack SSR routes + loaders for content / folder-listing / `tags/$tag` / `404`;
   **build-emit** `index.xml` (RSS), `sitemap.xml`, `/static/contentIndex.json` (the `{title,links,tags}` graph
   contract Graph fetches), and the **alias `meta-refresh` stubs** (N2). The SSR shell emits **`body[data-slug]`**
   (load-bearing for Graph + TranscriptPlayer). Page list = snapshot pages ∪ transcript pages (slice 7).
4. **Vellum rendering + crossref hrefs** — render each `.vellum` via `parseDocument` + gothic `DocumentView`,
   wiring **`resolveCrossref`** (N3) from the snapshot `edges` + `slug.ts`. Verify `:::handout`/`:::edict`,
   `:::fields`, `:::timeline`, prose/GFM render; wire **Popover** previews on resolved internal links.
5. **Islands → React (easy + Explorer)** — Darkmode (keep the dark-only FOUC inline script in the SSR head),
   ReaderMode, Popover, Explorer (recursive tree from the generated Explorer module; signals → `useState`/refs;
   localStorage collapse). Per-island unmount teardown (N5).
6. **Graph (M2)** — pixi + d3-force force-graph **client-only** behind strider's `<ClientOnly>` + `PixiHost`
   (pixi crashes under SSR); reads `/static/contentIndex.json` + `body[data-slug]` + ontology colors; recolor on
   `themechange`. Port the imperative body verbatim; only the Solid shell → React `useEffect`/`useRef`.
7. **Transcripts (D4)** — a `@astra/content-build` source over linguist `data/*.json` (77 files): **port the
   proper-noun auto-linker** (`linker.ts` — one combined longest-first regex over the akasha corpus
   titles+aliases → internal links), **server-emit the `.transcript-line`/`audio[data-transcript]` markup**
   (port the *output shape* of `remark-transcript.mjs` — `data-second`/`data-user`/`data-char`/
   `id="{second}-{user}"`; external `static-audio` URL verbatim), **port `matchCampaign` + billing** (N7) for
   `Script/<campaign>/<date>` slugs, **merge** transcript pages into routing/edges/backlinks/Explorer. Speaker
   name/color from `user` + **ontology-being** (define the `--text<Name>` CSS vars from `being.kdl`, I5).
   **TranscriptPlayer**: port the progressive-enhancement attach **verbatim** into a `useEffect` — it renders
   nothing; it attaches to the SSR-emitted markup (delegated click + precomputed `seconds[]` binary search +
   single-root-class filtering). **DO NOT make it reactive** (1.2–1.6 MB pages).
8. **Search / Pagefind (N1)** — build the index via the **Pagefind NodeJS Indexing API** over the rendered
   corpus + transcripts (`data-pagefind-body`-scoped HTML strings), write `/pagefind/` into the client output
   dir; the **Search island** (Ctrl/Cmd-K modal, lazy `import("/pagefind/pagefind.js")`) ports framework-
   agnostically.
9. **URL-parity gate + deploy** — the **full slug-set diff** vs faerrin (snapshot ∪ transcript pages) is the
   cutover gate. Deploy: the templated `ARG APP` Dockerfile (COPY all app manifests + `ontology/ontology-config`
   + `apps/akasha-backend/{snapshot,content}` + `apps/linguist/data`; runtime COPYs `dist`, `src/generated`,
   `server.ts`, `node_modules`, `libs/ts`), a Compose unit (`akasha-frontend` on **10365**, no PORT env,
   healthcheck, `restart: unless-stopped`), a Caddy block (`import astra_site` + `reverse_proxy localhost:10365`;
   fonts self-serve from the container). Add to uv `exclude`. **Telemetry** verified: a
   `service.name=astra.akasha-frontend` SSR span lands in SigNoz via the `signoz_*` MCP; browser RUM via the
   `createServerFn` `rumConfig` seam + `@astra/observe/web`.

## Scope (out)

- **DiceDashboard / weal roll insights (M3)** — deferred to a later iteration (ECharts viz over a weal-PG
  snapshot export, the dice-data-webui-plan); v1 ships wiki pages + transcripts + search + graph.
- **Live content API** — Decision D: build-time snapshot only; no runtime akasha backend.
- **Public DNS / outward-facing edge** — `akasha.iridi.cc` (or the chosen host) DNS record is a manual,
  outward-facing step (like strider/orator); the Caddy block is authored + validated but the record is deferred
  unless told to proceed ([[deploy-apply-with-just]]).
- **Re-transcription / data regeneration** — linguist `data/*.json` + the akasha snapshot are inputs, consumed
  as-is; akasha-fe does not regenerate them.
- **Editor / write surface** — akasha-fe is a read surface; no `/editor`-style authoring (unlike strider).

## Locked technical decisions

| # | Decision | Choice |
|---|----------|--------|
| Framework | Build flavor | **`@tanstack/react-start` (SSR)** — the strider template; no `prerender` block (Decision I). |
| Port | akasha-frontend | **10365** (next free after 10364 orator-pg; behind Caddy). |
| Render | Wiki body | **gothic `DocumentView`** over `parseDocument(.vellum)` — no remark chain; crossref hrefs via `resolveCrossref` (N3). |
| Graph data | site.ts edges | **Consume snapshot `edges`** (N6); lift the rest of `site.ts` verbatim; `slug.ts` verbatim. |
| Search | Index | **Pagefind NodeJS Indexing API** at build → `/pagefind/` static (N1); client island unchanged. |
| Static | RSS/sitemap/contentIndex/aliases | **Emitted at build** at exact faerrin paths; aliases = `meta-refresh` stubs (N2). |
| Transcripts | Routing | **Port `matchCampaign` + billing** (N7) → `Script/<campaign>/<date>`; parity-fixture guard; merge into the page graph. |
| Transcripts | Player | **Verbatim** progressive-enhancement attach in `useEffect`; never reactive (Risk 2). |
| Colors | Source | **ontology-being** `being.kdl` → `--text<Name>` CSS vars + `guest-color` (I5). |
| Dates | Semantics | **Committer date** (`%cI`, baked by 0007 M3) — accept (N4). |
| Pixi | SSR | **Client-only** behind `<ClientOnly>`/`PixiHost`; SSR/loaders never touch WebGL (Risk 5). |
| Vendoring | Inputs | Read across workspace; Dockerfile COPYs `akasha-backend/{snapshot,content}` + `linguist/data` (N8). |

## Acceptance criteria (exit gate)

- [ ] **Both toolchains green locally** before pushing (per [[no-ci-monitoring]]): `bun --filter '*'
      {typecheck,test,build}` + `bunx biome ci .` over the **whole** repo; the uv lane re-verified (config.kdl +
      both schemas touched). akasha-frontend has ≥1 test; biome clean repo-wide.
- [ ] **URL-slug parity (the hard gate):** the produced slug set (snapshot pages ∪ reconstituted transcript
      pages) **byte-matches** faerrin's; a slug-set diff is clean. Unicode/space/apostrophe filenames preserved
      (`slug.ts` lifted verbatim, unmodified). `matchCampaign` reproduces faerrin's historical `Script/` paths
      (N7 parity fixture).
- [ ] **Vellum rendering:** every akasha page renders via gothic — prose/GFM, **resolved** crossref links +
      Popover previews, `:::handout`/`:::edict`, `:::fields`, `:::timeline`. Backlinks / folder-index /
      breadcrumbs / tags / Explorer match `site.ts` semantics (from the snapshot edges, N6).
- [ ] **Islands (7 for v1) in React:** Darkmode/ReaderMode/Popover/Explorer/Graph/Search/TranscriptPlayer all
      work; each cleans up on unmount (N5). Graph renders the force-graph client-only from `contentIndex.json`.
      **TranscriptPlayer plays a transcript without re-rendering the markup** (delegated click + binary-search
      seek + filter; verified on a real ≥1 MB transcript).
- [x] **Transcripts (D4):** transcript pages render from linguist data at `Script/<campaign>/<date>`, proper
      nouns auto-linked against the akasha corpus, audio = external `static-audio` URL, speaker colors from
      ontology-being. Merged into the graph/Explorer. **(slice 7 — N7 parity EXACT 1:1; TranscriptPlayer
      verbatim; Search + the full 7-island gate land in slice 8.)**
- [x] **Search:** the Pagefind index builds at build (NodeJS API, no prerender) and `/pagefind/` serves; the
      Search island returns results over the built site. (Dice dashboard deferred — M3.) **(slice 8 — 217 pages
      indexed; /pagefind/pagefind.js + entry serve 200; Search island SSRs the Ctrl/Cmd-K modal.)**
- [ ] **SSR + deploy:** runs as an SSR Compose service on 10365 (no PORT env), behind a Caddy `astra_site`
      block, fonts self-served from the container, healthcheck green, restart-survives. Telemetry verified —
      `service.name=astra.akasha-frontend` SSR span in SigNoz (MCP); browser RUM posts to the public endpoint.
      (Public DNS deferred.)
- [ ] Memory updated (`thoughts/shared/memory/`) with akasha-frontend's load-bearing gotchas; RESUME "Current
      state" bumped; committed per-slice + pushed.

## Risks

1. **URL parity** (the single hard invariant) — `slug.ts` lifts verbatim and **must not be "improved"**; the
   slug-set diff covers **both** snapshot pages and reconstituted transcript pages. `matchCampaign` drift would
   misfile a transcript → broken URL. **Mitigation:** verbatim `slug.ts`; the captured-faerrin slug set + the
   `matchCampaign` historical fixture are CI tests (N7).
2. **TranscriptPlayer port** — a naive React rewrite re-renders 1.2–1.6 MB of markup. **Mitigation:** SSR-emit
   the line markup; attach imperatively in `useEffect`; port the "DO NOT rewrite reactively" warning verbatim;
   test on a real large transcript.
3. **Crossref-href seam (N3)** — resolved (gothic seam landed); residual is wiring `edges → slug → href`
   correctly so **Popover previews** find real internal targets. **Mitigation:** slice-4 verifies Popover on
   resolved links against real pages.
4. **Pagefind under SSR (N1)** — resolved (NodeJS API spiked); residual is wiring the build step + serving
   `/pagefind/` from the container and matching the `data-pagefind-body` scope. **Mitigation:** build the index
   in slice 8 from the same rendered HTML the SSR routes produce.
5. **Graph/pixi under SSR (M2)** — pixi must stay strictly client-only; SSR/loaders touching WebGL crash.
   **Mitigation:** `<ClientOnly>` + `PixiHost` (strider's proven pattern); no pixi import on the server path.
6. **MPA→SPA lifecycle (N5)** — islands that bound global listeners now leak across client nav. **Mitigation:**
   per-island unmount teardown; audit Popover/Graph/TranscriptPlayer.
7. **Transcript reconstitution + merge** — transcripts leave linguist as data and must rejoin the page graph
   (slugs/edges/backlinks/Explorer) to match faerrin. **Mitigation:** treat the merge as first-class in slices
   3/7; the parity gate (1) covers it.
8. **New-workspace-member ripple** — adding `apps/akasha-frontend` re-runs `bun install` (can bump biome within
   semver) and a partial Dockerfile manifest-COPY breaks `--frozen-lockfile`. **Mitigation:** COPY all app
   manifests; `bunx biome ci .` over the whole repo (the strider/orator lesson).

## Hand-off

akasha-frontend is the akasha **read surface** and the culmination of the content pipeline (vellum-lang →
akasha-backend → here): an SSR Compose service behind Caddy on 10365, consuming the build-time snapshot +
`.vellum` corpus + linguist transcripts, rendering via gothic (with the new `resolveCrossref` seam), search via
a build-time Pagefind index, a client-only pixi force-graph, and reconstituted transcript pages with the
verbatim TranscriptPlayer. URL-slug parity vs faerrin is the cutover gate. It copies the strider SSR template
(`@astra/site-kit` + `@astra/content-build`) — the third frontend to do so. DiceDashboard (weal roll insights)
is the one spec-sanctioned deferral. Next frontends after this: 0012 mouthpiece-fe, 0013 vellum-fe; then Phase
6 cutover.
