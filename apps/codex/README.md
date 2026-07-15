# codex — a PF2e reference-site: ingest + SSR frontend

codex is a public-but-noindexed Pathfinder 2e reference site (`codex.iridi.cc`, port 10374).
The member is now **app + ingest**: an **ingest pipeline** (below) that builds a canonical,
Zod-typed, license-labeled corpus by combining two independently maintained Pathfinder 2e
sources — the **foundryvtt/pf2e** compendium packs (structured mechanics, per-doc license
data) and the **Archives of Nethys** Elasticsearch index (prose, citations, page numbers) —
plus a **TanStack Start SSR frontend** (`src/routes/`, `src/server/`, `src/domain/render/`)
that reads the emitted corpus from disk at request time and renders it. P1 (the ingest) was
deliberately frontend-free — it ends with a validated, deterministic, sharded corpus + a
transform report on disk. P2 (`thoughts/astra/specs/0029-codex-p2-entity-pages-spec.md`) adds
the frontend on top, unmodified corpus contract. See
`thoughts/astra/specs/0029-codex-p1-ingest-spec.md` for the ingest spec.

## The frontend (P2)

Every entity lives at `/{category}/{slug}` (the corpus id, verbatim — `/spell/heal`,
`/creature/red-dragon-adult`, `/spell/heal@legacy`), rendered by one total `CodexNode -> React`
layer (`src/domain/render/nodes.tsx`) plus bespoke statblock/facet headers for the structured
category groups (creature/hazard/spell/equipment/feat). `/` is the category directory (manifest
totals, unchanged since P2); `/{category}` is P3's faceted listing (below) — P2's throwaway A-Z
listing is gone. Crossref + trait-pill hover cards are a ported akasha Popover island
(`src/domain/components/islands/Popover.tsx`), mounted on entity pages only.

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
  corpus read layer: `corpusFs.ts` is the only `node:fs` seam (a `createCorpusReader(rootDir)`
  factory), root-resolved from `config.kdl`'s `codex.data-path` with a **fail-soft to the
  committed `fixtures/entities/` corpus** (loud startup WARN) when the real corpus isn't
  mounted — this is what makes `pnpm dev`/`pnpm test`/CI hermetic on a fresh clone with zero
  `data/`. `corpusFns.ts` wraps the pure resolvers (`entityPageData`/`directoryData`/
  `listingData`) as `createServerFn`s the route loaders call.
- **`src/domain/render/`** — the total node renderer, statblock/facet headers, edition
  banners, trait pills, and the listing/directory presentation components.
- **`src/routes/`** — `__root.tsx` (header omnibar + legacy toggle, every page), `index.tsx`
  (category directory), `$category/index.tsx` (P3 faceted listing), `$category/$slug.tsx` (entity
  page), `search.tsx` (P3 `/search`, below).
- **Run it:** `pnpm --filter @astra/codex dev` (real corpus if `data/corpus/` exists, else the
  fixture) / `pnpm --filter @astra/codex build && pnpm --filter @astra/codex start` (production
  parity, wires `astra.codex` OTel spans via `@astra/site-kit`'s `createSsrServer`). **Note:**
  `staticMounts` (below) is a `createSsrServer`-only mechanism — `/pagefind/*` only serves under
  `build && start`, not under plain `vite dev`.

## Browse (P3 S1/S3, D29-32/33/35)

`/{category}` ships a data-derived facet panel over the FULL enriched row set for that category
(client-side filtering, no server round-trip per interaction — the corpus's own `_index.json`
rows already carry everything needed).

- **Facet model, two committed modules.** `src/schema/facetKeys.ts` (S1, transform-owned) is the
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
  "has value" bound is set — the per-facet UI reports an "N without data" count). Sort is name
  (default, letter-anchored A–Z, `content-visibility: auto` per section — no virtualization
  dependency) or level (ascending, "—" bucket last); nothing else (rarity/source stay filters).
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

