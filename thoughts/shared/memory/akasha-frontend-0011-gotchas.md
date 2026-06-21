---
name: akasha-frontend-0011-gotchas
description: Building akasha-frontend (0011) — the wiki read-surface; SSR strider-template port of faerrin aether, scope+spec done, slice 1 (scaffold) built
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
