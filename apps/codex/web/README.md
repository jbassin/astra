# codex — a PF2e reference site: the SSR frontend

codex is a public-but-noindexed Pathfinder 2e reference site (`codex.iridi.cc`, port 10374).
This package (`@astra/codex`) is the **TanStack Start SSR frontend** (`src/routes/`,
`src/server/`, `src/domain/render/`): it reads the current corpus release from disk at
request time and renders it. Two sibling units make up the rest of codex:

- [`@astra/codex-ingest`](../ingest/README.md) (`apps/codex/ingest`): the ingest pipeline and
  its CLI. It builds the canonical, Zod-typed, license-labeled corpus from the
  **foundryvtt/pf2e** compendium packs and the **Archives of Nethys** index, plus assay's
  homebrew store, indexes it with Pagefind, and publishes releases. It also owns the fixture
  corpus this package's tests read.
- [`@astra/codex-corpus`](../../../libs/ts/codex-corpus/README.md): the corpus contract both
  share (schemas, the reader, the release layout and its servability check).

The specs are `thoughts/archive/specs/0029-codex-p1-ingest-spec.md` (ingest) and
`thoughts/archive/specs/0029-codex-p2-entity-pages-spec.md` (frontend).

## Operations

The data dir is `codex.data-path` (`codex/data` under `data.root`, so
`/ruby/data/astra-state/codex/data`): `releases/` (served) and `snapshots/` (ingest input).
The corpus and its Pagefind index ship as **immutable releases**; nothing edits served data.

```
releases/
  <id>/corpus/            the corpus tree (layout in the ingest README)
  <id>/search/pagefind/   the Pagefind index built from that corpus
  <id>/release.json       id, createdAt, entity count, schemaVersion, source pins
  current -> <id>         relative symlink; the one thing a publish or rollback changes
  .staging-*/             a build in progress, never served
```

`<id>` is the first 16 hex digits of a sha256 over every file of `corpus/` and `search/`, so
an identical build reuses its release. The container mounts `releases/` read-only at the same
path. The server reads `current` on every request: a new release that passes the startup
checks gets a fresh reader (its caches belong to that release), a failing one is logged and
refused while the old release keeps serving (for good when it is unservable; after 30 s again
when the failure was an I/O error such as EMFILE), and each request stays pinned to the release
it started on. No restart is needed after a publish or a rollback.

The `just codex-*` recipes below call the ingest CLI (`pnpm --filter @astra/codex-ingest cli
release ...`); its README lists every command.

- **Full refresh** (re-fetch both sources, then `codex-build`): `just codex-refresh`. It refuses
  a dirty `apps/codex/ingest`, because the `corpus-manifest.json` diff it writes must be
  reviewable alone. If that diff is timestamp-only, revert it.
- **Transform-only change** (ingest code or the assay homebrew store changed, sources did not):
  `just codex-build`. It skips the re-fetch, which can pull in upstream drift. It transforms and
  indexes into `releases/.staging-*`, validates, renames to `releases/<id>` and swaps `current`.
  Validation is the server's own check (readable manifest, this `schemaVersion`, not the
  fixture), plus entity files matching the manifest counts, a valid `rules-tree.json` and
  `sources-index.json`, a Pagefind index with one page per entity, and **no fewer entities
  than the current release** (pass `--allow-shrink` when a drop is expected: `just codex-build
  --allow-shrink`). See pruning below. The transform reads code and the homebrew store from the checkout it
  runs in, so run it from a clean checkout at a pushed commit.
- **Search-only change** (`apps/codex/ingest/src/build-search.ts`): `just codex-search-index`
  rebuilds the index over the current corpus (hardlinked) and publishes that as a new release.
- **Roll back:** `just codex-rollback` makes the previous release current; `just
  codex-rollback <id>` picks one. `just codex-releases` lists them, `*` marking `current`. The
  release a rollback leaves is marked rejected (`releases/rejected/<id>`): a rebuild that hashes
  to it, or a rollback to it, needs `--force`, and the default rollback target skips it.
- **Pruning** keeps the 3 newest releases, the current one, and the one the running codex
  serves, which the release builder reads from its `/healthz` after the switch. When codex does not
  answer, nothing is pruned.
- **The release lock** (`releases/.lock/owner.json`) records the holder's pid and start time. A
  lock whose holder is gone is broken, and leftover `.staging-*` dirs from before it are removed.
- **Render-only change** (`src/` only, corpus and index untouched): push, then
  `just deploy codex`.
- **Schema bump order:** merge the code, `just codex-build` from that checkout (the old server
  refuses the new-schema release and keeps serving its own, search included), then `just
  deploy codex`. Deploying first would crash-loop: the new server refuses the old `current`
  at startup. The full procedure is in `docs/runbook.md` ("codex refresh or republish").
- **Verify a deploy against the real corpus.** A built server fails closed: with no
  `releases/current`, a corpus of another `schemaVersion`, or the fixture, it throws
  `CorpusUnservableError` at startup and exits, and compose restarts it in a loop. A good
  deploy logs `[codex] serving the corpus at
  "/ruby/data/astra-state/codex/data/releases/<id>/corpus" (release <id>, source config, <n>
  entities, schemaVersion 5)`, and a switch logs `[codex] switched from release <old> to ...`;
  also check a real entity page such as `/spell/fireball`. `just codex-real-corpus` runs the
  same check on the host, plus spot checks and an SSR render.

## Traps

**Fixture and tests**
- Every test and both Chromium guards read the fixture corpus, which the ingest package
  generates at `apps/codex/ingest/fixtures/entities/` (`fixtureCorpusRoot()` in
  `src/server/corpusFs.ts`): `vitest.setup.ts` and the guard scripts default
  `CODEX_CORPUS_ROOT` to it. The real-corpus checks are the opt-in `just codex-real-corpus`
  (`src/realCorpus.test.ts`, gated on `CODEX_REAL_CORPUS=1`). The dev server has no pin and
  reads the real corpus at `codex.data-path`, from any checkout.
- The fixture corpus is generated and gitignored. `ensureFixtureCorpus()`
  (`@astra/codex-ingest/fixture`, a dev dependency) brings it up to date; vitest's global
  setup (`vitest.globalSetup.ts`), both guard scripts and `regen-goldens.ts` call it, and
  `pnpm --filter @astra/codex-ingest cli fixture` runs it by hand. To change the fixture,
  change an input in the ingest package, never the output; its README describes the inputs.
- `scripts/regen-goldens.ts` runs under `nodeTsResolve.mjs`, which resolves only relative
  specifiers. An `@/*` import in anything EntityPage reaches breaks golden regen while tsc,
  vite and vitest pass.
- DOM tests carry a per-file `// @vitest-environment jsdom` docblock. jsdom lacks
  `HTMLDialogElement.showModal` (tests polyfill it).

**Search index**
- The Pagefind build (the ingest package) is host-only (~3.8 GB RSS). It runs inside `just
  codex-build` and `just codex-search-index`; never in CI or Docker.
- `/pagefind/<path>` answers 302 to `/pagefind/r/<id>/<path>` (`no-store`), where `<id>` is
  the release this server serves (not always `current`), and release-keyed files are served
  `immutable` (`src/server/pagefindRoute.ts`). The client imports
  `/pagefind/pagefind.js`; after the redirect Pagefind derives its base path from
  `import.meta.url`, so one page reads one release's index even across a switch. Don't
  rewrite that import to bypass the redirect.
- Pagefind fragments are gzip; grep decompressed bytes. `meta.title` has no ranking weight and
  weight spans leak into excerpts; exact-name ranking comes from the client-side boost, so don't
  retry index-side weighting.
- `vite dev` does not serve `staticMounts`; `/pagefind/` needs `build` + `start`.

**SSR, routing and hydration**
- Any export in a `createServerFn` file drags its imports into the client bundle, and so does
  any module-scope call into `node:fs` or `loadConfig`. Keep fs in `corpusFs.ts` behind the lazy
  `getCorpusReader()`, server fns alone in `corpusFns.ts`. Verify by grepping the client bundle
  for `readFileSync`/`loadConfig`.
- The corpus contract (Zod schemas, `collectText`, `sluggify`, `collectEmbedTargetIds`) is
  `@astra/codex-corpus` (`libs/ts/codex-corpus`); its `node:fs` reader is the separate
  `/reader` subpath, so client code imports only the root entry. The package's
  `"sideEffects": false` keeps unused Zod schemas out of the client bundle (about 100 KB
  without it); check with `grep -c ZodObject dist/client/assets/*.js` after a build.
- `import.meta.dirname` paths break after `vite build` relocates modules; use `findAppRoot`.
- A loader driven by search params needs `loaderDeps`, or it silently never re-runs.
- The router's search parser decodes `+` to a space, coerces bare numbers, and round-trips
  arrays as real `string[]`. Accept both shapes in `validateSearch`.
- `?entry=` takes the bare slug, not `category/slug`. When rebuilding search from filter state,
  carry `entry` through `filterStateToSearch` explicitly.
- `deriveHeaderTitle` (`router.tsx`) must list every new route family. Standalone h1s are
  sr-only on the premise the header shows the title, so a missed case leaves the page with no
  visible title.
- A resolved depth-0 embed renders a block `<div>`; a paragraph holding one must render as a
  `<div>` (`embedRendersAsBlock`), or hydration mismatches.
- With `hydrateRoot(document)`, React's listeners are siblings of manual `document` listeners:
  only `nativeEvent.stopImmediatePropagation()` blocks them.
- `sources-index.json` is server-only. Client code that needs book abbreviations uses
  `abbreviateBook()`.

**Listings and virtualization**
- The SSR window (`SSR_WINDOW`) is derived from `ROW_PITCH_PX` and the initial rect through the
  real virtualizer; change the inputs, never the constant. The loader ships only the window's
  rows (the dehydration payload was the real weight) and sets an explicit `windowed` flag; the
  client then fetches the full array via `memoizedListing`.
- Programmatic focus in listings uses `{ preventScroll: true }`; coalesce `scrollToIndex` per
  animation frame; timers read current values from a ref; entry navigations pass
  `resetScroll: false`.
- Keyboard Enter on a row anchor is a click with `detail === 0`; let it fall through to native
  navigation. Whole-row click is implemented directly, never by a synthetic `anchor.click()`.
- Tier decisions (pane vs bottom sheet) use the `matchMedia` hook in `BrowseListing.tsx`, which
  mirrors the CSS breakpoint; the container-width flag misreads 700–850 px.

**Styling**
- A closed `<details>` hides its content through `::details-content { content-visibility:
  hidden }`, which no descendant rule can undo. Override `::details-content`, or use a
  conditional render instead of `<details>`.
- A higher-specificity `padding` shorthand beats a lower-specificity `padding-inline`. Check
  column and row geometry in a real browser (`just codex-row-height-drift-guard`), not jsdom.
