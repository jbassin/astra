# 0029 — codex P3: faceted browse + search — spec

**Build record:** S1 BUILT 2026-07-14 (emit extensions, D29-33 a–e in full). Gate A results:
determinism 3× byte-identical; file count 46,192 == manifest; **superseded = 11,012 exactly**
(10,970 legacy + 42 remaster, cross-checked emitted-rows vs independent `remasteredAs` scan);
feat actionCost 70.5%/6 (anchor exact); family coverage 36.6% (2,672/7,296, 467 distinct);
spillover keys 0 hits across all rows; all 6 gap-category candidates passed the classifier
(ancestry hp/size/speed 50.5%, class hp/keyAbility 55.1%, background trainedSkills 80.1%/16,
condition valued 42.9%, heritage ancestrySlug 70.2%/50); classifier-derived extras pinned:
armor=[itemCategory,bulk,price], shield=[bulk,price], creature-ability=[actionCost,itemCategory],
vehicle=[ac,fortitudeSave,hp,size], warfare-army=[hp]; equipment.itemCategory FAILED (21.5%),
familiar-ability core-only (38.2%). **Acceptance-A envelope deviation, ACCEPTED (orchestrator):
compact indexes = 11.31 MB raw / 1.19 MB gz vs the ≤10.5 MB envelope** — the 10.23 MB was
measured before the spec-mandated required `superseded` boolean (+0.83 MB) and before the gap
categories + family existed; gz is within ~5% of the 1.12 MB estimate; the §6 sanctioned trim
(drop creature/hazard per-row saves) stays available at S3's page-weight measurement. Codex
suite 961 tests; both repo lanes reproduced green.

