# codex — a PF2e reference site: the SSR frontend

codex is a public but noindexed Pathfinder 2e reference site, served at `codex.iridi.cc` and
its alias `2e.iridi.cc` (port 10374). This package (`@astra/codex`) is its TanStack Start SSR
frontend. It reads the current corpus release from disk at request time and renders it.

codex has three parts. [`@astra/codex-ingest`](../ingest/README.md) (`apps/codex/ingest`)
joins the **foundryvtt/pf2e** compendium packs, the **Archives of Nethys** (AoN) index and
assay's homebrew store into one entity per game element, indexes it with Pagefind, and
publishes an immutable release; it also generates the test fixture corpus.
[`@astra/codex-corpus`](../../../libs/ts/codex-corpus/README.md) is the shared contract: the Zod
schemas, the reader, the release layout and its servability check. This package serves the
release that `releases/current` names.

```
snapshots/ (Foundry + AoN) + apps/assay/py/homebrew/
        │  just codex-build  (host-only)
        ▼
releases/<id>/{corpus,search/pagefind,release.json}  ◄── releases/current
        │  read per request (read-only bind mount)
        ▼
astra-codex container (this package) ── Caddy ── codex.iridi.cc, 2e.iridi.cc
```

## Run, test and build

- **Dev server:** `just dev codex/web`. It reads `CODEX_CORPUS_ROOT` if set, else the current
  release, else the fixture corpus (with a warning). Search needs a build.
- **Production build:** `pnpm --filter @astra/codex build`, then `pnpm --filter @astra/codex
  start`. `build` also bundles `server.ts` into `dist-server/main.mjs`, which `start` runs
  under `@astra/observe/register`. A built server never falls back to the fixture.
- **Tests:** `pnpm --filter @astra/codex test` (vitest, part of `just ts-test`) reads the
  fixture corpus. `src/ssrSmoke.test.ts` rebuilds `dist/` when it is stale, then renders
  routes through the built bundle. `just codex-e2e` is the Chromium suite (see Verification
  under Traps). `just codex-real-corpus` (host-only, opt-in) checks the current release.
- **Goldens:** `src/domain/render/goldens.test.tsx` compares seven committed HTML goldens
  (`goldens/`) byte for byte. After an intended render change, run `pnpm regen-goldens` from
  this directory and review the diff.
- **Deploy:** push, then `just deploy codex`. Corpus and index changes are releases (below).

## Operations

The data dir is `codex.data-path` (`codex/data` under `data.root`, so
`/ruby/data/astra-state/codex/data`). It holds `releases/` (served) and `snapshots/` (ingest
input). The corpus and its Pagefind index ship as **immutable releases**; nothing edits served
data.

```
releases/
  <id>/corpus/            the corpus tree (layout in the ingest README)
  <id>/search/pagefind/   the Pagefind index built from that corpus
  <id>/release.json       id, createdAt, entity count, schemaVersion, source pins
  current -> <id>         relative symlink; the one thing a publish or rollback changes
  rejected/<id>           marks a release a rollback left
  .staging-*/             a build in progress, never served
  .lock/owner.json        the release lock
```

`<id>` is the first 16 hex digits of a sha256 over `corpus/` and `search/`, so an identical
build reuses its release. The server reads `current` on every request and needs no restart
after a publish or rollback. A new release that passes the startup checks gets a fresh reader;
a failing one is logged and refused while the old release keeps serving (retried after 30 s
for an I/O error such as EMFILE). Each request stays pinned to the release it started on.

The `just codex-*` recipes call the ingest CLI (`pnpm --filter @astra/codex-ingest cli release
...`); its README lists every command. The step-by-step procedure is in
[`docs/runbook.md`](../../../docs/runbook.md) ("codex refresh or republish").

- **Full refresh** (re-fetch both sources, then `codex-build`): `just codex-refresh`. It
  re-downloads about 260 MB from AoN plus a Foundry sparse clone, so don't run it casually. It
  refuses a dirty `apps/codex/ingest`, because the `corpus-manifest.json` diff it writes must
  be reviewable alone. If that diff is timestamp-only, revert it.
- **Transform-only change** (ingest code or the assay homebrew store changed, sources did not):
  `just codex-build`. It skips the re-fetch, which can pull in upstream drift. It builds into
  `releases/.staging-*`, validates, renames to `releases/<id>` and swaps `current`. Validation
  is the server's own check (this `schemaVersion`, not the fixture), plus entity files matching
  the manifest, valid `rules-tree.json` and `sources-index.json`, one Pagefind page per entity,
  and **no fewer entities than the current release** (`just codex-build --allow-shrink` when a
  drop is expected). The transform reads code and the homebrew store from the checkout, so run
  it from a clean checkout at a pushed commit.