`apps/codex/scripts/build-search.ts` builds a [Pagefind](https://pagefind.app) index offline from
the corpus and writes it to `data/search/pagefind/` (sibling of `data/corpus/`, gitignored). It
walks every entity via the same `createCorpusReader` fs layer the frontend reads through, extracts
plain text (`collectText`/`statsText`, `src/domain/render/text.ts`) from `body` + `loreBody` +
the creature/hazard `stats`/`facets` statblock, and calls Pagefind's `addCustomRecord` directly
with structured `meta` (title/category/level/rarity/edition/book) and `filters`
(category/rarity/edition/level/superseded/traits — traits case-folded lowercase, corpus data
itself stays verbatim). `server.ts` serves the bundle at `/pagefind/` via `@astra/site-kit`'s
`staticMounts` (codex's first use of the mechanism) — registered unconditionally, no startup
existence check, since a `StaticMount` fails soft per request: `/pagefind/*` 404s until an index
exists, and a freshly-built index comes online with no server restart.

> ⚠️ **Host-only, ~3.8 GB RSS.** The native Pagefind indexer's peak memory during `writeFiles`
> over the full ~46,192-entity corpus is ~3.8–4 GB (measured) — this build step must **never**
> run in CI, a Docker build, or `vite build` (verified: `vp run -r build` only ever invokes
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

CI's own coverage is hermetic: `scripts/build-search.test.ts` runs the exact same
`buildSearchIndex()` against the committed fixture corpus into a fresh `os.tmpdir()` dir (never
`fixtures/` or `data/`) — `pagefind` is a plain npm devDependency, so this needs zero network and
none of the host-only memory profile above (that only shows up at real-corpus scale).

## Rules browser, attached sidebars, sources index (P4, D29-39..45)

`/rules` is now a **tree browser** (the P3 faceted flat listing for the `rules` category is
gone), rules entity pages gain hierarchy navigation (breadcrumb + a sidebar + a page-turn
pager), every category can render **attached sidebars** on its host pages, and `/sources`
adds an aggregate book index. One transform slice feeds all four; see
`thoughts/astra/specs/0029-codex-p4-rules-browser-spec.md` for the full decision record
(D29-39..45) — this section is the durable "how it works" summary.

### The tree model — sibling chains, not page-turn

AoN ships each rules doc with `breadcrumbs` (its ancestor-name chain) and raw
`next_link`/`previous_link` fields. **The raw links are NOT a page-turn sequence — they are
per-level SIBLING chains**, measured empirically: 0/3,642 `next` hops ever descend into a
subtree, 780 targets are claimed by 2–4 docs at once (always an ancestor/descendant set),
986 `next`/`prev` pairs are asymmetric, and 106 hops cross book boundaries entirely. Walking
them naively would resurrect all of that noise into the UI. Instead:

- **Parent resolution** (`src/ingest/rulesTree.ts`): a node's parent = the doc in the SAME
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

- **`data/corpus/rules-tree.json`** (`src/schema/rulesTree.ts`) — `{books: [{book, edition,
  license, hiddenWhenLegacyOff, nodes: TreeNode[]}]}`. `TreeNode = {name, id?, superseded?,
  children}`; `id` (a `CodexId`) is present for every node backed by a real rules doc, absent
  for a synthetic node. `hiddenWhenLegacyOff` precomputes the D29-40 "N hidden" legacy-toggle
  note per book (two real books measure 100% here — Dark Archive 29/29, Guns & Gears 65/65 —
  their "(Remastered)" twins carry the content; the tree browser renders these as a
  collapsed "all N hidden" header, never a silently-dropped section). Node arrays are
  emitted in FINAL order (DFS-ready) — array order is meaningful data here and untouched by
  `canonicalJson`'s object-key sort.
- **`data/corpus/sources-index.json`** (`src/schema/sourcesIndex.ts`) — one row per
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
normalization (`src/ingest/bookNormalize.ts`): trim/CRLF/whitespace-collapse, case-fold
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
`scripts/build-search.ts` (it only ever reads `body`/`loreBody`/`stats`/`facets` text off
each entity) — a P4-only corpus refresh needs no Pagefind rebuild. The host-only,
~3.8 GB-RSS `just codex-search-index` posture from P3 is untouched.

## UX rework + bespoke restyle (P4.5, D29-46..52)

P4.5 is frontend-only — no corpus/transform change (fixtures untouched) — and reworks five
independent surfaces per stakeholder redirect at P4's exit gate H: the whole visual system,
global nav + a real landing page, the legacy-toggle mechanism, category browse, and a
page-surface restyle sweep. See
`thoughts/astra/specs/0029-codex-p45-ux-restyle-spec.md` (D29-46..52, §8 build record) for
the full decision ledger.

### Parchment theme, self-hosted fonts, `src/ui/` (S1, D29-46)

codex no longer imports `@astra/gothic` — the dependency and its `theme.css` import are
gone from `package.json`/`__root.tsx` entirely, replaced by a codex-owned `src/styles/
tokens.css` (the style-tokens doc's palette, resolved under the SAME `--color-*`/`--font-*`
names `globals.css` already consumed, now pointing at parchment values instead of
gothic's dark-void ones) and a new `src/ui/` module (`Input`, `Button`, `TraitPill` +
`traitBucket.ts`, `ErrorChip`, `ActionGlyph`/`normalizeActionCost` — exact prop-signature
drop-ins for the five gothic imports they replace). Four self-hosted font families via
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

## Pipeline shape

```
snapshots/foundry/<tag>/    ─┐
                              ├─► parse ─► join ─► emit ─► corpus/ + report
snapshots/aon/<date>/       ─┘
```

Two ONE-SHOT snapshots (`data/snapshots/`, gitignored — fetched once, never queried again at
transform/build time), parsed by two independent grammars, joined into one canonical entity
per real game element, and written as a deterministic corpus tree.

### Module map

| Stage | Module(s) | What it does |
| --- | --- | --- |
| Fetch | `scripts/fetch-foundry.ts`, `scripts/fetch-aon.ts` | Snapshot the two sources to `data/snapshots/`; update the committed `corpus-manifest.json` pin. |
| Parse (Foundry) | `src/ingest/{enrichers,foundryHtml,journals,foundryEntities,uuidResolve}.ts` | `@UUID`/`@Check`/`@Damage`/`@Localize`/`@Template`/`@Embed` + inline-roll grammar → `CodexNode`s; JournalEntry `pages[]` assembly; per-doc license/edition. |
| Parse (AoN) | `src/ingest/{aonFacets,aonMarkup,aonLinkTable}.ts` | Facet extraction + the `markdown` field's custom-tag grammar → `CodexNode`s; the AoN-URL→codex-id link table. |
| Join | `src/ingest/join.ts` | Slug match → qualifier-reorder normalization → `join-aliases.json`; field ownership (Foundry wins mechanics, AoN wins prose/citations); identity finalization (`@legacy`/`-2` suffixing); crossref/embed patching. |
| Emit | `src/ingest/emit.ts` | Deterministic corpus writer — sorted keys, sorted file order, zod-validates every entity. |
| Report | `src/ingest/report.ts` | Pure builders for `report.json`/`report.md` — the P1 acceptance artifact. |
| Orchestrate | `scripts/transform.ts` | `runTransform()` wires all of the above; CLI wrapper for the real host run. |

`src/schema/{entity,nodes,manifest}.ts` are the shared Zod contracts (`CodexEntity`,
`CodexNode`, `CorpusManifest`) — read by P2+ verbatim, same package.

## Running it

```bash
pnpm --filter @astra/codex fetch:foundry   # sparse-clones the pinned tag
pnpm --filter @astra/codex fetch:aon       # snapshots the AoN ES index (~259 MB, ≤4 req/s)
pnpm --filter @astra/codex transform       # parse -> join -> emit -> report

# or all three + a report summary in one step:
just codex-refresh
```

`just codex-refresh` **refuses to run if `git status --porcelain -- apps/codex` is
non-empty** — a refresh rewrites the committed `corpus-manifest.json` pin, and that diff
must be reviewable on its own (the linguist-commit-timer lesson: never let a generated-file
change ride in on top of unrelated in-progress edits). Commit or stash first.

A real run takes well under a minute end to end (~15s for the transform stage alone) and
produces roughly 46,000 entities / ~625 MB of corpus (gitignored — `data/` never leaves the
host; see the corpus layout below).

## Corpus layout (`data/corpus/`, gitignored)

```
corpus/
  <category>/
    <slug>.json          one file per entity (the P2 lazy-load unit)
    <slug>@legacy.json    the legacy half of a shared-slug remaster pair (D29-1)
    _index.json          slim facet rows for the whole category (id/name/level/traits/
                          rarity/source/edition/superseded + a per-category-allowlisted
                          `facets` subset, D29-33c — NO body), sorted by id, COMPACT
                          JSON (no indentation, D29-33d — ~31% smaller; still key-sorted
                          + trailing LF, same determinism guarantee as every other
                          corpus file). The leading underscore is load-bearing (D29-21):
                          sluggify() can never emit one, so this file can never clobber
                          a real entity slug (the old plain index.json ate the two real
                          `index`-slug entities, ancestry/index + archetype/index)
  manifest.json           schemaVersion + the D29-4 source pins + final per-category
                          counts + total size (NOT the same file as the committed
                          apps/codex/corpus-manifest.json one level up — that one pins
                          what to FETCH; this one summarizes what got EMITTED).
                          totalEntityCount reconciles EXACTLY against a find|wc over
                          the entity files (D29-21)
  report.json / report.md the transform report (see below)
```

### schemaVersion 2 (P1.6, D29-19/-20/-21)

- **npc-only creature import (D29-19):** `type: "character"` Actors (iconics pregens,
  paizo-pregens, Kingmaker companions — 150 docs) are excluded before assembly; their
  AC/HP/saves are runtime-derived by the pf2e system, not statable from source. The
  ~16 AoN-indexed pregen twins still ship as AoN-only pages (D29-14(a)). Report field:
  `excludedActorsCount`.
- **`stats` (D29-20):** `creature`/`hazard` entities carry a typed, discriminated
  statblock projection — CreatureStats (speeds/abilityMods/senses/languages/
  immunities/resistances/weaknesses/skills) or HazardStats (hardness/stealth/
  isComplex + disable/routine/reset as parsed `BlockNode[]`). `EmbeddedItem` gains
  `attackBonus`/`damage[]` on `melee` strikes and `dc`/`attack`/`tradition` on
  `spellcastingEntry` items. Extraction is deterministic field mapping; absent source
  fields are omitted. The report carries per-field extraction coverage tables.
- One upstream pack typo (`pfs-season-6-bestiary/.../historys-repetition-7-8`, an
  unterminated `@Check[` in its hazard `disable` field) is handled fail-soft: the one
  broken field is omitted and counted as `hazardStatsHtmlFailed` — entity `body`
  parsing keeps its hard-fail posture.

Every file is written through one of two canonical serializers, both key-sorted
(codepoint order, recursively) with a trailing LF: `canonicalJson` (2-space indent) for
every entity file + `manifest.json` + the reports, and `canonicalJsonCompact` (no
indentation, D29-33d) for `_index.json` only. Two full transform runs over the same
snapshots produce a **byte-identical** `corpus/` tree —
verify with `diff -r` after copying a run aside. `emit.ts` wipes `corpus/` before every
write, so a stale file from a category/entity that no longer exists can't survive a
re-transform.

## The transform report

`report.md`/`report.json` are the P1 acceptance artifact — read `report.md` first. It
covers, per category: Foundry-in/AoN-in/final-out counts, join rate (exact / qualifier-
normalized / alias), unjoined residues (capped lists); slug collisions (legacy-pair vs.
residual); legacy/remaster pairing + the Foundry `remaster-changes` cross-check;
crossref/embed patch stats; license/edition breakdowns; and non-fatal report-class
counts (broken refs, mismatches, dropped images, ...). **Join rates are a judgment
call, not a threshold** — a category sitting under 50% joined with both sources present
gets a `⚠ STOP-condition` callout at the top of the report; per spec §6, that's a signal
to re-decide the join key with a human before P2, not something this pipeline
auto-corrects.

## Adding a join alias

`join-aliases.json` (committed, hand-curated) is reserved for **true one-offs** — a
name divergence between the two corpora for the exact same real-world game element
(a typo, a pluralization difference) that neither exact-slug matching nor the
qualifier-reorder normalization catches. It is NOT for systematic patterns (those need
a normalization rule in `join.ts` instead — see `qualifierCandidates`).

To add one:

1. Find a real unjoined pair in the report's per-category `unjoinedForeign`/`unjoinedAon`
   lists (or `pnpm --filter @astra/codex exec node --import
   ../../libs/ts/site-kit/src/nodeTsResolve.mjs scripts/dev-join.ts` for the live
   category/dragon-family breakdown).
2. Verify it's genuinely the same thing (same level, same source book) before adding it —
   never guess.
3. Append `{ "foundryId": "<category>/<slug>", "aonId": "<the AoN _id>", "note": "..." }`
   to `join-aliases.json`, documenting the divergence in the note.
4. Re-run the transform; the entry should show up in `report.md`'s "Aliases applied" table.

## What a hard-fail means

Every parser here (`enrichers.ts`, `foundryHtml.ts`, `aonMarkup.ts`) is hand-rolled and
**hard-fails on an unrecognized grammar form** — an unmapped `@Tag[...]` enricher, an
unmapped HTML tag, an unmapped AoN custom tag — rather than silently passing it through
or stripping it. This is the drift tripwire: a lenient parser would corrupt the corpus
quietly; a hard fail turns corpus drift (a Foundry/AoN refresh that introduces a genuinely
new markup form) into a loud, specific, fixable worklist entry instead. `emit.ts`'s
`CodexEntitySchema.parse` on every entity is the same posture applied one level up — a
schema violation (a field that slipped through parsing in a shape the corpus contract
doesn't allow) aborts the whole transform rather than emitting a malformed entity.
`categoryMap.ts`'s `(pack, docType)` map is the same idea again, one level up from that:
an unrecognized pack/type pair is a hard fail, not a silent default category.

If a real transform run ever hard-fails, the error names the exact document (path or
entity id) and the offending text — that's the intended workflow: fix the parser (or, for
a `CodexEntitySchema` violation specifically, the raw-field extraction feeding it — see
`src/ingest/foundryEntities.ts`'s `present()` helper for the `null`-vs-`undefined`
landmines the real corpus has already turned up), re-run, confirm zero failures.

## The fixture (`fixtures/`, committed)

CI needs the transform to run with **zero network and zero `data/` reads** — `fixtures/`
is a small (~1 MB), deterministic, committed subset of the real corpus that makes that
possible:

```
fixtures/
  raw/
    foundry/    a real-shaped mini Foundry snapshot (packs/pf2e/<pack>/..., static/lang/,
                system.pf2e.json) — ~30 hand-picked real docs, enough to reproduce the
                Heal legacy/remaster pair, Magic Missile -> Force Barrage, the Adamantine
                Dragon qualifier-reorder + 1:N variant, the Camouflage Coat alias, and the
                Anadi journal-page merge from scratch when re-parsed
    aon/        the matching real AoN doc hits (spell/creature/ancestry/feat), same
                {category, hits:[...]} shape the real fetcher produces
  join-aliases.json   trimmed to the one alias entry this fixture's raw docs exercise
  entities/     canonical-form-ONLY entities (no raw source) copied verbatim from a real
                emitted corpus — one representative per codex category (the smallest
                entity in that category) plus whatever else is needed to cover every
                CodexNode kind at least once (`blockquote` is allowlisted as
                corpus-extinct post-D29-19 — the only blockquotes lived in the excluded
                pregen docs — and the extractor re-proves that extinction on every run).
                Also carries the D29-21 fixture read surface: a per-category
                `_index.json` (fixture-scoped IndexRows) and a fixture-scoped
                `manifest.json` (fixture categoryCounts), so P2's corpus reader/route
                tests/ssrSmoke run hermetically with zero `data/` reads
```

`scripts/extract-fixture.ts` builds this from a real emitted corpus (run
`pnpm --filter @astra/codex transform` first) and **asserts the full coverage matrix**
before writing anything — every category, every `CodexNode` kind, the legacy pair, the
alias join, the qualifier-reorder + variantOf pair, a journal-merged entity, a residual
`-2` collision, and a Foundry-only / AoN-only entity. It fails loudly (listing exactly
what's missing) rather than silently shipping a gap.

`scripts/transform.test.ts` is the CI-hermetic pipeline test: it calls the exact same
`runTransform()` the real CLI uses, twice, over `fixtures/raw/`, into two fresh temp
dirs, and asserts zero hard failures, byte-identical output between the two runs, 100%
Zod-valid entities, the `entities/` coverage set still parsing, and a couple of content
spot-checks (the Heal pair's cross-links, Magic Missile's license + pairing).

## Deploy (P5, D29-53..57)

Codex ships as an SSR Compose service on the **heartwood-frontend model, not akasha's**:
`apps/codex/Dockerfile` is corpus-free (D29-54) — the build is already request-time-only
(D29-31: `vite.config.ts` has no content step, no `src/generated/`), so `docker build` needs
config.kdl + app source only, and the resulting image is ~3 MB of `dist/` plus the runtime.
The ~891 MB of corpus + Pagefind data never enters the image.

**Read-only bind mounts, identical path (D29-53).** `config.kdl`'s `codex.data-path` is a
host-absolute path consumed verbatim both by `pnpm start` on the host and by the container at
request time, and plain config fields have no env-override mechanism (config-single-source
forbids a per-environment fork). So the compose unit mounts the two data dirs at the *same*
path inside the container as on the host — the same convention the Dagster pipeline volumes
already use (`deploy/docker-compose.yml`), applied to a frontend for the first time:

```
/ruby/data/experiments/astra/apps/codex/data/corpus:/ruby/data/experiments/astra/apps/codex/data/corpus:ro
/ruby/data/experiments/astra/apps/codex/data/search:/ruby/data/experiments/astra/apps/codex/data/search:ro
```

`data/snapshots/` (601 MB, runtime-unreferenced ingest input) and `data/tmp/` deliberately
stay off the mount list — only the two dirs the running server actually reads.

**The fixture fail-soft, in prod.** If a deploy's mounts are ever missing or a fresh host
hasn't run `codex-refresh` yet, `corpusFs.ts`'s `resolveCorpusRoot()` falls back to the
committed 2.1 MB `fixtures/entities/` corpus with a loud one-time `console.warn` — the site
still serves (small, but correct-shaped), never an error page. A mis-mounted deploy looks
like: the container is healthy, `/` and category pages 200, but listing counts are tiny (the
fixture's handful of entities per category, not the real corpus's thousands) and the startup
logs carry `[codex] no corpus at "..." — falling back to the fixture corpus`. The runtime
image carries `fixtures/entities/` for exactly this reason (the one content-shaped COPY in
the Dockerfile) — `findAppRoot()`'s marker-walk needs it reachable above `dist/`.

**Refresh in prod (D29-57).** `just codex-refresh` (host-only, dirty-tree-guarded — see
above) now ends with a conditional restart: if `astra-codex` is running, it restarts the
container after the transform + search-index steps complete. `corpusFs.ts` caches the corpus
per category per-process, so without a restart a live container would keep serving stale
cached categories alongside freshly-refreshed ones; the Pagefind `/pagefind/*` staticMount
needs no restart (it fails soft per-request and picks up a freshly-written index
immediately) but rides along harmlessly. The restart is a no-op (skipped, not an error) when
`astra-codex` isn't running or Docker isn't available.

**Noindex, three layers (C-1).** (1) SSR HTML always carries `<meta name="robots"
content="noindex">` (`src/routes/__root.tsx`, ships regardless of deploy). (2)
`apps/codex/public/robots.txt` (`Disallow: /`, this slice) lands in `dist/client` and serves
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
