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
> ~50–55 MB bundle (fragments + index/filter chunks + the Pagefind runtime JS/wasm).

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