- **Search-only change** (`apps/codex/ingest/src/build-search.ts`): `just codex-search-index`
  rebuilds the index over the current corpus (hardlinked) and publishes that as a new release.
  Fields the indexer does not read (`attachedSidebars`, the rules tree, the sources index,
  class `stats`) never need a reindex.
- **Roll back:** `just codex-rollback` makes the previous release current; `just
  codex-rollback <id>` picks one. `just codex-releases` lists them, with `*` marking `current`.
  The release a rollback leaves is marked rejected: a rebuild that hashes to it, or a rollback
  to it, needs `--force`, and the default rollback target skips it.
- **Pruning** keeps the 3 newest releases, the current one, and the one the running codex
  serves (read from its `/healthz`). When codex does not answer, nothing is pruned.
- **The release lock** names its holder's pid; a lock whose holder is gone is broken, and its
  leftover `.staging-*` dirs are removed.
- **Render-only change** (`src/` only): push, then `just deploy codex`.
- **Schema bump order:** merge the code, run `just codex-build` from that checkout, then `just
  deploy codex`. The old server refuses the new-schema release and keeps serving its own, search
  included. Deploying first would crash-loop, because the new server refuses the old `current`
  at startup. `CORPUS_SCHEMA_VERSION` (now 5) is in
  `libs/ts/codex-corpus/src/schema/corpusVersion.ts`.
- **Verify a deploy.** A built server fails closed: with no `releases/current`, another
  `schemaVersion`, or the fixture, it throws `CorpusUnservableError` and exits, and compose
  restarts it in a loop. A good deploy logs `[codex] serving the corpus at
  "/ruby/data/astra-state/codex/data/releases/<id>/corpus" (release <id>, source config, <n>
  entities, schemaVersion 5)`, and a switch logs `[codex] switched from release <old> to ...`.
  `/healthz` answers the served `releaseId`, `source`, `totalEntityCount` and `schemaVersion`.
  Also check a real entity page such as `/spell/fireball`.

### The deployed service

- The image (`deploy/node.Dockerfile`, no content step) holds no corpus, and `.dockerignore`
  keeps `fixtures/` out. Compose (service `codex`, container `astra-codex`) bind-mounts
  `/ruby/data/astra-state/codex/data/releases` read-only at the **same path** inside the
  container: `codex.data-path` is read by both the host and the container, and plain config
  fields have no env override. `current` is relative, so it resolves on both sides.
- On a fresh host the container exits with `CorpusUnservableError` until `just codex-build`
  publishes a release. Production compose never sets `CODEX_CORPUS_ROOT`.
- **Noindex has three layers:** every SSR page carries `<meta name="robots" content="noindex">`
  (`src/routes/__root.tsx`), `public/robots.txt` disallows everything, and the Caddy stanzas
  in `sites.caddyfile` set `X-Robots-Tag: noindex` for both hosts. There is no sitemap, and
  codex is not on ledger's landing grid.

## How the site works

**Routes.** `/` is the landing page and `/categories` lists every category. `/{category}` is a
sortable, filterable listing with a preview pane (`?entry=<slug>`). `/{category}/{slug}` is an
entity page; the path is the corpus id verbatim (`/spell/heal@legacy`). `/class/{slug}` is a
dedicated class page, `/rules` a tree browser, `/sources` the book index and `/search`
full-text search. The header nav (`src/domain/nav/navData.ts`) covers all 88 categories, and a
test checks that list.

**Read layer.** `src/server/corpusFs.ts` picks the corpus root and owns the reader (the only
`node:fs` seam). `corpusFns.ts` wraps the pure resolvers in `src/server/*Data.ts` as server
functions for the route loaders.

**Entity pages.** One total renderer (`src/domain/render/nodes.tsx`) turns `CodexNode`s into
React, plus structured headers for creature, hazard, spell, equipment and feat. When an entity
has an AoN body (`entity.body.length > 0`), that body is the statblock of record, and the
structured statblock and embedded-item sections are suppressed; Foundry-only entities keep
them. The rule is body presence, not `aonUrl` and not a category list. `MastheadExtraFallback`
always renders the masthead pairs ingest stripped from the body. A `loreBody` renders only the
sections `body` does not repeat (`loreDedupe.ts`). Attached sidebars render as cards after the
body, one level deep.

**Listings.** Each `/{category}` is a windowed table (`@tanstack/react-virtual`) with columns
from `src/domain/browse/columnDefs.tsx`. Filtering and sorting run on the client over the
category's full `_index.json` rows (`filterEngine.ts`). The per-category facet keys live in
`libs/ts/codex-corpus/src/schema/facetKeys.ts` (ingest trims rows to them);
`src/domain/browse/facetDefs.ts` pairs each key with its widget, and a test checks the two key
sets match. On wide screens the filter panel swaps in for the preview pane and a row click
previews in place; on narrow screens the panel is a bottom sheet and a row click navigates.