- `dialog:modal` UA centering breaks on tall content; set `position: fixed; inset: 0; margin:
  auto`.
- Exactly one flex auto-margin owns the header's right push (`.codex-header-nav`).
- Reuse exported orderings and maps (`PINNED_PRODUCT_LINE_ORDER`, `formatFacetValue`'s label
  map); a redeclared copy forks.

**Verification**
- React SSR puts `<!-- -->` between text nodes, so "145 of 145 shown" doesn't match as plain
  text in served HTML. Virtualized listings prove additions by the toolbar count, not row greps.
- Playwright's locator `.click()` scrolls the target into view; use
  `evaluate(el => el.click())` in scroll assertions.
- `codex.port` has no env override (only secrets and the data roots do). A scratch serve needs
  its own `createSsrServer` boot script; never edit `config.kdl` or touch 10374.
- Local telemetry smoke: `pnpm run start` runs under `@astra/observe/register`, which exports a
  host-run process to `telemetry.host-otlp-endpoint` (localhost:10353) as
  `deployment.environment=development`; then check SigNoz.

## The frontend (P2)

Every entity lives at `/{category}/{slug}` (the corpus id, verbatim — `/spell/heal`,
`/creature/red-dragon-adult`, `/spell/heal@legacy`), rendered by one total `CodexNode -> React`
layer (`src/domain/render/nodes.tsx`) plus bespoke statblock/facet headers for the structured
category groups (creature/hazard/spell/equipment/feat). `/` is the category directory (manifest
totals, unchanged since P2); `/{category}` is P3's faceted listing (below) — P2's throwaway A-Z
listing is gone. Crossref + trait-pill hover cards are a ported akasha Popover island
(`src/domain/components/islands/Popover.tsx`), mounted on entity pages only.

**Statblock dedup — the AoN body is the statblock of record (P7, D29-72).** When
`entity.body.length > 0` (a joined or AoN-only entity), `entityPage.tsx` suppresses the
structured render entirely: `CreatureStatblock`/`HazardStatblock` AND `EmbeddedItemSections`
(any category — creature 3,672 + hazard 506 + vehicle 83 + warfare-army 7 joined pages at
P7 build time). Foundry-only entities (`body: []`, incl. all `variantOf` variants) keep the
full structured render. The predicate is **body-presence, not `aonUrl`** (a no-markdown join
can set `aonUrl` with a Foundry-fallback body) and deliberately not a category list.
`MastheadExtraFallback` is never suppressed — it re-surfaces masthead pairs *stripped from*
the body at ingest (D29-62; the 545 hazard "Complexity" lines live only there). Within the
surviving structured render: strike rows show the transform-baked `range` string as a
parenthetical after the trait pills (D29-73), `type:"lore"` embedded items are excluded from
the abilities bucket (their bonus lives in the Skills row via D29-74's transform merge), and
empty stubs (no body/traits/actionCost) are skipped (D29-76). Skill labels humanize slugs
word-by-word (`gambling-lore` → "Gambling Lore", `humanizeSlug` in `SkillsRow` + `statsText`
— JSON keys stay slugs).

`renderNodes`' one structural gotcha (S5 real-corpus find, fixed): a `paragraph` whose children
include a RESOLVED, depth-0 `embed` node must render as `<div class="codex-content">`, not `<p>`
— `renderEmbed` inlines a resolved top-level embed as a block `<div class="codex-embed-card">`
(D29-25), and `<p>` can't legally contain a `<div>`. The B2 guard (`paragraphCarriesBlockContent`
in `nodes.tsx`) already handled this for block-carrying `localizedBoilerplate` children; it was
missing the identical case for `embed` children, which only showed up on entities whose prose
places an embed inline in running text (e.g. `creature/red-dragon-adult`'s `creature-family`
reference) — a hydration mismatch the P2/P3 build-slice sweeps never happened to hit until the
P3 S5 full-corpus Playwright pass. Fixed by asking the SAME question `renderEmbed` asks
(resolved ∧ depth 0 ∧ not-yet-visited → block) via a shared `embedRendersAsBlock` predicate.

- **`src/server/{corpusFs,corpusFns,entityPageData,directoryData,listingData}.ts`** — the
  corpus read layer. The reader is `createCorpusReader(rootDir)` from
  `@astra/codex-corpus/reader`, the only `node:fs` seam; `corpusFs.ts` decides which root it
  reads. `servedCorpus()` picks the root once per process: `CODEX_CORPUS_ROOT` if set, else
  `<codex.data-path>/corpus`, and checks its `manifest.json` against `CORPUS_SCHEMA_VERSION`
  (`@astra/codex-corpus`). A built server refuses a missing corpus, another schema
  generation, or the fixture at the config path; the server entry `src/server.ts` runs the check
  when the bundle loads, so the process exits instead of serving. Only the Vite dev server falls
  back to `fixtures/entities/` (with a WARN) when the config corpus is missing; it fails if that
  fixture was never generated (`pnpm --filter @astra/codex-ingest cli fixture`). `corpusFns.ts` wraps the pure resolvers (`entityPageData`/`directoryData`/
  `listingData`) as `createServerFn`s the route loaders call.
- **`src/domain/render/`** — the total node renderer, statblock/facet headers, edition
  banners, trait pills, and the listing/directory presentation components.
- **`src/routes/`** — `__root.tsx` (header omnibar + legacy toggle, every page), `index.tsx`
  (category directory), `$category/index.tsx` (P3 faceted listing), `$category/$slug.tsx` (entity
  page), `search.tsx` (P3 `/search`, below).