S2 BUILT 2026-07-14 (search index build + serving, D29-34 in full). Gate B results: real-corpus
host build 46,192 pages == manifest exact, ~32 s wall (23 s on re-run), peak native-indexer RSS
**3.94 GB measured** (≈ the 3.8 GB probe); bundle 55.1 MB apparent (~12% over the 49.1 MB probe —
expected: structured meta/filters + statsText content the bare probe didn't carry); zero add
errors. **D29-36 traits-filter decision: KEEP** — the traits filter chunk measured **176 KB**
(edition 105 KB / superseded 104 KB / category 103 KB / rarity 100 KB / level 74 KB; filter dir
672 KB total), nowhere near the "few MB" drop threshold. Serving proven on the production server
(staticMounts is createSsrServer-only — `vite dev` does NOT serve mounts, verified empirically;
S4's dev loop must use build+start for search): /pagefind/* 200s, fail-soft rename→404 with site
still serving, restore→200 with NO restart. Hermeticity: data/ renamed away → 979/979 tests +
build green. One orchestrator review fix: statsText gated to creature/hazard at the build-search
call site (post-S1 gap facets put hp/size on ancestry/class/vehicle — unconditional call indexed
spurious stat fragments); index rebuilt post-fix. Codex 979 tests; both lanes green.

**Gate amendment (stakeholder, 2026-07-14):** the S3 stakeholder review (browse surface +
folded-in P2-H) is DEFERRED — he's unavailable at S3-complete; it no longer gates S4. All
stakeholder review consolidates into ONE post-S5 session covering acceptance H in full: browse
surface + P2-H spot-set (M7/M11 expected behaviors) + search surface. S3→S4→S5 proceed on the
orchestrator's technical gates alone.

S3 BUILT 2026-07-14 (faceted browse, D29-32/35 in full). Technical gates: big-12 spot-set all
proven live against the real corpus (feat actionCost=reaction 445; trait tri-state clicked
6,171→272→5,899→6,171; creature family+level+humanized sizes; equipment per-10 price (Candle);
spell traditions; hazard reuses FacetPanel; /rules core-only w/ level correctly hidden); URL
round-trip in a fresh context incl. legacy=1; hostile params ignored; zero hydration/console
errors on the 4-page sweep; hermeticity 1,126 tests green with data/ away; both lanes green;
client-bundle byte-search 0 hits. **Perf (gate F): feat full response 4.49 MB raw / 465 KB gz
(the accepted P2 D29-27 weight class — spec's 2.05 MB figure was the bare _index.json only),
filter-interaction 61 ms, applyFilters ~2 ms — content-visibility alone suffices, no
incremental-reveal, NO creature-saves trim (orchestrator: not warranted).** Two real-corpus
finds folded in: (1) comma-bearing facet values (creature.family "Dragon, Black" ×380,
source.book ×240) shredded by naive CSV split → backslash-escaped codec, byte-identical for
all spec-literal examples; (2) SSR legacy-flash — first render must read search.legacy
isomorphically (live-toggle server snapshot is always false), live toggle takes over
post-hydration only. Plus: jsdom stays per-file (@vitest-environment docblock) — a global
jsdom default breaks sluggify.test.ts under vp's concurrent run.

S4 BUILT 2026-07-14 (search UI, D29-36 in full). Gate E evidence: "red dragon" → correct top
hits; "counteract" == "counterac" top-8 byte-identical (prefix fallback proven); grouped
type-ahead on "drago"; /search filter panel narrows (dragon 1,172→501 by category; level
discrete multi-select); superseded hidden/shown by toggle ("magic missile" legacy case);
shared empty state + clear; no-JS SSR notice; keyboard flow full (Ctrl/Cmd-K, arrows, Enter
both modes, Esc); cold-start transfer **594 KB** (≤ ~600 KB target); zero hydration errors;
telemetry proven by local OTLP smoke (codex.search {surface} counted — SigNoz check at S5).
**Recorded deviations (orchestrator-accepted):** (1) `codex.search` is a SERVER counter behind
a fire-and-forget serverFn — no browser MeterProvider exists anywhere in astra
(@astra/observe/web wires traces only); every repo lazyCounter site is server-side; a browser
meter would need new deps or a libs/ts/observe edit, out of scope. (2) .oxlintrc.json gains
SearchPage.tsx in the existing no-danger exemption (the akasha pagefind-excerpt precedent).
(3) **Weighting revisited per D29-34 and REVERTED:** meta.title carries no ranking weight in
the addCustomRecord path; weight-span injection didn't move `/spell/heal` at 46k scale AND
leaked raw attribute text into excerpts — single-common-word name queries ("heal") remain a
documented Pagefind TF-ranking limitation (STAKEHOLDER REVIEW ITEM at the final gate);
distinctive names rank correctly. (4) **Real S2 bug found+fixed:** Pagefind writeFiles is NOT
idempotent against a pre-existing outDir (stale hashed fragments accumulate per re-run) —
build-search now rm-rf's before write; index cleanly rebuilt, 46,192 pages exact.

**Status:** FINAL (2026-07-14) — authored against the REAL post-P1.6 corpus (46,192 entities /
88 categories, measured this session). Stakeholder decisions batched + resolved 2026-07-14
(facet depth, search UX shape, legacy default, listing payload strategy, extractor-gap
extension, creature family — recorded as D29-32..36 below). **Research basis is empirical,
not estimated:** a live Pagefind build over the full real corpus + a full-corpus facet
derivation analysis + Pagefind-at-scale literature (§1). *Process note: the multi-AI research
probe had no external providers available; research + adversarial review ran on in-house
agents (the sanctioned fallback), same as P2's build process.*
**Adversarially reviewed same day: 3 blockers + 5 minors + 4 nits, ALL folded in** (B1 the
`+` include-sigil is eaten by `URLSearchParams` decoding → sigil-free includes; B2 the
pinned `superseded` count was stale — measured 11,012 not 7,152; B3 S1 needed the facet-key
allowlist S3 was to deliver → shared `facetKeys.ts` pulled into S1; plus toggle-flap-on-nav,
search-surface collision disambiguation, empty states, an explicit sort decision, the
31-value/-2..28 level range, symbol-name and staticMount-mechanics corrections, and the
acceptance-E query-class fix).
**Prerequisite:** P2 acceptance **H (stakeholder page review) is still pending** — it folds
into this phase's first stakeholder gate (S3's real-corpus review) unless cleared earlier;
the M7 links-not-inlined + M11 statblock-twice expected behaviors ride along.
**Scope doc:** `thoughts/shared/research/2026-07-12-codex-0029-thoughts.md` (C-1..C-8).
**P1 spec:** `thoughts/astra/specs/0029-codex-p1-ingest-spec.md` (D29-1..21).
**P2 spec:** `thoughts/astra/specs/0029-codex-p2-entity-pages-spec.md` (D29-22..31).
**Phase context:** P3 of 5 (P4 rules browser · P5 deploy). P3 replaces P2's throwaway
listings with faceted browse across all 88 categories, adds site-wide search (header omnibar
+ `/search` page) on Pagefind, and ships the site-wide legacy toggle. NO rules-tree UX (P4),
NO deploy (P5).

## 1. Overview

Three surfaces: (a) **faceted category listings** — the D29-27 throwaways die; every
`/{category}` page gets a data-derived facet panel with tri-state trait filtering, client-side
over fully-shipped index rows (stakeholder call); (b) **search** — a header omnibar with
instant type-ahead plus a `/search` results page, on a Pagefind index built offline from the
corpus and served as static files; (c) **the site-wide legacy toggle** — superseded legacy
entities hidden by default everywhere (C-4 remaster-primary, completed). Feeding these, one
transform-side slice extends the emit: facet extraction for 5 gap categories, creature
`family` populated from AoN, enriched `_index.json` rows.

**Measured facts this spec is built on (2026-07-14, real corpus — do not re-derive):**

- **Pagefind probe (full 46,192-entity build, pagefind@1.5.2):** build 33.0 s wall-clock
  (19.3 s index + 13.6 s writeFiles); extracted text 46.9 MB → bundle **49.1 MB apparent**
  (fragments: 46,192 files avg 648 B p99 2,695 B; index chunks: 536 files avg 32 KB max
  341 KB; per-language meta 316 KB; runtime js 45.5 KB + wasm 72 KB). Estimated cold-start
  transfer ~470–535 KB; warm query ~35–100 KB. **Native indexer peak RSS ~3.8 GB** (ramps
  during writeFiles) — matches public OOM reports at 30k–100k pages; Node-side RSS only
  ~100 MB. Zero add errors. Conclusion: one monolithic index is comfortably viable; the
  build is host-only.
- **Facet analysis (all 88 categories):** `facets` is populated ONLY on Foundry-merged
  entities (never `proseOnly`) — coverage ceiling per category = 1 − proseOnly fraction,
  all-or-nothing per entity, not a data bug. Only **15/88 categories carry any `facets`
  key**; 73 are empty on every entity; by the classifier below, **75/88 have nothing usable
  beyond the uniform core**. `featLevel`/`rank` are **proven exact duplicates of `level`**
  (100% match on every category checked). **Trait casing is edition-coupled** (remaster
  lowercase, legacy Title-Case): 1,082 raw strings case-fold to **644 distinct traits**
  (1.68× inflation) — folding is mandatory in any trait filter. Equipment-family `price` is
  **100% parseable** (`^\d[\d,]*\s*(pp|gp|sp|cp)`, one `per 10` batch suffix). Same key name
  ≠ same facet across categories (`weapon.usage` cardinality 4 vs `equipment.usage` 116).
  `creature.size` uses Foundry abbreviations (`med`/`lg`/`grg`…) — display-label map needed.
  Distinct `source.book`: 519. `_index.json` rows already carry `traits` (P2's listing
  loader trims them — the trim dies with the throwaways).
- **Enriched-index sizing (measured by building the rows):** switching `_index.json` to
  compact JSON alone saves ~31% (13.48 MB → 9.31 MB); adding each category's derived facet
  keys lands at **10.23 MB raw / 1.12 MB gzip total** — still 20% under today's
  pretty-printed baseline. Worst case `creature` (+42.5% gz, 298 KB — near-unique stat
  integers): accepted.
- **Pagefind capability notes (docs/issues, cited in the research trail):**
  `addCustomRecord({url, content, meta, filters, sort})` passes structured filters/meta
  directly — no HTML-attribute round-trip; **filters are string-equality only** (no numeric
  ranges — level ships as discrete values); query-time prefix-fallback matching gives
  type-ahead UX natively; `metaWeights.title` default 5.0× + h1 weight 7.0 favor name
  matches; search runs in a Web Worker (1.5.0+).

## 2. Locked decisions

Carried: C-1 public-noindexed · C-4 remaster-primary + legacy · D29-12 hermeticity (CI has no
`data/`) · D29-22 URL scheme · D29-23 reader split (fs layer never imported by components) ·
D29-30 telemetry/noindex · D29-31 member mechanics · Decision I (SSR Compose service).

Spec-level:

- **D29-32 Facet model = data-derived per category (stakeholder: 5e.tools-depth everywhere).**
  - **Core facets on every category:** `level` (hidden where the category has 0% coverage —
    e.g. trait, action), `rarity`, `traits` (case-folded, tri-state), `source.book`,
    `edition`. That IS the full UI for the 75 long-tail categories.
  - **Derived per-category facets** per the validated classifier: GOOD-FACET = coverage ≥40%
    ∧ cardinality 2..~60 (soft — `equipment.usage` at 116 ships because its top-15 values
    cover 76%); RANGE-FACET = numeric wide-spread (level/hp/ac/price/bulk/saves/perception);
    LIST-FACET = short arrays, bounded cardinality (traits, traditions); free-text and
    <40%-coverage keys are page-detail only, never filters. SPILLOVER keys (`featLevel`,
    `rank`) are banned from facet defs (proven `level` duplicates).
  - **The pinned big-12 facet sets** (from the measured analysis — the build implements
    exactly these, plus classifier-derived sets for the remaining facet-bearing categories):
    feat = level·rarity·traits·actionCost·itemCategory; creature = level·rarity·traits·size·
    family(D29-33b)·hp·ac·fort/ref/will·perception; equipment = level·rarity·traits·bulk·
    price·usage; spell = level(rank)·rarity·traits·traditions·castTime·range(parsed hybrid:
    numeric-feet buckets + touch/self special values); hazard = level·rarity·traits·size·hp·
    ac·saves (creature's UI component reused); weapon = level·rarity·traits·itemCategory·
    usage·bulk·price; class-feature = level·rarity·traits; action = rarity·traits;
    rules/item-bonus/trait/deity = core only (+ deity itemCategory). `prerequisites`
    (cardinality 1,811, free prose) is explicitly NOT a facet.
  - **Facet definitions split into two committed modules (adversarial B3 — S1 must not
    depend on S3):** `src/schema/facetKeys.ts` — the per-category facet-key ALLOWLIST only,
    importable by both `emit.ts` (S1 row trimming) and the browse layer; and
    `src/domain/browse/facetDefs.ts` (S3) — the UI metadata per key
    `{widget: enum|tristate|range, labelMap?, parse?}`. A conformance test asserts
    `facetDefs` keys == `facetKeys` exactly, every key exists in the fixture corpus schema,
    spillover keys are absent from both, and label maps are total (size abbreviations,
    actionCost values). Option lists + counts are computed client-side from the shipped rows
    (rows are local by D29-35 — no separate option artifact).
  - **Missing-key semantics:** entities without a facet key form an implicit "—" bucket; an
    include-selection on that facet drops them; exclude-selections never match them; range
    filters ignore them unless the "has value" bound is set. ProseOnly entities therefore
    stay visible under trait/core filtering and drop out only when a Foundry-only facet is
    actively used — render a per-facet "N without data" count so this is legible.
  - **Price** parses to copper (`pp=1000·gp=100·sp=10·cp=1`), `per 10` divides for per-item
    value; slider filters on copper, displays the original string.
  - **Trait case-folding lives at the UI layer** (option lists + matching fold; display
    label = folded lowercase). Corpus data stays verbatim — P2 entity pages are untouched.
- **D29-33 Emit extensions (transform-side, S1 — additive, schemaVersion stays 2 per the
  entity.ts additive-field precedent):**
  - **(a) Extractor gap closed for the 5 categories with merged-but-unextracted Foundry
    data:** ancestry (hp/size/speeds), class (keyAbility/hp), background (trainedSkills →
    LIST if it passes the classifier), condition (value-bearing flag), heritage (ancestry
    linkage). Exact fields ship ONLY where they pass the D29-32 classifier against the real
    corpus — the slice reports coverage/cardinality per candidate in `report.md` and drops
    failures (no silent junk facets).
  - **(b) `creature.family` populated from the AoN creature meta** (`creature_family`) at
    join; coverage reported. If AoN coverage measures <40%, the facet still ships (family is
    a navigational facet, the "—" bucket carries the rest) — deviation from the classifier,
    stakeholder-sanctioned by the populate decision.
  - **(c) `IndexRow` gains** `facets` (ONLY the keys in `facetKeys.ts` for that category —
    73 categories emit none) **and `superseded: boolean`** (`remasteredAs` non-empty — the
    legacy-toggle predicate; NOT `edition === "legacy"`, which would wrongly hide
    never-remastered content; the 134 same-edition pair anomalies fall where their
    `remasteredAs` puts them). **Measured against the real corpus (adversarial B2): 11,012
    entities have non-empty `remasteredAs` (10,970 legacy + 42 remaster) — this, not P2's
    7,152 legacy-pair figure (a different question), is the expected superseded count.**
  - **(d) `_index.json` switches to compact JSON** (31% for free); entity JSONs untouched
    (no 46k-file churn).
  - **(e)** Fixture corpus + fixture indexes regenerate; report gains a facet-coverage
    section; determinism 3×; file count == manifest exactly (the standing gate).
- **D29-34 Search = Pagefind `^1.5.2` (akasha's family), built OFFLINE on the host, served
  static.**
  - New `apps/codex/scripts/build-search.ts` (akasha `build-search.ts` precedent, corpus
    edition): walks the corpus via `createCorpusReader`, extracts plain text per entity
    (generalize P2's `collectNodeText`/`firstParagraphSummary` in `src/domain/render/text.ts`
    to full-tree + `loreBody` + a `statsText()` for creature/hazard — adversarial N9: no
    `collectText` symbol exists), and calls **`addCustomRecord`** with structured
    `meta: {title: name, category, level, rarity, edition, book (source.book — collision
    disambiguation in search surfaces, adversarial M5)}` and
    `filters: {category, rarity, edition, level (stringified), superseded,
    traits (case-folded)}` — no synthetic HTML round-trip. Output →
    **`data/search/pagefind/`** (sibling of `data/corpus/`, gitignored).
  - **Served via codex's first USE of site-kit `staticMounts`** (`/pagefind/` →
    `loadConfig().codex.dataPath + "/search/pagefind"`) — the mechanism is proven
    (akasha `/audio` + `/pagefind`, mouthpiece `/audio`; no site-kit work needed).
    **Registered unconditionally (adversarial N11):** `StaticMount` fails soft per-request
    (`isFile()` in the fetch handler), so an index built AFTER server start comes online
    with no restart — do NOT gate registration on a startup existence check. **Fail-soft
    UX:** absent index → the pagefind.js fetch 404s → omnibar renders disabled with an
    "index not built" title; `/search` shows the same notice (dev/CI-clean by construction).
  - **The build is host-only** (measured ~3.8 GB native-indexer RSS): wired as
    `just codex-search-index`, called from `just codex-refresh` after transform. NEVER in
    `vite build`, CI, or a Docker build step (P5 inherits: the index rides the same
    bind-mount as the corpus). `pagefind` is a codex **devDependency**.
  - Weighting: defaults (title meta 5.0×) — the probe's anatomy showed no need for tuning;
    S4 revisits only if name matches rank poorly in real queries.
- **D29-35 Browse = faceted listings replacing the throwaways (stakeholder: full rows
  client-side, filter locally).**
  - `/{category}` loader ships the full enriched row set (loses P2's `ListingRow` trim —
    rows now = `IndexRow` incl. `facets`/`traits`/`superseded`). Measured weight: enriched
    compact indexes total 10.23 MB / gz 1.12 MB; feat ≈ 2.05 MB raw / 222 KB gz — accepted
    (the P2 D29-27 weight class, now permanent; dehydration double-carry included in S3's
    measurements).
  - **Filter island** (`src/domain/browse/`): pure filter engine over rows — traits =
    tri-state (AND across includes, NOT across excludes); enum facets = multi-select OR;
    numeric = min/max over parsed values (**bounds derived from the data — levels span
    -2..28, 31 distinct values corpus-wide; never default a lower bound to 0/1, adversarial
    M8**); a name quick-filter input. Facet option lists + live counts computed from the
    rows. **Sort control (adversarial M7 — explicit, not silent): name (default,
    letter-anchored A–Z) or level (anchors hidden, ascending w/ "—" bucket last); nothing
    else** — rarity/source are filters, not sorts. Letter-section layout (P2's anchors)
    retained under name sort; **rendering guarded by CSS `content-visibility: auto` on
    letter sections + incremental reveal as the sanctioned fallback — NO new virtualization
    dependency.** S3 measures filter-interaction latency on feat (8,484 rows). **Empty
    state (adversarial M6): filtered-to-zero renders an explicit message + a one-click
    "clear filters" affordance** (same component serves `/search`).
  - **URL round-trip** via `validateSearch` (strider `index.tsx` precedent — the repo's only
    prior art, though it exercises none of this codec's hard parts): human-readable params
    `?traits=fire,-agile&level=-2..5&rarity=rare,unique&f.actionCost=1,reaction&q=drag&
    legacy=1` (derived facet keys namespaced `f.<key>`). **Include sigil is NO marker;
    exclude is `-` (adversarial B1: a bare `+` is decoded to a space by the router's
    default `URLSearchParams`-convention parser — verified; a leading-`-` trait name does
    not occur in the folded 644).** `validateSearch` must also tolerate the default
    parser's bare-numeric coercion (`legacy=1` arrives as number `1`). Reload/share-stable;
    unknown params ignored; empty state = clean URL. One codec module, property-round-trip
    tested **including the literal `traits=fire,-agile` and coerced-number cases**.
  - **Legacy toggle (site-wide, stakeholder):** header control; `superseded` rows hidden by
    default in listings AND search. Persisted to localStorage. **Precedence (adversarial
    M4 — no toggle flap):** the URL param wins ONLY on initial document load (a shared
    link reproduces the sharer's view); client-side navigation preserves the live toggle
    (internal links carry no `legacy` param); browse/`/search` routes reflect the live
    state into their own URL via a router search replace, so the address bar stays
    copy-shareable at all times. Listings show "N of M shown"; the `/` directory keeps
    manifest totals.
  - **Collision disambiguation (the 1,830 `-N` groups + 134 anomalies):** when two visible
    rows share a display name, rows append their `source.book` inline — mechanical, no
    per-entity curation. (Rows already carry source; this is a render rule.)
  - **Listing rows get NO hover cards** (deliberate, carried from P2 — hover-fetch on 8k-row
    lists thrashes; rows navigate).
  - `/` directory page: stays the grouped category list (counts from manifest); gains
    nothing else — the omnibar is the global entry point.
- **D29-36 Search UX (stakeholder: omnibar + results page).**
  - **Omnibar island** in the header on every page: lazy-loads `/pagefind/pagefind.js` on
    first focus (akasha's `@vite-ignore` dynamic-import pattern), 180 ms debounce, token
    stale-guard; type-ahead dropdown = top ~8 results grouped by category, rendered from
    result `meta` (name, category, level, edition pill, **+ `book` inline when two visible
    results share a name — the D29-35 collision rule extended to search, adversarial M5**)
    — one fragment fetch per shown result (measured avg 648 B). Enter or "all results" →
    `/search?q=…`. Keyboard: ↑/↓/Enter/Esc; Ctrl/Cmd-K focuses (akasha muscle memory).
  - **`/search` route:** query box + Pagefind-filter panel (category, rarity, edition,
    level, traits) sourced from `pagefind.filters()`; results with excerpts (Pagefind's
    `<mark>` excerpts, the M5 collision rule on result rows); zero results renders the
    shared D29-35 empty state; URL round-trips `q` + filters through the same codec; the
    legacy toggle applies as a `superseded:false` filter unless legacy is on (M4
    precedence). Client-only island content within the SSR shell (search cannot SSR — the
    index is client-fetched; the route SSRs the shell + notice for no-JS).
  - **Traits-filter fallback (pre-sanctioned):** the traits filter index (644 values ×
    46k pages) was NOT sized by the probe (only `category`, 103 KB). S2 measures it; if it
    is disproportionate (> a few MB), drop `traits` from Pagefind filters — browse keeps
    full trait filtering client-side; `/search` keeps the other filters. Not a stop.
- **D29-37 Testing (repo idiom — explicit fixtures + structural asserts, no snapshots).**
  - facetDefs conformance suite (§D29-32) over the fixture corpus.
  - Filter-engine unit tests incl. tri-state semantics + the missing-key "—" bucket +
    price/range parsing (`per 10`) + trait folding (a Magical/magical pair fixture).
  - URL codec round-trip tests (encode∘decode = id over generated states; hostile params).
  - **`build-search.ts` runs in CI against the fixture corpus** (pagefind is an npm dep —
    hermetic): assert `pagefind-entry.json` page_count == fixture manifest count, bundle
    anatomy present, filters emitted. The REAL-corpus build is gated in S2 (host).
  - Route tests: enriched listing render, `legacy=1` behavior, `/search` shell SSR; ssrSmoke
    stays green on the fixture fallback; transform determinism 3× (S1).
- **D29-38 Telemetry.** SSR spans free (D29-30); the staticMount serves under existing
  server spans. RUM gains one event: a `codex.search` counter (lazyCounter — the
  module-scope-instrument gotcha) with `{surface: omnibar|page}`. Facet interactions are NOT
  instrumented (noise; revisit only on stakeholder ask).

## 3. Deliverables (by component)

**Transform/emit** — extractor extensions (5 categories + family join), `IndexRow.facets` +
`superseded`, compact `_index.json`, `src/schema/facetKeys.ts` (the shared allowlist, S1),
fixture + report regen.
**`apps/codex/scripts/build-search.ts`** — corpus → Pagefind bundle (host);
`just codex-search-index` + `codex-refresh` wiring.
**`apps/codex/src/domain/browse/`** — `facetDefs.ts`, `filterEngine.ts`, `urlState.ts`
(codec), `FacetPanel.tsx`, listing island.
**`apps/codex/src/domain/search/`** — `Omnibar.tsx`, `SearchPage.tsx`, pagefind loader seam.
**Routes** — `$category/index.tsx` rewritten (faceted), new `search.tsx`, `__root.tsx` gains
omnibar + legacy toggle.
**`server.ts`** — the `/pagefind/` staticMount (conditional).
**README** — build-memory warning (3.8 GB host indexer), refresh flow, facet model.

## 4. Slices (each CI-green, committed, conventional)

- **S1 — emit extensions (transform-only, lands first).** D29-33 in full: **the
  `facetKeys.ts` allowlist (adversarial B3 — S1 owns it; S3's `facetDefs.ts` imports it)** +
  extractor gap + family join + enriched rows + superseded + compact indexes +
  fixture/report regen + determinism 3×. Gate: full re-transform; file count == manifest; report's facet-coverage
  section reproduces the analysis anchors (feat actionCost ≈70.5% cov / 6 values; spillover
  keys absent from rows; **superseded count == 11,012 (10,970 legacy + 42 remaster —
  measured this session, adversarial B2), cross-checked by an independent `remasteredAs`
  non-empty count**); family coverage reported.
- **S2 — search index build + serving.** `build-search.ts` (addCustomRecord path + text
  extraction reuse), staticMount + fail-soft, fixture-driven CI test, just recipes. Gate:
  REAL-corpus build on the host completes (expect ~33 s / ~49 MB / ~46,192 pages — record
  actuals incl. the traits-filter index size → D29-36 fallback decision), bundle served
  through `pnpm dev`, CI green with `data/` renamed away.
- **S3 — faceted browse.** D29-32 defs + engine + panel + URL codec + legacy toggle +
  collision render rule + big-listing perf treatment. Gate: the big-12 render their pinned
  facet sets against the real corpus; feat listing filter-interaction stays responsive
  (measure; content-visibility/incremental fallback applied if not); URL reload/share
  round-trips proven; **stakeholder review of the browse surface (folds in pending P2-H:
  the C spot-set + M7/M11 expected behaviors) — his sign-off gates S4.**
- **S4 — search UI.** Omnibar + `/search` + filters + legacy interplay + the `codex.search`
  RUM event. Gate: real queries against the real index through the dev server; cold-start
  transfer measured (expect ≤ ~600 KB); grouped type-ahead correct on a name, a rules term,
  and a stat term; keyboard flow.
- **S5 — acceptance sweep + docs.** Playwright pass over the acceptance set below, telemetry
  check, hermeticity gate, README + memory updates, measurements recorded in the spec status.

## 5. Acceptance criteria (P3 exit gate)

- **A (S1).** Emit gates: determinism 3×, manifest-exact file count, facet-coverage report
  section, superseded/family counts pinned, spillover keys provably absent from rows,
  compact indexes ≤ the measured 10.5 MB envelope.
- **B (S2).** Real-corpus index builds on the host and serves via `/pagefind/`; fixture CI
  test green; fail-soft proven (index dir renamed → site fully functional, search disabled
  notice); traits-filter size recorded + fallback decision made.
- **C.** Browse: big-12 facet sets work against the real corpus (spot-set: feat by
  actionCost=reaction + trait fold check on a Magical/magical trait; creature by family +
  level range + size labels humanized; equipment by price slider incl. a `per 10` item;
  spell by tradition + rank; hazard reusing the creature panel; a facet-less long-tail
  category shows core-only). Tri-state traits proven (include+exclude simultaneously).
  "N of M shown" correct under the legacy toggle both ways; a filtered-to-zero listing
  shows the empty state + clear-filters (M6); sort by level places the "—" bucket last.
- **D.** URL state: a filtered listing URL pasted into a fresh session reproduces the exact
  view (incl. `legacy=1`); unknown params ignored; the codec property test suite green.
- **E.** Search: omnibar type-ahead on ≥3 query classes (entity name → top hit; rules term;
  **a truncated-but-correctly-spelled prefix — Pagefind's documented zero-result fallback;
  typo tolerance is explicitly NOT claimed or tested, adversarial N12**); `/search` filter
  panel narrows by category/level/rarity/edition; superseded results hidden by default,
  shown under the toggle; zero-results empty state renders with working "clear filters"
  (M6); no-JS `/search` shows the SSR notice.
- **F.** Perf/weight recorded: feat listing full response bytes (raw+gz), filter-interaction
  latency on 8,484 rows, search cold-start transfer, index build time/RSS on the host.
- **G.** Telemetry + hermeticity: `astra.codex` spans healthy, `codex.search` counter
  increments in SigNoz (or local OTLP smoke — record which); fresh-clone simulation green
  both lanes; zero hydration errors in the Playwright console sweep.
- **H.** Stakeholder review of browse + search surfaces (S3 gate covers browse + pending
  P2-H; final H = the search surface + anything he clicks). Exit = sign-off, then
  `octo:spec` P4.

## 6. Risks / adversarial notes

- **Indexer memory (~3.8 GB RSS) is the sharp edge** — documented in README + justfile
  comment; the recipe must never migrate into a Docker build or CI lane on "it's just a
  script" grounds. P5's compose/bind-mount design inherits this constraint explicitly.
- **Traits Pagefind-filter size unmeasured** — pre-sanctioned fallback in D29-36; decision
  recorded at S2, not deferred silently.
- **Level has no numeric range in Pagefind** — `/search` level filtering is discrete-value
  multi-select (**31 values, spanning -2..28 — negative levels are real, adversarial M8**);
  the range *slider* exists only in browse (client-side). Do not attempt range emulation in
  the search page's first cut.
- **Enriched creature index compresses worst** (+42.5% gz, 298 KB) — accepted; if S3's
  measured page weight offends, the sanctioned trim is dropping per-row save values from
  `IndexRow.facets` for creature/hazard (saves become page-only detail), NOT re-litigating
  client-side filtering.
- **Trait folding merges case variants only** (1,082 → 644 verified) — it must NOT attempt
  singular/plural or synonym merging; any further normalization is a new decision.
- **The 5-category extractor extension can surface junk** — the classifier gate (report
  coverage/cardinality per candidate, drop failures) is the guard; a candidate that fails
  ships as page detail, not a facet, and that's a correct outcome, not a miss.
- **Filter-engine correctness with missing keys** is the likeliest logic-bug nest
  (tri-state × "—" bucket × ranges) — it gets exhaustive unit coverage before any UI exists.
- **`window.$_TSR` dehydration double-carry** applies to enriched rows exactly as P2
  measured for listings — S3 measures FULL response bytes; the sanctioned trim is loader
  payload field-narrowing, never a `<details>` shard.
- **Standing:** keep a clean index across the linguist-commit timer window during commits;
  the routeTree.gen.ts flap regenerates on build — restore from HEAD if only-noise.

## 7. Out of scope (P3)

Rules-tree/breadcrumb navigation + sources index (P4 — corpus `rules` entities still carry
no breadcrumbs; P4 re-derives). Deploy artifacts (P5: Dockerfile/compose/caddy/robots +
X-Robots-Tag + prod refresh flow for corpus AND search index). Hover cards on listing rows
(deliberate). Pagefind `sub_results`/weighting tuning beyond defaults. Numeric range filters
inside Pagefind (client-side browse covers ranges). Search analytics beyond the one counter.
Cross-index `mergeIndex` partitioning (probe proved monolithic viable). Any trait
normalization beyond case-folding. i18n.