**URL state** (`src/domain/browse/urlState.ts`). Example:
`?traits=fire,-agile&level=-2..5&rarity=rare,unique&f.actionCost=1,reaction&sort=-level`.
Derived facets are `f.<key>`. An exclude is a leading `-`; there is no include marker, because
`+` decodes to a space. Superseded (pre-remaster) content is hidden unless `?superseded=1`
(`legacy=1` still decodes as an alias), except in search, which shows it by default. There is
no persisted toggle.

**Search.** The header omnibar (Ctrl/Cmd-K), the hero box and `/search` share one memoized
Pagefind loader (`src/domain/search/pagefindClient.ts`). Only the omnibar registers the
hotkey, so never mount a second one. `partitionNameMatches` pins exact and prefix name matches
first. With no index, the search UI shows "index not built".

**Rules, sources and classes.** `/rules` renders `rules-tree.json`; a rules page's pager walks
its book's tree depth-first, not AoN's raw links. `/sources` renders `sources-index.json` in
`PINNED_PRODUCT_LINE_ORDER` (`src/domain/sources/sourcesModel.ts`), which the filter panel's
Source groups reuse. A class page renders the typed class `stats` from ingest: Core Traits, a
progression table, subclass toggles (`?subclass=`) and a feature stream, with one embed cap
(`EMBED_INLINE_CAP`, 100) across the whole page.

**Telemetry.** `createSsrServer` emits `astra.codex` SSR spans, the browser sends RUM traces
(`src/observe/rumConfig.ts`), and searches count into the server-side `codex.search` counter
(`src/server/telemetry.ts`), because astra has no browser metrics provider. For a local smoke,
`pnpm run start` exports to `telemetry.host-otlp-endpoint` (localhost:10353) as
`deployment.environment=development`.

## Traps

**Fixture and tests**
- Every test, e2e included, reads the fixture corpus at `apps/codex/ingest/fixtures/entities/`
  (`fixtureCorpusRoot()`): `vitest.setup.ts` and `e2e/server.ts` default `CODEX_CORPUS_ROOT`
  to it. Only `just codex-real-corpus` (`src/realCorpus.test.ts`, `CODEX_REAL_CORPUS=1`)
  reads the real corpus. The dev server has no pin: it reads the real corpus from any checkout.
- The fixture corpus is generated and gitignored. `ensureFixtureCorpus()`
  (`@astra/codex-ingest/fixture`) brings it up to date; vitest's global setup, `e2e/server.ts`
  and `regen-goldens.ts` call it, and `pnpm --filter @astra/codex-ingest cli fixture` runs it
  by hand. To change the fixture, change an ingest input, never the output.
- `scripts/regen-goldens.ts` runs under tsx, which resolves the `@/*` alias only through the
  tsconfig of the directory it runs from: run `pnpm regen-goldens` from this app dir, and keep
  EntityPage's import graph relative.
- DOM tests carry a per-file `// @vitest-environment jsdom` docblock. jsdom lacks
  `HTMLDialogElement.showModal` (tests polyfill it).

**Search index**
- The Pagefind build is host-only (~3.8 GB RSS): only inside `just codex-build` and `just
  codex-search-index`, never in CI or Docker.
- `/pagefind/<path>` answers 302 to `/pagefind/r/<id>/<path>` (`no-store`), where `<id>` is
  the release this server serves (not always `current`), and release-keyed files are served
  `immutable` (`src/server/pagefindRoute.ts`, mounted by the root `server.ts`). The client
  imports `/pagefind/pagefind.js`; after the redirect Pagefind derives its base path from
  `import.meta.url`, so one page reads one release's index even across a switch. Don't
  rewrite that import to bypass the redirect.
- Pagefind fragments are gzip; grep decompressed bytes. `meta.title` has no ranking weight and
  weight spans leak into excerpts; exact-name ranking comes from the client-side boost, so don't
  retry index-side weighting.
- `vite dev` does not run the root `server.ts`, so `/pagefind/` needs `build` + `start`.

**SSR, routing and hydration**
- Any export in a `createServerFn` file drags its imports into the client bundle, and so does
  any module-scope call into `node:fs` or `loadConfig`. Keep fs in `corpusFs.ts` behind the lazy
  `getCorpusReader()`, server fns alone in `corpusFns.ts`. Verify by grepping the client bundle
  for `readFileSync`/`loadConfig`.