- **Run it:** `pnpm --filter @astra/codex dev` (`CODEX_CORPUS_ROOT` if set, else the real
  corpus if `<codex.data-path>/corpus/` exists, else the fixture; `start` has no fixture fallback) / `pnpm --filter @astra/codex build && pnpm --filter @astra/codex start` (production
  parity, wires `astra.codex` OTel spans via `@astra/site-kit`'s `createSsrServer`). **Note:**
  `staticMounts` (below) is a `createSsrServer`-only mechanism — `/pagefind/*` only serves under
  `build && start`, not under plain `vite dev`.

## Browse (P3 S1/S3, D29-32/33/35)

`/{category}` ships a data-derived facet panel over the FULL enriched row set for that category
(client-side filtering, no server round-trip per interaction — the corpus's own `_index.json`
rows already carry everything needed).

- **Facet model, two committed modules.** `libs/ts/codex-corpus/src/schema/facetKeys.ts` (S1, transform-owned) is the
  per-category facet-KEY allowlist — the classifier's verdict on the real corpus baked into a
  plain data table, imported unchanged by `emit.ts` (which per-category-trims `IndexRow.facets`
  to exactly this allowlist) and by `src/domain/browse/facetDefs.ts` (S3, UI-owned), which pairs
  each allowed key with its widget metadata (`{widget: enum|tristate|range, labelMap?, parse?}`).
  A conformance test (`facetDefs.test.ts`) asserts the two modules' key sets match exactly, every
  key round-trips against the fixture corpus schema, and label maps are total. The classifier
  itself: GOOD-FACET = coverage ≥40% ∧ cardinality 2..~60 (soft — `equipment.usage` ships at 116
  because its top-15 values cover 76%); RANGE-FACET = numeric wide-spread (level/hp/ac/price/
  bulk/saves/perception); LIST-FACET = short bounded-cardinality arrays (traits, traditions).
  `featLevel`/`rank` are BANNED spillover keys (proven exact duplicates of `level`). Every
  category gets the CORE facets (level, rarity, traits, source.book, edition — level hidden where
  a category has 0% coverage); 15/88 categories additionally carry classifier-derived facets
  (the pinned big-12 sets — feat/creature/equipment/spell/hazard/weapon/class-feature/action/
  rules/item-bonus/trait/deity — spec §2 D29-32 lists each set verbatim); the other 73 are
  core-only. Trait case-folding (1,082 raw strings → 644 distinct) lives at the UI layer only —
  corpus data stays verbatim, P2 entity pages are untouched.
- **Filter engine** (`src/domain/browse/filterEngine.ts`) — pure, over rows already in memory:
  traits are tri-state (AND across includes, NOT across excludes); enum facets are multi-select
  OR; numeric facets are min/max over parsed values (price parses `pp/gp/sp/cp` → copper, `per 10`
  divides for per-item value); entities missing a facet key form an implicit "—" bucket (an
  include-selection drops them, an exclude never matches them, range filters ignore them unless a
  "has value" bound is set — the per-facet UI reports an "N without data" count). Sort was name
  (default, letter-anchored A–Z, `content-visibility: auto` per section — no virtualization
  dependency) or level (ascending, "—" bucket last) — **superseded by P8's sortable column
  headers + flat table register (see the P8 section below)**; rarity/source stay filters.
- **URL codec** (`src/domain/browse/urlState.ts`) — human-readable, round-trip-tested:
  `?traits=fire,-agile&level=-2..5&rarity=rare,unique&f.actionCost=1,reaction&q=drag&legacy=1`.
  Core facets are bare keys; derived facets are namespaced `f.<key>`. **Include sigil = no
  marker; exclude = a leading `-`** — a bare `+` include marker would silently decode to a space
  (`URLSearchParams`'s `application/x-www-form-urlencoded` convention, which the router's `qss`
  codec inherits), so there's no include marker at all; no folded trait starts with `-`, so the
  exclude marker is unambiguous. The codec also tolerates the router's own bare-numeric coercion
  (`legacy=1` arrives as the number `1`, not the string `"1"`). Unknown params are ignored; the
  empty state encodes to a clean URL (`{}`).
- **Legacy toggle** (`src/domain/browse/legacyToggle.ts`) — one module-scope
  `useSyncExternalStore` value shared by the header control and every browse/`/search` route,
  persisted to `localStorage` (`codex:legacy`). **Precedence:** the URL's `legacy=1` wins ONLY on
  the very first document load (seeded at ES-module-eval time, before any component's mount
  effect can race it); every subsequent client-side navigation preserves the LIVE toggle
  (internal links never carry a `legacy` param); each route reflects the live value back into its
  OWN url via a router search replace, so the address bar stays copy-shareable at all times.
  Listings show "N of M shown"; `/` keeps manifest totals regardless.

## Search (P3 S2/S4, D29-34/36)

`apps/codex/ingest/src/build-search.ts` builds a [Pagefind](https://pagefind.app) index offline from
the corpus and writes it to `data/search/pagefind/` (sibling of `data/corpus/`, gitignored). It
walks every entity via the same `createCorpusReader` fs layer the frontend reads through, extracts
plain text (`collectText`/`statsText`, `@astra/codex-corpus`) from `body` + `loreBody` +
the creature/hazard `stats`/`facets` statblock — `statsText`'s skills line includes the D29-74
merged lore skills, humanized (`gambling-lore` indexes as "Gambling Lore"), so lore skill names
are searchable after a reindex — and calls Pagefind's `addCustomRecord` directly
with structured `meta` (title/category/level/rarity/edition/book) and `filters`
(category/rarity/edition/level/superseded/traits — traits case-folded lowercase, corpus data
itself stays verbatim). `server.ts` serves the bundle at `/pagefind/` via `@astra/site-kit`'s
`staticMounts` (codex's first use of the mechanism) — registered unconditionally, no startup
existence check, since a `StaticMount` fails soft per request: `/pagefind/*` 404s until an index
exists, and a freshly-built index comes online with no server restart.

> ⚠️ **Host-only, ~3.8 GB RSS.** The native Pagefind indexer's peak memory during `writeFiles`
> over the full ~46,192-entity corpus is ~3.8–4 GB (measured) — this build step must **never**
> run in CI, a Docker build, or `vite build` (`pnpm -r run build` only ever invokes
> `vite build` for codex). Run it on the host via `just codex-search-index`, or as the last step
> of `just codex-refresh` (transform → search index). A real run takes ~25–35s and produces a
> **203 MB** bundle (measured 2026-07-15, P5 sizing pass) — `fragment/` 184 MB (46,192 files,
> 1:1 with entities), `index/` 18 MB, `filter/` 668 KB (fragments/index/filter chunks + the
> Pagefind runtime JS/wasm). Corrects an earlier "~50–55 MB" estimate in this doc.

**`buildSearchIndex()` `rm -rf`s `outDir` before every `writeFiles` call.** Pagefind's own
`writeFiles` is NOT idempotent against a pre-existing output directory — its content-hashed
fragment/chunk files accumulate across re-runs instead of being replaced, so re-running the build
without clearing `outDir` first leaves stale hashed files alongside the new ones (an S2 real bug,
found + fixed the same slice `writeFiles` was wired up — mirrors `emit.ts`'s own long-standing
"wipe before write" posture for `data/corpus/`).

Two client surfaces share one runtime-loader seam (`src/domain/search/pagefindClient.ts`,
`loadPagefind()` — a memoized dynamic `import(/* @vite-ignore */ "/pagefind/pagefind.js")`, so a
visit that already warmed one surface doesn't re-fetch the runtime) and the same shared
`BrowseEmptyState` (M6) for zero-result rendering:

- **The header omnibar** (`src/domain/search/Omnibar.tsx`) — present on every page, lazy-loads the
  Pagefind runtime on first focus, 180ms-debounced type-ahead grouped by category (top ~8,
  rendered straight from result `meta` — no per-keystroke fragment fetch beyond what's shown).
  Ctrl/Cmd-K focuses; ↑/↓/Enter/Esc drive the dropdown; Enter with nothing highlighted (or the
  "all results" row) goes to `/search?q=…`.
- **`/search`** (`src/domain/search/SearchPage.tsx`, mounted client-only inside an SSR shell that
  serves a `<noscript>` notice — search can't SSR, the index is client-fetched) — a query box plus
  a Pagefind-`filters()`-sourced facet panel (category/rarity/edition/level/traits), results with
  Pagefind's own `<mark>`-highlighted excerpts, and the same URL-shareable codec pattern browse
  uses. The legacy toggle applies as a `superseded:false` Pagefind filter unless legacy is on.
  Two visible results sharing a display name append their `source.book` inline (the same
  collision rule D29-35 defines for listings, M5).
- **Fail-soft**, everywhere: no index built (or the index dir renamed away) → `pagefind.js` 404s →
  `loadPagefind()` resolves `null` → the omnibar renders disabled with an "index not built" title
  and `/search` shows the same notice — no restart needed once a real index lands (`StaticMount`
  re-checks per request).

> **Known ranking limitation (not a codex bug): single common-word name queries.** Pagefind's
> default TF-based ranking gives `meta.title` no boost in the `addCustomRecord` path — searching
> `heal` does not surface `/spell/heal` in the top results at 46k-page scale (it loses to shorter,
> topically-dense pages like "Healer's Gel"). Injecting a `data-pagefind-weight` span around the
> name was tried and reverted (S4): it didn't move ranking meaningfully at this corpus size, and
> it leaked the raw weight-attribute text into Pagefind's excerpt window on exactly the query that
> matters most (the name match itself). Distinctive/multi-word names ("red dragon") rank
> correctly — that's the acceptance-gate query class this repo tests against; do not re-attempt
> weight tuning without a new decision.

CI's own coverage is hermetic: `apps/codex/ingest/src/build-search.test.ts` runs the exact same
`buildSearchIndex()` against the generated fixture corpus into a fresh `os.tmpdir()` dir (never
`fixtures/` or `data/`) — `pagefind` is a plain npm devDependency, so this needs zero network and
none of the host-only memory profile above (that only shows up at real-corpus scale).

## Rules browser, attached sidebars, sources index (P4, D29-39..45)

`/rules` is now a **tree browser** (the P3 faceted flat listing for the `rules` category is
gone), rules entity pages gain hierarchy navigation (breadcrumb + a sidebar + a page-turn
pager), every category can render **attached sidebars** on its host pages, and `/sources`
adds an aggregate book index. One transform slice feeds all four; see
`thoughts/archive/specs/0029-codex-p4-rules-browser-spec.md` for the full decision record
(D29-39..45) — this section is the durable "how it works" summary.

### The tree model — sibling chains, not page-turn

AoN ships each rules doc with `breadcrumbs` (its ancestor-name chain) and raw
`next_link`/`previous_link` fields. **The raw links are NOT a page-turn sequence — they are
per-level SIBLING chains**, measured empirically: 0/3,642 `next` hops ever descend into a
subtree, 780 targets are claimed by 2–4 docs at once (always an ancestor/descendant set),
986 `next`/`prev` pairs are asymmetric, and 106 hops cross book boundaries entirely. Walking
them naively would resurrect all of that noise into the UI. Instead:

- **Parent resolution** (`apps/codex/ingest/src/rulesTree.ts`): a node's parent = the doc in the SAME
  book whose `name` matches the parent breadcrumb element AND whose own breadcrumb path is
  the child's path minus its last element (the path-prefix rule — a single index lookup,
  since every doc's `breadcrumbs` already IS its full ancestor chain). Where that fails, a
  name-only fallback within the book prefers a breadcrumb-less (root) doc. Where that also
  fails, a **synthetic placeholder node** (`id` absent) stands in — pinned at exactly **2** in
  the real corpus (amended down from the spec's provisional pin of 3 at S1 build time, and
  verified against the raw snapshot; the report-visible STOP if this count ever grows on a
  refresh). Any remaining ambiguity (>1 candidate at either step) tie-breaks on lowest
  `aonId`.
- **Sibling ordering**: children at every level are ordered by the `next` chain **restricted
  to that sibling group only** — a link only counts as an edge if its target is another
  member of the SAME group; the head is the member no other member targets; unchained
  members sort alphabetically after the chained ones. Cross-level/cross-book raw links are
  structurally unreachable from this algorithm (they're never even compared).
- **The entity-page previous/next pager is DFS-derived, not link-derived.** `treeModel.ts`'s
  `dfsPreOrder` flattens each book's tree in pre-order (root, then children depth-first —
  the exact order the builder already emits `children` in); the pager is just `arr[i-1]`/
  `arr[i+1]` around the current node in that flattened array, scoped to one book. This is
  genuine page-turn navigation — a chaptered node's "next" descends into its own first
  child — and it's symmetric and one-sided at book ends by construction. **There is
  deliberately no `readingOrder` entity field anywhere in the corpus** — raw links are
  consumed transform-internally for sibling ordering only, never persisted, never mirrored
  in the pager. This is an intentional divergence from AoN's own site navigation (whose raw
  links skip subtrees, hop books, and can't round-trip) — a re-decision, not a bug, if a
  future stakeholder wants AoN-mirroring instead.

### Two new corpus artifacts

- **`data/corpus/rules-tree.json`** (`libs/ts/codex-corpus/src/schema/rulesTree.ts`) — `{books: [{book, edition,
  license, hiddenWhenLegacyOff, nodes: TreeNode[]}]}`. `TreeNode = {name, id?, superseded?,
  children}`; `id` (a `CodexId`) is present for every node backed by a real rules doc, absent
  for a synthetic node. `hiddenWhenLegacyOff` precomputes the D29-40 "N hidden" legacy-toggle
  note per book (two real books measure 100% here — Dark Archive 29/29, Guns & Gears 65/65 —
  their "(Remastered)" twins carry the content; the tree browser renders these as a
  collapsed "all N hidden" header, never a silently-dropped section). Node arrays are
  emitted in FINAL order (DFS-ready) — array order is meaningful data here and untouched by
  `canonicalJson`'s object-key sort.
- **`data/corpus/sources-index.json`** (`libs/ts/codex-corpus/src/schema/sourcesIndex.ts`) — one row per
  normalized `source.book` string across the WHOLE corpus (not just rules), grouped by AoN
  `primary_source_category` ("product line"). `productLine` is absent for the ~253-book
  "Other" bucket (Foundry-only book strings with zero AoN citations — expected, not a gap;
  renders last and collapsed on `/sources`). `license`/`edition` are the same book-level
  derivation `rules-tree.json`'s book sections use. `categoryCounts` (`{category: count}`,
  added at S4) feeds each book row's per-category filtered-browse link with a real count
  instead of over-counting via the book's total `entityCount`.

### Breadcrumb + book-name normalization policy

Every breadcrumb element is trimmed, stripped of embedded `\r`/`\n`/`\t`, and whitespace-
collapsed BEFORE any grouping (the real corpus has 192 docs — all Gamemastery Guide
"Chapter 2: Tools" descendants — carrying a literal `\r\n` inside the raw string; left
unnormalized, this would fork one tree into two). Book names go through the same mechanical
normalization (`apps/codex/ingest/src/bookNormalize.ts`): trim/CRLF/whitespace-collapse, case-fold
dedup (a no-op today, 0 collisions, kept for future-proofing), and a conservative prefix
rule (`"Pathfinder " + <existing AoN book name>` merges into that name — 23 of 519 raw
strings, 408 entities). This is **mechanical only, no hand-curated alias map** — residual
splits among the ~496 post-normalize book strings are an accepted, recorded trade-off, not
a gap to chase.

### Attached sidebars — depth-1 posture, host-owner resolution

A sidebar's own `url` field IS its host page's AoN url — that's the whole attachment
mechanism (sidebars carry no `breadcrumbs` and no `next`/`previous` links at all). **65 host
urls are shared by multiple corpus entities** (a class page's url is also carried by its
60+ class-feature docs) — attaching by a naive `aonUrl` scan mis-targets the wrong entity at
scale, so the reverse-join goes through the link table's `pickCanonical` page-owner rule →
`aonId` → the post-identity `aonIdToFinalId` map (the pre-collision S5d repoint seam is the
wrong join for this — it returns ids from BEFORE `@legacy`/`-2` suffixing). The host entity
gains `attachedSidebars?: CodexId[]`, ordered by name then `aonId`. `EntityPage` renders
these as styled `<aside>` cards after the body, on **every category** — title, full body,
citation, and a link to the sidebar's own standalone `/sidebar/{slug}` page (which stays
canonical regardless). **Depth is pinned at exactly 1** — an attached sidebar's own body
never recurses into further attached sidebars (not a shape the data produces, but the
renderer guards it anyway); an `embed` reference INSIDE a sidebar's body still resolves
normally at its own +1 depth (the M7 posture — embeds are a different mechanism from
attachment and aren't depth-limited by this rule).

### The host-only search-index rebuild note — unchanged by P4

`attachedSidebars` and `breadcrumbs`/the tree/sources artifacts are **not** inputs to
`apps/codex/ingest/src/build-search.ts` (it only ever reads `body`/`loreBody`/`stats`/`facets` text off
each entity) — a P4-only corpus refresh needs no Pagefind rebuild. The host-only,
~3.8 GB-RSS `just codex-search-index` posture from P3 is untouched.

## UX rework + bespoke restyle (P4.5, D29-46..52)

P4.5 is frontend-only — no corpus/transform change (fixtures untouched) — and reworks five
independent surfaces per stakeholder redirect at P4's exit gate H: the whole visual system,
global nav + a real landing page, the legacy-toggle mechanism, category browse, and a
page-surface restyle sweep. See
`thoughts/archive/specs/0029-codex-p45-ux-restyle-spec.md` (D29-46..52, §8 build record) for
the full decision ledger.

### Parchment theme, self-hosted fonts, `src/ui/` (S1, D29-46)

codex no longer imports `@astra/gothic` — the dependency and its `theme.css` import are
gone from `package.json`/`__root.tsx` entirely, replaced by a codex-owned `src/styles/
tokens.css` (the style-tokens doc's palette, resolved under the SAME `--color-*`/`--font-*`
names `globals.css` already consumed, now pointing at parchment values instead of
gothic's dark-void ones) and a `src/ui/` module (`Input`, `Button`, `traitBucket.ts`,
`ErrorChip`, `EditionIcon`, `GlyphDefs`). Trait pills live in `domain/render/traits.tsx` and
action glyphs, with the corpus's action-cost vocabulary, in `domain/render/actionGlyph.tsx`. Four self-hosted font families via
`@fontsource` per-weight CSS imports in `__root.tsx` (mirroring the pre-existing
`ibm-plex-mono` two-file pattern): Cinzel 700 (`--font-display`, H1 chapter titles),
Cormorant SC 600 (`--font-heading`, H2/H3), EB Garamond 400/400-italic/600/700
(`--font-body`), Oswald 500/700 (`--font-condensed` — **`--font-mono` renamed**, repointing
the app's existing "mechanical voice" slot rather than adding a parallel token; every
current `var(--font-mono)` call site was already statblock/omnibar/rules-tree/citation UI
text, never a genuine code block). `@fontsource/ibm-plex-mono` itself is dropped. Alegreya
SC (the style doc's caption face) is deliberately **not** shipped — no art-plate/
illustration component exists to consume it; add it if one ever does, not before. The
dark-theme pre-hydration script and both `suppressHydrationWarning` props on `<html>`/
`<body>` are deleted outright — parchment is the only theme now, no attribute stamp
needed. All five `gothic-card*` class sites renamed `codex-card*`.

### Global header nav + landing page (S2, D29-47)

The old brand+tagline+Omnibar header is replaced by a categorized dropdown nav spanning
**all 88 real corpus categories**, defined once in `src/domain/nav/navData.ts` (Player 39 ·
Spells 4 · Equipment 13 · GM 15 · Rules 8+1 (direct link + dropdown tail) · Setting 5 ·
Sources 0 (direct link) · Everything 3 (catch-all) = 88 exact, conformance-tested against
the real category list). Each dropdown is a disclosure (click or hover-intent, no
headless-UI dependency) with a real `<details>`/`<summary>`-or-equivalent no-JS
degradation — every category's plain listing link is reachable with JS disabled. The
"Rules" nav item is a split control (adversarial M4 — a `<summary>` can't be an `<a>`): a
plain link to `/rules` plus a separate caret button as its own tab stop opening the
8-category tail. `/` is now the R4 landing page — eight linked tiles (Creatures, Spells,
Feats, Equipment & Items, Classes, Ancestries & Backgrounds, Rules, Sources) under a
front-and-center search box. That hero search is a **distinct** lightweight component
sharing `pagefindClient.ts`'s memoized runtime-loader promise with the header `<Omnibar>`
— NOT a second `<Omnibar>` mount, since `Omnibar` registers its own global Ctrl/Cmd-K
`document` keydown listener per instance and two mounts would race for focus; the hero
registers no hotkey of its own. The old throwaway category-directory `/` page moves,
unchanged, to a new demoted route, `/categories` (same `getCategoryDirectory` server fn and
`CategoryDirectory` component — only the route file moved).

### Edition/legacy rework: `superseded` param + forever-alias (S3, D29-48)

The global legacy toggle — `domain/browse/legacyToggle.ts`'s whole `useSyncExternalStore`
mechanism, its `codex:legacy` localStorage key, and the module-eval-time URL-wins seed — is
**deleted outright**, along with every one of its 7 consumer call sites. **No replacement
global/persisted preference exists** (R3's "one control everywhere" means one *semantics*
and *default*, not one shared piece of client state): every surface's edition-visibility is
now a **plain per-page URL read**, default hide-superseded when the param is absent. This
collapses the old two-phase-hydration reconciliation dance (`hasHydrated`/`liveLegacy`) to a
bare `search.superseded === true` read at all four sites that carried it — `$category/
index.tsx`, `$category/$slug.tsx`, `rules.tsx`, and `SearchPage.tsx` (whose block is deleted
along with the `legacy` field entirely, since search never filters superseded content by
default). `RulesLayout` gains a genuinely new `superseded` prop (it never had one before —
it called `useLegacyToggle()` internally).

The URL param is renamed `legacy` → `superseded` (self-documenting parity with
`IndexRow.superseded`/Pagefind's own `filters.superseded` key). **Back-compat, decode
forever, not a deprecation window:** `legacy=1`/`legacy=true` still decodes as an alias for
`superseded` at every validator that reads it; the encoder emits only `superseded`, so
shared links naturally migrate on the next in-app navigation. **Correction (P5, D29-53
scope pass): no HTTP redirect exists anywhere in codex** — an earlier draft of this doc
claimed a "pre-existing 307" canonicalization hop; there isn't one. The alias decode is
pure client-side (`src/domain/browse/urlState.ts`): an old `?legacy=`-style link renders
in-place with `legacy` read as `superseded`, and the encoder simply re-emits `?superseded=`
on the next in-app navigation (no server round trip, no redirect, no status code involved).
**Search (Omnibar + `/search`) never hides superseded content by default** (R3's
explicit carve-out) — verified against the real corpus: `spell/magic-missile` (`edition:
legacy`, `remasteredAs: ["spell/force-barrage"]`, i.e. superseded) surfaces in a bare
`?q=magic+missile` search with no param, edition pill visible. `/rules` keeps D29-40's
"no facet panel" stance but gains a small inline "Show N hidden (superseded) →" link next to
the tree's quick-filter, toggling the URL param directly.

### Split-column browse + filter drawer (S4, D29-49)

Every `/{category}` except `rules` (which keeps P4's dedicated tree browser — its trail/
sidebar/pager already gives an equivalent context+content experience) is now a
5e.tools-style split view: the existing always-visible `FacetPanel` `<aside>` moves inside a
native `<dialog>` filter drawer (zero section-level changes — only the container changed)
with an active-filter pill summary row above the list; the list itself gains a right pane
showing the FULL, unmodified `getEntityPage`/`EntityPageData` render for whichever row is
selected via a new `?entry=<slug>` URL param.

**Loader mechanics, the two folded blockers:** the `/$category/` route declares
`loaderDeps: ({search}) => ({entry: search.entry})` — without it, TanStack Router treats
`/feat?entry=a` and `/feat?entry=b` as the same cached match and the loader never re-runs on
a row click (B1). With `loaderDeps` in place, the loader would naively re-fetch the entire
category listing (8,485 rows for `feat`) on every click — the fix is `listingClient.ts`'s
`memoizedListing()`, a module-scoped, category-keyed client cache mirroring
`pagefindClient.ts`'s own memoized-runtime-loader idiom (B2). **Measured live:** a fresh
page load's very first client-side loader invocation (which is unavoidably the first row
click, since that's the first time `loaderDeps` changes) issues exactly one incidental
`getCategoryListing` fetch alongside its `getEntityPage` fetch — this is the memo's own
documented "fetch once per page load" contract firing for the first time, not a per-click
cost; every subsequent row click on the same page load (proven across repeated clicks and a
facet-state change) issues `getEntityPage` alone. Desktop row clicks intercept navigation
(`navigate({search: {...search, entry: row.id}})`, a plain push so browser back/forward
step entry-to-entry — verified live); a facet-state change preserves `entry` verbatim (B3);
below the 56rem breakpoint, row taps fully navigate to the canonical `/{category}/{slug}`
instead, carrying `?superseded=1` when the view was widened (M7, verified). Both fail-soft
branches render server-side, never a 404, with the listing still intact: an `entry` naming
a real slug the current filters exclude shows "isn't shown under the current filters"; a
genuinely unknown slug shows "wasn't found in `{category}`." The `contain-intrinsic-size`
`content-visibility:auto` placeholder was re-tuned `400px → 640px` for the split view's
narrower list column (a row's fields wrap onto more lines than the old full-width listing),
verified scroll-stable 40,000px deep into feat's 8,485-row list.

### Restyle sweep (S5, D29-50)

Statblock header rows (name + level tag in `--font-condensed`, the ◈ action-diamond glyph,
a hairline rule), the trait-pill row, bold-label/regular-value stat lines, the tan/blue
callout treatment for existing flavor-vs-mechanical asides, and a gold double-line
notched-corner frame on `codex-card-inset` land across every entity page. `/rules`'
book-section headers/breadcrumb trail, `/sources`' book-row table (zebra tint, thin gold
rule under the header), and `/search`+Omnibar's chrome all restyle to the same system;
listing rows carry the row-pill treatment kept from the S4 perf gate (a production-build
`/feat` filter-interaction measurement showed no regression from adding it). Citation/footer
restyle only — no change to what they render.

### S6 acceptance sweep — weights, telemetry, hermeticity

Measured fresh against the production build (`pnpm build && pnpm start`), real 46,192-entity
corpus, one shared Playwright console/`pageerror` listener across every route the phase
touched (`/`, `/categories`, `/feat` incl. a real `?entry=`, `/spell` incl.
`?superseded=1`, a mobile-viewport `/spell`, `/rules` incl. `?superseded=1`, `/rules/
counteracting`, `/rules/building-creatures@legacy?superseded=1`, `/spell/heal`, the legacy
`/spell/magic-missile`, `/creature/red-dragon-adult`, `/sources`, `/search`, plus a drawer-
open + 3-row-click interaction pass on `/feat`) — **zero hydration/console errors.** Weights
vs the P4 baselines: `/rules` 401,257 B raw / 79,339 B gz (was 393,058/78,044); `/sources`
705,112/64,978 (was 696,918/63,869); the heaviest attached-sidebar host,
`rules/building-creatures@legacy?superseded=true` (the canonical form after the
redirect above), 414,846/80,424 (was 378,215/77,866 under `?legacy=true`) — every increase
tracks the new fonts/nav chrome/restyle markup, none disproportionate. New this phase: `/`
(landing) 12,204/2,991 B; `/feat?entry=<slug>` (full split-view response) 5,814,711/536,873
(the listing alone is 5,795,488/532,301 — the right pane's entity render adds ~19 KB raw);
first-paint font payload on `/` is 4 woff2 files / 70,532 B total (only the weights actually
used above the fold — Cinzel 700, Oswald 500, Cormorant SC 600, EB Garamond 400). Row-click-
to-paint latency (production build, 6 clicks): 324.7 ms cold (first-ever click, includes the
one-time listing warm-fetch above) then 51.2/49.0/64.5/66.6/64.9 ms warm, avg ~59 ms
excluding the cold sample. Filter-interaction latency (toggle a Rarity checkbox, 5 samples):
124.3/109.3/81.9/118.9/121.6 ms, avg 111.2 ms — consistent with S4/S5's own measured range,
no regression. Tree interaction latency is unchanged from P4 (not re-measured; P4's
tree/trail/pager mechanics are untouched by this phase).

Telemetry (acceptance G): a local OTLP smoke, same method as P4 S5 — `initTelemetry(
"astra.codex", {endpoint: "http://localhost:10353"})` called explicitly before
`createSsrServer`'s own config.kdl-default init (the `@astra/observe` module-singleton
guard makes the first call win), then real hits to `/`, `/feat?entry=...`, `/categories`,
`/search`, `/rules`, `/creature?entry=...`. Verified via the `signoz_*` MCP tools: all six
routes present as `SSR GET <route>` spans, `responseStatusCode: 200`/`hasError: false` on
every one.

Hermeticity (both lanes, `data/` renamed OUT of tree to system `/tmp`, restored after):
TypeScript (`vp run -r typecheck`, `oxlint --type-aware --deny-warnings`, `format:check`,
`vp run -r test` — codex falls back to the fixture corpus with its own loud startup WARN,
**73 files/1,435 tests**, `vp run -r build`) and Python (`ruff check`, `ruff format --check`,
`ty check`, `pytest`) both green with `data/` absent. `manifest.json`'s `totalEntityCount`
(46,192) and a `find`-based recount reconciled exact post-restore; codex's own suite re-run
once more against the real corpus, still 73 files/1,435 tests green.

## The ingest pipeline

The pipeline that builds the corpus (fetch, parse, join, emit, the transform report, the
fixture generator, the Pagefind index and the release builder) is its own package,
[`@astra/codex-ingest`](../ingest/README.md). Its README holds the pipeline shape, the
corpus layout, the transform report, join aliases, hard fails and the fixture.

## Deploy (P5, D29-53..57)

Codex ships as an SSR Compose service on the **heartwood-frontend model, not akasha's**:
its build (`deploy/node.Dockerfile`, `CONTENT=none`) is corpus-free (D29-54) — the build is
already request-time-only (D29-31: `vite.config.ts` has no content step, no `src/generated/`),
so `docker build` needs config.kdl + app source only.
The ~891 MB of corpus + Pagefind data never enters the image.

**Read-only bind mount, identical path (D29-53).** `config.kdl`'s `codex.data-path` is a
host-absolute path consumed verbatim both by `pnpm start` on the host and by the container at
request time, and plain config fields have no env-override mechanism (config-single-source
forbids a per-environment fork). So the compose unit mounts the releases dir at the *same*
path inside the container as on the host — the same convention the Dagster pipeline volumes
already use (`deploy/docker-compose.yml`), applied to a frontend for the first time:

```
/ruby/data/astra-state/codex/data/releases:/ruby/data/astra-state/codex/data/releases:ro
```

`current` is a relative symlink, so it resolves the same way inside the container.

Since 0037 item 2c the data dir lives under the one data root (`data.root`
`/ruby/data/astra-state`, `codex.data-path "codex/data"`), not in a code checkout; the
`data/` paths below are relative to it.

`data/snapshots/` (601 MB, runtime-unreferenced ingest input) and `data/tmp/` deliberately
stay off the mount list — only the releases the running server actually reads.

**No fixture in prod.** The runtime image does not contain `fixtures/` (`.dockerignore` denies
it), and a built server never falls back to it. If a deploy's mount is missing or a fresh host
has no release yet, the container exits at startup with `CorpusUnservableError` and compose
restarts it until `just codex-build` publishes one. `CODEX_CORPUS_ROOT` can still point a built
server at the fixture explicitly; the tests and guards do that, production compose never sets it.

**Refresh in prod.** `just codex-refresh` and `just codex-build` publish a release and swap
`releases/current`; the running container follows on its next request, with no restart and no
degraded window. The flat layout (`data/corpus/`, `data/search/`) predates releases;
`just codex-migrate-releases` turned it into the first release once (hardlinks, so the flat dirs
stayed intact until they were removed by hand).

**Noindex, three layers (C-1).** (1) SSR HTML always carries `<meta name="robots"
content="noindex">` (`src/routes/__root.tsx`, ships regardless of deploy). (2)
`apps/codex/web/public/robots.txt` (`Disallow: /`, this slice) lands in `dist/client` and serves
at `/robots.txt` through the existing static path. (3) The edge Caddy stanza sets
`X-Robots-Tag: noindex` (S2 — `sites.caddyfile`, not part of this slice). No sitemap, ever;
codex stays off ledger's landing grid by inaction.

## P6 — gate-H feedback round (R1–R11, D29-59..71)

Eleven items across four parallel worktree tracks (A ingest/render main-tree, B CSS+glyphs+
footer, C search+filter semantics, D abbreviations) + a serial Integration merge — spec
`0029-codex-p6-feedback-spec.md`. Merge order A→B→C→D (D rebased onto merged A+B+C first,
D29-71); B's merge conflicted only on the 3 SVG-bearing goldens (both A's masthead-strip and
B's glyph swap touched them, exactly the golden policy's predicted overlap), C merged clean,
D's rebase onto the 4 shared files (`Omnibar.tsx`/`SearchPage.tsx`/`FacetPanel.tsx`/
`activeFilterPills.ts`) was conflict-free (C's and D's hunks were genuinely disjoint as the
spec predicted). Full `vp run -r typecheck` green across all 32 workspace members immediately
after the merges — zero cross-track drift.

**R4/R8 corrected numbers, verified at merged HEAD.** One authoritative corpus regen (`pnpm
transform` against the committed snapshots, no re-fetch), proven deterministic 3× (`diff -r`
empty pairwise, all three runs), fixture re-extract (byte-identical to Track A's own — no
other track touches ingest), then the host-only `just codex-search-index` Pagefind rebuild
(46,192 pages indexed). `manifest.json`: `totalEntityCount` 46,192, `spell/` 2,461, `ritual/`
201, `equipment/` Runes-tagged 273 — all match the spec's implementation-time-corrected
figures exactly. The three named R4 regression cases verified by id:
`ritual/commune-with-nature.remasteredAs === ["ritual/commune"]`; `ritual/shadow-double`
exists with no `@legacy` sibling and `ritual/simulacrum` stays unsuffixed; `ritual/
unbearable-cacophony` exists with neither `legacyOf` nor `remasteredAs` (the pairing-less
case). The 10 named R9(a) entities all read `level: 0`; `archetype`'s 261 no-level entities
(of 353) unchanged. D29-68 drift re-verification: the committed 496-book-name fixture
reconciles EXACTLY against the freshly rebuilt `sources-index.json`'s book list (0 missing
either direction). Full codex suite: 1,533 tests green.

**D29-62 implementation-time deviation (mastheadExtra label dedup, `b070592`, folded into the
spec's own amendment section).** Appending every collected masthead pair unconditionally (the
spec's literal wording) produced a visible duplicate label wherever the pair's label already
named an already-typed `Facets` field the same header renders directly (`spell/heal`'s
Traditions/Range, `armor/breastplate`'s Price/Bulk, `feat/camouflage-coat`'s Prerequisites,
all verified live before the fix). Each of the 4 typed headers now tracks its own typed
parts' normalized labels and filters `mastheadExtra` against that set — deduplicated by label
TEXT, not field name, so it generalizes without a per-category map. Also fixed at Integration:
`FacetPanel.tsx`'s `RangeInputs` missing-count note now appears in BOTH the min and max
placeholders (was max-only), matching the spec's own plural "placeholders" wording.

**Real-corpus proofs (production build, `pnpm build && pnpm start`, deferred from B/C by the
worktrees having no real corpus).** Tables render bordered/zebra'd on all three named
specimens (`spell/shining-starlight-attack`, `feat/chromotherapy`, `ritual/awaken-animal`) —
visually spot-checked via a Playwright screenshot, parchment-tokenized header row + alternating
row tint. `spell/nightmare`'s degree-of-success block (`Critical Success`/`Success`/`Failure`/
`Critical Failure`, one `paragraph` node with embedded `\n`s) renders on separate visual lines
under `white-space: pre-line`. A real free-action specimen (`feat/high-speed-regeneration`,
the fixture corpus carries none) renders the real traced diamond glyph with
`role="img"`/`aria-label="free action"`/`<title>` intact. The "magic missile" search proof
(§5D): default query returns 0 hits (the legacy `spell/magic-missile` hidden); the "Include
superseded content" checkbox AND the direct `?superseded=1` URL both widen to 1 hit with its
edition pill. Abbreviations visible on `/spell`'s collision spans with full-name `title`
hover (`PC2`→"Player Core 2", `LOGM`→"Gods & Magic", etc.). No footer element anywhere
(`grep -a` + a live DOM count of 0). `ancestry/human`'s no-divider case keeps its full prose
body intact (masthead-strip algorithm stops cleanly with nothing extra consumed) —
`armor/breastplate` and `spell/heal` both show every named masthead field exactly once, no
duplication, confirming the D29-62 dedup fix visually.

**Full sweep.** Playwright zero-hydration/console-error pass across 20 routes spanning every
touched surface — entity pages (spell/feat/ritual/armor/ancestry/creature), the 3 moved-ritual
ids incl. the pairing-less mover and its `?legacy=true` alias form, category listings, `/rules`,
`/sources`, `/search` — zero errors on every route. Weights vs the P4.5 S6 baselines (fresh,
production build, real corpus): `/rules` 401,753/78,489 (was 401,257/79,339, +0.1%/-1.1%);
`/sources` 708,792/63,186 (was 705,112/64,978, +0.5%/-2.8%); the heaviest attached-sidebar
host, `rules/building-creatures?superseded=true`, 382,856/77,892 (was 414,846/80,424 under the
pre-P6 `@legacy` id, **-7.7%/-3.1%** — a real decrease, the masthead-strip apparently removes
more from the attached sibling entities' prose than mastheadExtra/table CSS add back);
`/feat` listing-only 5,874,085/513,087 (was 5,795,488/532,301, +1.4%/-3.6%); `/feat?entry=...`
5,895,602/518,600 (was 5,814,711/536,873, +1.4%/-3.4%) — every byte figure moves by low single
digits, several actually shrink (gzip compresses the shortened masthead prose + repeated
abbreviation strings well); nothing disproportionate. Interaction latency moved more than the
byte weights: row-click-to-paint (6 sequential clicks on `/feat`, warm) averaged ~116 ms vs the
baseline's ~59 ms (~2×); filter-interaction (Rarity checkbox, 5 samples) averaged ~164 ms
(excluding a 294 ms cold sample) vs the baseline's ~111 ms (~1.5×) — real increases, reported
not hidden, consistent with R10's new per-row abbreviation lookups on every visible row
(expected per the spec's own §5F note); still same-order-of-magnitude, not a stop condition.
Measured on a single-process local scratch instance (not behind Caddy) sharing the host with
other work, so the absolute latencies carry more noise than a clean production measurement —
the relative direction (real, moderate increase) is the reliable part. Hermeticity, both lanes
(`data/` renamed out of tree, restored after): TypeScript (`vp run -r test`, codex falls back
to the fixture corpus with its loud startup WARN, 1,533 tests still green) and Python
(`uv run pytest`, 360 tests, unaffected) both green with `data/` absent. Telemetry (gate G): a
local OTLP smoke (`initTelemetry("astra.codex", {endpoint: "http://localhost:10353"})` called
explicitly before `createSsrServer`'s own init, same method as the P4 S5 precedent) against 7
of the reworked routes (`/`, `/feat?entry=...`, `/categories`, `/search`, `/rules`,
`/spell/heal`, `/ritual/awaken-animal`, `/sources`) — all present as `SSR GET <route>` spans
via the `signoz_*` MCP tools, `responseStatusCode: 200`/`hasError: false` on every one.

**Deploy tail (R7 — `2e.iridi.cc` live edge cutover, flagged per [[flag-paid-live-actions]]).**
`just up` rebuilt the codex image (no new runtime dependency — the glyph-conversion tool
stays one-time/offline) and recreated only the `astra-codex` container (every other service
was a no-op recreate, confirming the image diff was scoped as expected). Deliberately did NOT
re-run `just codex-refresh` itself for this step — that recipe's `fetch:foundry`/`fetch:aon`
would re-pull from the network, contradicting the spec's own "no re-fetch, nothing upstream
changed" corpus-regen posture; the container recreate is a superset of `codex-refresh`'s own
restart tail (same effect — flushes `corpusFs.ts`'s per-process cache against the already
host-regenerated `data/corpus`) without the unwanted re-fetch. Exercised for real this time
(the corpus changed materially, unlike P5's drill-only run) — verified via the real-corpus
three-pronged assert (marker: `/ritual` = "145 of 145 shown" by default, superseded-hidden
matching the spec's own H-gate expectation of ~145 current rituals; full-scale: `/ritual?
superseded=1` = "201 of 201 shown", matching the manifest total exactly; zero fixture-fallback
warns in `docker logs astra-codex`, never a bare 200) on BOTH `codex.iridi.cc` and the newly
live `2e.iridi.cc` — byte-identical SSR payload between the two hosts (a diff of the two
`/ritual` responses differs only in the TanStack Router hydration payload's per-request
`updatedAt` timestamp, same byte length, same entity data). `sites.caddyfile` gained a
`2e.iridi.cc` stanza mirroring the `heart.iridi.cc` alias precedent, same noindex
`X-Robots-Tag`; TLS minted on the wildcard within one ~10s poll.

## Density + table listings + UX round (P8, D29-77..82)

P8 is render/client-only — no corpus/transform/index change; deploy = `just up` alone.
Provenance: the 2026-07-16 5e.tools UX comparison
(`thoughts/archive/research/2026-07-16-codex-vs-5etools-spell-browse-ux-thoughts.md`); spec
`thoughts/archive/specs/0029-codex-p8-density-tables-spec.md`.

- **Table register (D29-78/-79, S1):** every `/{category}` listing is a flat sortable table —
  per-category column sets from `src/domain/browse/columnDefs.tsx` (spell: Lvl/Cast/Range ·
  creature/hazard/vehicle: Lvl/Size/HP/AC · equipment family: Lvl/Price/Bulk · feat: Lvl/
  Actions/Type · fallback: Lvl/Rarity — coverage-aware: a column whose live coverage fails the
  facetKeys classifier rule is dropped, so e.g. sidebar shows Name·Source only). Sortable
  `<th>` headers (aria-sort on the cell) replaced the Sort `<select>`; `?sort=` widened to
  `name|-name|level|-level|<facetKey>|-<facetKey>` with forever-decode. Rank comparators for
  size/rarity/cast (passive + missing LAST); numeric ones reuse `facetDefs`'
  `numericValueFor`/`parsePriceToCopper`. Letter groups + the alphabet jump strip are GONE
  (recorded trade-off); containment is per-row `content-visibility`. Trait pills left the rows
  (drawer/entity page keep them). FULL vs COMPACT column tiers switch on measured container
  width (<600px → Name·Lvl·Source), which covers split view on narrow screens, the 640–896px
  band, and mobile.
- **Density (D29-77, S2):** `body` 16px/1.5; one `--density-page-pad` token shared by
  `.codex-entity-page` + `.wrap-wide` (≈24px desktop); content p/ul/ol rhythm halved; header
  ≈55px desktop; listing lead-in 228px (was ~440). The browse split grid rebalanced 58/42 so
  the FULL column set is the desktop default (S1-build amendment — the old 26rem cap made it
  unreachable); `/search` keeps its own pre-P8 ratio via a scoped override.
- **Search boost (D29-81, S3):** `partitionNameMatches` in `pagefindClient.ts` — hydrates a
  60-stub window (pin amended from 40: "heal" ranks 43 raw), pins exact-then-prefix name
  matches above the category groups in Omnibar and `/search` (cap 8, deduped below); fixes the
  P3-documented "heal"/"fireball" title-weight limitation at the display layer.
- **Keyboard (D29-82, S3):** j/k move real DOM focus row-to-row on split-view listings
  (Enter = native activation → full page); the preview `?entry=` commits replace-only after a
  180ms settle (zero history growth); `memoizedEntity` (50-entry) backs both entity loaders;
  guards: focus in inputs/open `<dialog>`, narrow containers; hint line (desktop):
  `Ctrl+K search · j/k browse · enter open`.

## Listing windowed virtualization (P9, D29-83..90)

P9 is render/client-only — no corpus/transform/index change; deploy = `just up` alone. Killed the
/feat-class parse+hydrate cost (8,485 SSR'd+hydrated `<tr>`s → ~2.8s parse+~1s hydrate at 4×
throttle) two ways at once: DOM windowing over the row array, and pulling the full row array out
of the router's dehydration payload entirely. Spec `thoughts/archive/specs/0029-codex-p9-
virtualization-spec.md` (D29-83..90, status BUILT). Slices: **S1 `d467e78`** windowed table + SSR
data split · **S2 `9542d0c`** interaction parity + whole-row click · **S3** this sweep.

- **Windowed table (D29-83, S1):** `@tanstack/react-virtual`'s `useWindowVirtualizer`
  (window-scroll, fixed `estimateSize = ROW_PITCH_PX`, no `measureElement`) over every category
  listing's `<tbody>` — top/bottom spacer `<tr>`s carrying their height on a single
  `<td colSpan style={{height}}>` (never the `<tr>` itself — cross-engine `border-collapse`
  unreliability), overscan 20, row `key` = entity slug, `aria-rowcount`/`aria-rowindex` compensate
  Tab-reach narrowing for AT (R5). Row CSS tightened to a real-Chromium-measured **exactly
  24.00px** (P8 had measured 23.94px live vs the token's nominal 24px — fixed-size windowing
  never self-corrects off that gap) — `scripts/rowHeightDriftGuard.ts` asserts it at both column
  tiers via real Playwright Chromium, its own CI job. Per-row `content-visibility` deleted
  (redundant at ≤~110 mounted rows).
- **SSR window determinism (D29-84, S1):** both the server pass and the client's first pass get
  identical `initialOffset: 0` / `initialRect = { height: 40 × ROW_PITCH_PX }` — first computed
  range is the OUTPUT of that formula (`SSR_WINDOW = 60`), never a re-asserted constant; a unit
  test recomputes the range through the real virtualizer and pins `[0, 60)`. `scrollMargin`
  (the furniture above the table) is 0 on both first passes, corrected in a post-hydration effect.
  Deep links (`?entry=` beyond the SSR window) `scrollToIndex(target, align:"center")` post-mount;
  a same-URL scroll-restoration entry wins over centering (back-nav returns where the user was).
- **Dehydration split (D29-89, S1 — the actual bulk of the win):** the loader ships a **windowed
  projection** server-side (`{ rows: <=60, totalCount, eligibleCount, category meta, entry }`), so
  the auto-dehydrated inline `<script>` carries ≤60 rows instead of the full array — measured live
  2,264,706 B → 17,560 B. Post-hydration the client re-fetches the FULL array through the existing
  `memoizedListing` client path (same serverFn SPA navigations already used; no new wire cost, no
  re-fetch on row clicks). D29-35 (full array client-side, all filter/sort local) stays
  semantically intact — the narrowing is a ~100-300ms window after a cold load where filter/sort
  controls are live but compute over the SSR-window+counts until the array lands (recorded for
  gate H, no control disabled). **/feat total: 7,157,306 B → 93,606 B decoded** (S1 measured);
  8,485 → 60 SSR'd rows.
- **table-layout: fixed (D29-86, S1):** per-column `ch` widths measured 99th-percentile against
  the real 46,192-row corpus (measure, don't guess — raw p99/max recorded in `columnDefs.tsx`'s
  own comment block). `.codex-listing-col-name { width: 100% }` DELETED (adversarial M5 — an
  explicit 100% next to explicit `ch` siblings over-constrains fixed layout); Name gets no
  declared width, the algorithm's remainder rule does the job. **R6: name column is single-line**
  (nowrap + ellipsis + `title` full-name fallback) — a wrapped row would desync every
  spacer/scroll-offset computation below it, since fixed-size windowing assumes every row is
  exactly `ROW_PITCH_PX` tall. Gate proven against the real corpus's actual longest browsable-
  category name — **56 chars** ("House Spirits With an Absurd Number of Regenerating Pies",
  `hazard`), not the spec's original 41-char pin (S3 finding, §7) — single-line/24px/title-
  fallback confirmed at the narrowest engaged split-view floor (897px viewport).
- **Interaction parity (D29-85/-90, S2):** active row position is **persisted state keyed by
  slug**, never `document.activeElement` — wheel-scroll unmounting the focused row (browser moves
  focus to `body`) does not lose position; the next j/k resolves the slug against the current
  `visible` array and resumes (mount → `scrollToIndex` → focus), never snaps to row 0. Ordinary
  j/k uses `align:"auto"` (minimal scroll); `center` is reserved for deep-link arrivals. The
  virtualizer lifted into `BrowseListing` itself; `scrollToIndex` calls are **rAF-coalesced** (key-
  repeat outruns scroll-event dispatch) and focus uses `{preventScroll:true}` (a wheel-back
  remount was observed yanking the viewport at 923px pre-fix). **Whole-row click (D29-90):**
  clicking anywhere on a listing row (not just the name `<a>`) selects it — same guard order as
  the anchor handler (primary-button-only, modifier-key no-op, text-selection-drag no-op, clicks
  inside a nested `<a>`/`<button>` yield to that element's own handler), implemented directly
  (never a synthetic `anchor.click()` — that carries `detail===0`, read as keyboard activation).
  `scripts/virtualizationInteractionGuard.ts` — 22 real-Chromium Playwright checks (frontier j/k
  on a cold load, Enter-opens, preview-follow zero-history-growth, wheel-unmount-then-resume,
  reload-at-depth restoration with no blank-spacer flash, row-click/text-drag/modifier-click) —
  its own CI job, against a fixture `ritual` category grown 6→96 rows (additive) specifically to
  clear `SSR_WINDOW`.
- **Four real bugs found in-slice (S2):** `resetScroll:false` needed on both entry navigations (a
  latent P8 scroll-snap); a settle-timer cancellation race in `onEntryPreview` (fixed via a ref-
  mirror); a `scrollToIndex` flood under fast key-repeat (fixed by the rAF-coalesce above); deep-
  link centering needed a retry loop until the D29-89 full array actually lands.
- **Trade-offs recorded for gate H:** Ctrl+F stays categorical (browser find-in-page only sees
  mounted rows, R2 carry); "N of N shown" counts the array not the DOM (R3 carry); Tab reaches
  only mounted-window anchors, j/k is the sanctioned full-list traversal (R5, ARIA-compensated);
  name column is single-line not two-line-wrap (R6); the D29-89 ~100-300ms fetch window where
  filter/sort compute over not-yet-landed data (judged imperceptible, no control disabled).
- **S3 sweep (local, pre-deploy — see spec §7 for the full evidence table):** hydration-zero on
  the 8-route set, `?sort=`/`?sort=-` SSR order proof via a comment-marker-safe extraction method
  (React SSR's `<!-- -->` text-node separators defeat naive `grep`), both guard scripts green,
  column-width scroll stability, mobile 0 h-scroll + a touch-fling overscan stress probe (record-
  don't-hide: no fully-blank window observed, minimum 34 rows stayed in-viewport during a 1.2s
  post-fling poll), full hermeticity re-proof (masked-corpus run: 85/85 files, 1854/1854 tests
  green, including the 7 corpus-visibility-dependent `ssrSmoke` cases), and a local perf snapshot
  (/feat 4× throttle: 95,167 B decoded / 11,334 B gz, DCL 141ms, main-thread-quiet 745ms, full-
  array fetch-complete 630ms — all comfortably inside D29-88's budget; live-edge numbers are the
  orchestrator's post-deploy pass).

## Bespoke class page (P12, D29-113..120)

`/class` and `/class/{slug}` are a dedicated surface (the 5e.tools model) instead of the generic
prose pipeline — a Core Traits box, a level-by-level progression table with anchor-linked
features, subclass toggles, and a level-ordered feature stream, backed by a new typed `stats`
model on `class` entities. Spec `thoughts/archive/specs/0029-codex-p12-class-page-spec.md`
(D29-113..120, status BUILT). Slices: **S1 `21547da`** transform · **S2 `ed40bab`** server +
routes · **S3 `93fa2e2`** render · **S4** this sweep.

- **Scalar stats + the post-drop augment pass (D29-113/-114/-115, S1):** a new `class` branch
  beside `extractStats` emits the SCALAR model at extract time (key ability — `[]` for psychic,
  "Chosen at 1st level" — HP, perception, saves, attacks incl. the one comma-joined gunslinger
  entry, defenses, trained skills, spellcasting flag, the five `featLevels` cadence arrays
  verbatim, no assumed shape). `grantedFeatures`/`subclassOptions` can't be built at extract
  (subclass docs don't exist yet; droppedness is unknowable) — a NEW `augmentClassStats` pass
  (`apps/codex/ingest/src/augmentClassStats.ts`, mirrors the `drop.ts`/`sidebarAttach.ts` post-drop
  precedent) runs over the FINAL kept entity set: `grantedFeatures` uuid-resolves each class's
  raw `system.items` manifest through the EXISTING `uuidResolve` seam, nulling `targetId` when
  the resolved id isn't in the kept set (520 grants, 503 resolve / 17 null — this nulling IS the
  referential validation; `emit.ts`'s own Zod pass is shape-only) — the 17 nulls (cleric's First…
  Final Doctrine, kineticist's Gate's Threshold, etc.) still appear in the progression table as
  plain text, never silently dropped. `subclassOptions` follows a curated
  `classSlug -> subclassCategory[]` map (`SUBCLASS_CATEGORY_MAP`, one class per category,
  enforced) through the **current-edition union**: `currentOptions(category) = docs with
  remasteredAs == ∅ ∪ dedup(remasteredAs targets of the category's superseded docs)` — a no-op
  for a "living" category (e.g. `instinct`) and a pointer-follow into `class-feature/` for a
  category 100%-absorbed by remastering (e.g. `doctrine`, 2 docs, both remaster into
  `class-feature/`). 279 options emitted total; per-class current/legacy counts (barbarian 9+6,
  sorcerer 18+10, cleric current == its 2 remaster targets) are report-visible pins, re-derived
  every run rather than hardcoded. `schemaVersion` 4→5.
- **`resolveClassPageData` + embed unification (D29-117, S2):** a class page's granted-feature
  bodies are projected SLIM (`{id, name, level, body}`, keeping the P9 router-dehydration
  discipline intact) and only the URL-selected subclass docs are fetched server-side (an
  unselected pill fetches on demand via the existing `memoizedEntity` client seam) — embed
  targets are collected into ONE map spanning the class body, every granted-feature body, AND
  the SSR-selected subclass bodies, capped once at the existing `EMBED_INLINE_CAP` (100), not
  per-source (real-corpus worst case 46/100, `commander` — comfortably under). Without the
  unified map, an inlined feature's own embed (fighter's Reactive Strike → `action/
  reactive-strike`) would silently fall soft to plain text.
- **`EntityHeader` extraction (D29-119 step 0, S3):** `EntityPage`'s inline monolithic header
  block (title row/meta row/edition banner, the `popover-hint` class 1,066 class-feature docs
  crossref into) is now an exported `EntityHeader` shared by both `EntityPage` and the new
  `ClassPage` — goldens regenerated byte-identical, confirming the extraction is a pure
  refactor. `ClassPage`'s composition order is the contract: Core Traits → progression table
  (features + cadence entries per level, one shared `createHeadingIdAssigner` pre-assigning
  every section/stream heading id in render order so table anchors resolve correctly) →
  subclass pills (current by default, legacy husks under `?superseded=1`, multi-toggle,
  `?subclass=` via the existing `splitCsv`/`joinCsv` codec) → feature stream (`Level N: Name`
  headings, slim bodies inlined) → the AoN prose body under "Description", with the ONE
  duplicate `["Your Level", "Class Features"]` progression table suppressed (measured: exactly
  once on all 27 real stats-bearing classes) → attached sidebars as today.
- **Two real-corpus finds (S3):** a class's `loreBody` (a merged Foundry journal page, e.g.
  alchemist's "Roleplaying the Alchemist") independently restates the SAME progression table a
  second time when present — stripped by the identical predicate, additively, same as
  `entity.body`. And a live-Chromium check caught a `<details>` without `[open]` rendering its
  non-summary content through an internal `::details-content` pseudo-element that carries
  `content-visibility: hidden` — no descendant `display` override can undo it (the whole subtree
  skips painting by spec) — so the class rail was in the DOM but unpainted on desktop until
  forced visible unconditionally. The `/rules` sidebar disclosure now carries the same override.
- **Fixture pipeline as its own corpus source (S1):** `class/fighter`/`cleric`/`witch`'s
  `grantedFeatures`/`subclassOptions` can't be lifted from the real emitted corpus (a different
  corpus state — e.g. sorcerer's real 18-row bloodline population vs. the fixture's tiny raw-only
  set) or hand-authored (they must reproduce the real `augmentClassStats` mechanism, incl. the
  cleric stub-bearing `targetId: null` case). `extract-fixture.ts` now runs the fixture's OWN
  trimmed raw-doc subset through a full pipeline rerun first (`buildFixturePipelineCorpus`) and
  sources exactly these three class docs from THAT run's output, not the real corpus — every
  other fixture entity is still copied verbatim from a real emitted corpus as before.
- **Rail + fail-soft (D29-118, S2):** the rail lists exactly the 27 non-superseded stats-bearing
  classes, with the 20 legacy rows behind `?superseded=1` (magus/summoner are single-row
  `edition:"legacy"` non-superseded — bespoke page, edition pill as usual); the 2 miscategorized
  `class/` docs render the EXISTING generic `EntityRenderPane` inside the same `ClassBrowse`
  shell — no dead ends. `loaderDeps` on both routes (`subclass`+`superseded` on `$slug`,
  `superseded` on `index`) is the codified P4.5 lesson; `routeTree.gen.ts` regen rode S2.
- **No-reindex deploy note (D29-116).** `stats` is never read by `apps/codex/ingest/src/build-search.ts` for
  `class` (its category-gated `statsText` call is creature/hazard only) and `toIndexRow` excludes
  `stats` from `_index.json` entirely — a class doc's search record and its `_index.json` row are
  byte-identical before/after the augment pass, proven directly (not just re-read from the
  comment) at S4: `class/_index.json` sha256-identical, and the exact Pagefind
  content/meta/filters payload recomputed off both corpora matches for `fighter`/`investigator`/
  `sorcerer`/`cleric`. **Deploy carries no reindex step** — `just codex-refresh`'s existing
  restart tail is the whole deploy.
- **S4 sweep (local, pre-deploy):** two fresh scratch transforms at HEAD, byte-identical
  (`diff -rq` empty), delta vs the live corpus = exactly the 27 `class/` docs +
  `manifest.json` + `report.json` + `report.md` (30 files, nothing wider); totals 44,808/88
  unchanged; grants 503/17, subclass counts (barbarian 9+6, sorcerer 18+10, cleric current=2)
  all reproduce exactly. Full codex suite: 98/99 files, 2160/2167 tests (the 7 failures are the
  documented pre-existing `ssrSmoke` `$category/` tier-3 residue, unchanged in location/count/
  signature) — plus the repo-wide `vp run -r {typecheck,test,build}` (32/26/26 tasks, only
  codex's own 7 residue tests failing anywhere in the tree), `oxlint --threads=4`/`oxfmt --check`
  clean, and the Python lane (`ruff check`/`ruff format --check`/`ty check`/`pytest`, 360 tests)
  green and untouched. All 7 committed goldens regenerated byte-identical to HEAD. Gates C–G
  (live structural/subclass/rail/weight/telemetry verification) ride the orchestrator's staged
  deploy.

## Filter panel redesign — pane-swap (P13, D29-121..131)

The centered 28rem `<dialog>` filter drawer (occluded the table + the count row while filtering,
three nested scroll regions, raw data leaking into the UI — glued facet tokens, stringified-list
values, icon-only Edition, Superseded reachable twice) is replaced by a **pane-swap**: on the
two-column tier the panel content moves INTO the entry-pane grid cell (no modal at all); on the
narrow tier it's still a `<dialog>` bottom sheet. Render/server-only round — `filterEngine.ts`,
`urlState.ts`, and the corpus/index are untouched. Spec
`thoughts/archive/specs/0029-codex-p13-filter-redesign-spec.md` (D29-121..131, status BUILT).
Slices: **S1 `c60bdbe`** shared primitives + facet content · **S2 `f443d31`** container swap +
chrome · **S3 `713c138`** source groups + `/search` · **S4** this sweep.

- **The pane-swap container (D29-123, S2).** The `<dialog>` host + `FacetPanel` stay
  **unconditionally mounted in the SSR DOM** exactly as before (so ssrSmoke's `codex-facet-panel`
  pins stay real coverage, unmodified) — `filtersOpen` is local component state (never URL-backed,
  matching the old dialog's non-shareable behavior). Opening with an entry selected leaves `?entry=`
  completely untouched (the preview is merely hidden, not unmounted); closing (✕ / Filters-button
  toggle / Esc) restores the identical preview. A row click or Enter-on-focused-row while filtering
  closes the pane and shows that entry (selection wins); **j/k is suppressed while DOM focus sits
  inside the pane** (the old `closest("dialog")` guard doesn't reach a non-dialog pane on desktop —
  the focus-after-mount effect would otherwise steal focus from the pane on every keypress). Esc
  sequencing: an expanded `OptionSearch` collapses first, a second Esc closes the pane. Tier-crossing
  while open closes it. The Filters button is a real toggle (`aria-expanded` + a solid active state).
- **Panel chrome (D29-124, S2).** Header carries **"Clear all" + ✕ only — no count**: the toolbar's
  own `displayTotalCount`/`eligibleCountOverride` already flow the full numbers through the cold-load
  window, so a second live count in the pane would just be duplicate noise now that pane-swap
  un-occludes the toolbar row. One scroll region (the per-section 14rem inner scrollboxes are
  deleted); the filter occupant renders outside the entry pane's `aria-live="polite"` wrapper (a
  live region hosting filter interactions would flood AT).
- **`sourceLines` — the loader mechanism for grouped Source (D29-121, S3).**
  `resolveCategoryListing` (`src/server/listingData.ts`) additionally returns
  `sourceLines: Record<string, string>` — every distinct `source.book` in the category's FULL row
  set (never the SSR window), joined against the already-mounted `sources-index.json`
  (`reader.sourcesIndex()`). Three independent fail-soft paths land on `"Other"`: a book with
  `productLine: null`, a book missing from the index, and the index **file itself** being
  missing/malformed (`sourcesIndex()` throws `CorpusNotFoundError`, caught with a one-time
  `console.warn` — the always-200 listing route must never 500 on this artifact). This map is
  presentation-only — it never crosses back into `filterEngine`/the URL, and it never reaches a
  client import on its own (only the derived per-category map crosses as loader data, the P6 R10
  lesson). Payload measured directly off the real corpus (re-derived independently at S4, not
  reused from S3): **/feat 5,160 B (114 books) · /creature 21,436 B (374 books, the max across all
  88 categories) · well under the 50 KB STOP threshold.**
- **`formatFacetValue.ts` — the humanization formatter (D29-122, S1).** A **maintenance surface**,
  not a one-time fix: generic pass is title-case + hyphen/space-split ("held-in-one-hand" → "Held
  in One Hand"); the real work is a **curated map** for glued compounds with no delimiter
  ("ancestryfeature" → "Ancestry Feature", "deityboon" → "Deity Boon" — verified live: these are
  **pre-remaster-only** raw `itemCategory` values, 1/3/1 rows in the real `feat` corpus, so they
  only surface in the panel under `?superseded=1`), `creature.size` codes, and stringified-list
  values (`spell.traditions` `"['arcane', 'divine']"` → "Arcane, Divine"; the empty string `''` →
  "Unspecified"). Precedence: a facet's own `facetDefs` `labelMap` entry always wins;
  `formatFacetValue` is the fallback for values with no labelMap (never double-formatted). New raw
  corpus values that reach this formatter unmapped show up as bracket/quote residue (`"['x']"`) or
  a raw glued token — the gate-E sweep assertion (grep the whole panel for `['`/`']`) is the
  regression guard; **extend the curated map when it fires**, don't special-case the render path.
- **Source product-line groups (D29-128, S3).** Grouping + order are `sourcesModel.ts`'s
  `PINNED_PRODUCT_LINE_ORDER`/`OTHER_GROUP_LABEL`, reused verbatim (not re-declared) so the panel
  and `/sources` can never fork — verified live: the panel's rendered group order is a subsequence
  of `/sources`'s own order. Options show full book name + `abbreviateBook()` suffix; `OptionSearch`
  matches name AND code (verified live: "AP147" and "age of ashes" both surface real matches —
  "AP147" → *Pathfinder #147: Tomorrow Must Burn* under the "Adventure Paths" group in `/feat`;
  "age of ashes" → *Age of Ashes Player's Guide* in `/background`, a different category — the two
  terms don't share a single category in the real corpus, verified against `sources-index.json`
  rather than assumed). Group headers are chrome only — never select-alls (P13's H register).
- **`OptionSearch` + the chip/checkbox split (D29-125/-126, S1).** Any option list ≥ 20 options
  gets a magnifier (`aria-label="Search <section>"`, `aria-expanded`); ≥ 100 auto-expands
  (`creature.family` 467, Traits 380-on-`/feat`). ≤ 8 options render as parchment toggle chips
  (real `<button>`s, `aria-pressed`); > 8 stay checkbox rows. Traits: selected chips pin to the
  front, a 40-row bounded initial render + "Show all N", **AT-legible per-chip `aria-label`s**
  ("Fire — required"/"Fire — excluded" — `aria-pressed` alone can't distinguish include from
  exclude). "— without data: N" → "Unspecified (N)".
- **`/search` unification (D29-130, S3).** `FacetSection`/`OptionSearch`/the chip row/checkbox
  list/"Unspecified" moved to `src/domain/browse/facetControls.tsx`, consumed by both `FacetPanel`
  and `SearchPage` — the primitives accept options/counts/selection as data plus an optional
  comparator, never recomputing (`SearchPage`'s Pagefind-derived counts, numeric `level` sort, and
  Category facet all keep their own ordering through that seam). `SearchPage` keeps its own inline
  rail layout (no pane-swap — no preview pane exists there); it has no Source facet.
- **S4 sweep (local, pre-deploy) — full evidence in the spec's build record.** Gate A: `data/corpus`
  + `data/search` proven byte-untouched (identical mtimes/checksums before and after the full
  sweep); `sourceLines` sizes re-derived independently, exact match with S3 (creature 21,436 B).
  Gate B: full codex suite 2,227/2,234 (the 7 documented pre-existing `ssrSmoke` tier-3 failures,
  unchanged in name/count); repo-wide `vp run -r {typecheck,test,build}` (26/26/26 members, only
  codex's own residue failing anywhere); `oxlint --threads=4`/`oxfmt --check` clean; Python lane
  (360 tests) green; `rowHeightDriftGuard` clean (24.00px, both tiers); the virtualization
  interaction guard's net-new pane-swap cases all pass — its one failure ("reload restores the
  same deep scroll position") was **independently bisected against the pre-P13 commit `dc9ad06`
  and reproduces there identically** (same magnitude, same case) — confirmed pre-existing residue,
  not a P13 regression. Gate C: the codec-invariance table (traits/level/rarity/actionCost/
  superseded/comma-bearing-family) already existed pre-P13 and `urlState.ts` has zero diff across
  S1–S3, which is itself the proof of invariance; the superseded-toggle scroll-parity assertion
  (`onSupersededReveal`, never `onChange`) is a dedicated S2 test. Gates D–F: live Playwright
  against the BUILT server + real corpus at 1440×900 and 390×844 — pane-swap entry-preservation,
  every gate-E facet-content assertion, zero hydration console errors on 5 routes, and
  `/creature` interaction latency all passed once measurements isolated true recompute cost from
  Playwright's own synthetic-click dispatch overhead: a **cold first toggle** costs ~144–230ms
  wall-clock (JIT/memoization warmup, one-time per session) but every **warmed** interaction
  (toggle→recount, `OptionSearch` keystroke on `family`, "Show all N") measured **6–27ms**,
  comfortably inside the ~100ms budget — recorded for gate H as a flagged one-time cold-start cost,
  not a per-interaction regression. Gate G (telemetry + `just up`) rides the orchestrator's staged
  deploy.