- `@astra/codex-corpus`'s `node:fs` reader is the separate `/reader` subpath; client code
  imports only the root entry. Its `"sideEffects": false` keeps unused Zod schemas (about
  100 KB) out of the client bundle; check with `grep -c ZodObject dist/client/assets/*.js`.
- A fixed `import.meta.dirname`-relative path breaks after `vite build` relocates the module.
  Walk up to a stable marker instead (`findCodexDomainRoot` in `corpusFs.ts`,
  `findPackageRoot` from `@astra/config`).
- A loader driven by search params needs `loaderDeps`, or it silently never re-runs.
- The router's search parser decodes `+` to a space, coerces bare numbers, and round-trips
  arrays as real `string[]`. Accept both shapes in `validateSearch`.
- `?entry=` takes the bare slug, not `category/slug`. When rebuilding search from filter state,
  carry `entry` through `filterStateToSearch` explicitly.
- `deriveHeaderTitle` (`src/domain/nav/HeaderTitle.tsx`) must list every new route family.
  Standalone h1s are sr-only on the premise the header shows the title, so a missed case leaves
  the page with no visible title.
- A resolved depth-0 embed renders a block `<div>`; a paragraph holding one must render as a
  `<div>` (`embedRendersAsBlock`), or hydration mismatches.
- With `hydrateRoot(document)`, React's listeners are siblings of manual `document` listeners:
  only `nativeEvent.stopImmediatePropagation()` blocks them.
- `sources-index.json` is server-only. Client code that needs book abbreviations uses
  `abbreviateBook()`.

**Listings and virtualization**
- `SSR_WINDOW` is derived from `ROW_PITCH_PX` and the initial rect through the real
  virtualizer; change the inputs, never the constant. The loader ships only the window's rows
  (with a `windowed` flag) to keep the dehydration payload small; the client then fetches the
  full array via `memoizedListing`.
- Fixed-size windowing assumes every row is exactly `ROW_PITCH_PX` (24 px) tall, so the name
  column is single-line with an ellipsis and a `title`. `e2e/rowHeight.spec.ts` checks the
  height in real Chromium; a wrapped or 23.94 px row desyncs every offset below it.
- Listing focus uses `{ preventScroll: true }`, `scrollToIndex` is coalesced per animation
  frame, timers read current values from a ref, and entry navigations pass `resetScroll: false`.
- Keyboard Enter on a row anchor is a click with `detail === 0`; let it fall through to native
  navigation. Whole-row click is implemented directly, never by a synthetic `anchor.click()`.
- Tier decisions (pane vs bottom sheet) use the `matchMedia` hook in `BrowseListing.tsx`, which
  mirrors the CSS breakpoint; the container-width flag misreads 700–850 px.

**Styling**
- A closed `<details>` hides its content through `::details-content { content-visibility:
  hidden }`, which no descendant rule can undo. Override `::details-content`, or use a
  conditional render instead of `<details>`.
- A higher-specificity `padding` shorthand beats a lower-specificity `padding-inline`. Check
  column and row geometry in a real browser (`just codex-e2e e2e/rowHeight.spec.ts`), not jsdom.
- `dialog:modal` UA centering breaks on tall content; set `position: fixed; inset: 0; margin:
  auto`.
- Exactly one flex auto-margin owns the header's right push (`.codex-header-nav`).
- Reuse exported orderings and maps (`PINNED_PRODUCT_LINE_ORDER`, `formatFacetValue`'s label
  map); a redeclared copy forks. When a refresh brings a raw facet value that renders as
  bracket residue (`"['x']"`) or a glued token, extend `formatFacetValue.ts`'s curated map.

**Verification**
- `just codex-e2e` builds, starts `e2e/server.ts` (the built `dist/` on an ephemeral port) and
  runs Chromium with one worker; arguments pass through (`-g "row height"`). Each `check()` is a
  soft assertion. Failures keep a trace in `test-results/` (`pnpm exec playwright show-trace
  <zip>`) and a report in `playwright-report/`; CI uploads both as `codex-e2e-failures`.
- The e2e suite's `@playwright/test` must stay the release `playwright` resolves to and
  `deploy/node.Dockerfile` pins (the catalog lists it exactly); `just infra-check` catches a
  second `playwright` in the lockfile.
- React SSR puts `<!-- -->` between text nodes, so "145 of 145 shown" doesn't match as plain
  text in served HTML. Virtualized listings prove additions by the toolbar count, not row greps.
- Playwright's locator `.click()` scrolls the target into view; use
  `evaluate(el => el.click())` in scroll assertions.
- `codex.port` has no env override (only secrets and the data roots do). A scratch serve needs
  its own `createSsrServer` boot script; never edit `config.kdl` or touch 10374.
