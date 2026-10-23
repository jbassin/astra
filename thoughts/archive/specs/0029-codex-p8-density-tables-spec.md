# 0029 P8 — density/table restyle + UX round (spec)

**Status:** BUILT (2026-07-17 — S1 `0693d61` · S2 `fa0b42d` · S3 `e969cf0` · S4 sweep +
deploy, §7 build record; spec was FINAL after adversarial review ×2, 2026-07-16 — §6)
**Scope doc:** `thoughts/shared/research/2026-07-16-codex-0029-p8-density-thoughts.md` (R1–R4
stakeholder-resolved 2026-07-16; provenance = the 5e.tools UX comparison).
**Change class:** render/client-only. No transform, no corpus regen, no Pagefind reindex.
Deploy = `just up` only.

## 1. Goal

Adopt 5e.tools' spacing scheme site-wide (R1 full table register, R4 site-wide) and convert
every category listing into an aligned, sortable, per-category-columned table (R2, R3 traits
out of rows); fix the nav-caret UA chrome and give every dropdown an affordance; pin
exact-name search matches above category groups; add j/k/Enter keyboard browsing + a hint
line.

## 2. Decisions

### D29-77 — density tokens, site-wide (R1 + R4)

One place: `src/styles/globals.css` gains a `--density-*` token block; surfaces consume
tokens, never magic numbers. Targets (desktop):

- **Listing rows:** single line, **~24px pitch** (row box ≈ 23px + 1px hairline; 0 gap).
  Row data type **13px** condensed (`--font-condensed` stack, matching the statblock
  mechanical voice); row NAME stays the serif link voice at **14px** so rows remain
  codex-flavored (5e.tools' rhythm, not its Arial).
- **Detail pane / entity page — named selectors (adversarial M7: "entity-page body font"
  is actually the GLOBAL `body` rule):** `body { font-size: 18px → 16px; line-height: 1.6 →
  1.5 }` (site-wide by intent, R4 — rem-based rules ride along, error/404 pages included);
  `.codex-entity-page` padding clamp → half-scale (≈48px → 24px at desktop); **`.wrap-wide`
  hardcodes the IDENTICAL clamp — tokenize BOTH to one `--density-page-pad` var and move
  them in lockstep** (it also feeds the lead-in gate); `.codex-content p` margins 0.75rem →
  **0.375rem** AND `.codex-content ul/ol` move with it (same 0.75rem today — p-only would
  split the rhythm).
- **Secondary surfaces (same tokens):** search results list, rules tree rows, sources index
  rows, attached-sidebar cards, facet drawer option rows (0.15–0.25rem vertical pad), landing
  tiles UNTOUCHED (marketing surface, not a data surface).
- **Header/masthead:** header vertical padding 20px → **10px** (77px → ~56px — a
  **desktop-only target**; below 1024px the nav already wraps to its own rows and height is
  wrap-dominated, adversarial M8); listing title block + controls row consolidated to one
  line each; total lead-in above the first row must land **≤ 300px at 1600×900** (measured
  440px today, 5e.tools ≈ 250px). S4 also captures a mobile header-height before/after so
  the wrap behavior is verified unharmed.
- Mobile keeps the same tokens; the row grammar change is what saves mobile (see D29-78).

### D29-78 — per-category table columns + sortable headers (R2)

New `src/domain/browse/columnDefs.ts` — the single column-model authority:

```
interface ColumnDef {
  key: string;                       // "level" | "castTime" | "hp" | ...
  label: string;                     // "Lvl", "Cast", "HP", ...
  source: "core" | "facet";          // core = IndexRow field, facet = row.facets[key]
  render: (row: IndexRow) => ReactNode; // glyphs/abbrev/em-dash for missing
  sortable: boolean;
  comparator?: "text" | "numeric" | { rank: readonly string[] };
  compact?: boolean;                 // survives the narrow-container collapse
}
columnsFor(category: string, rows: readonly IndexRow[]): readonly ColumnDef[]
```

- **Comparators (adversarial B3 — two-value `"text"|"numeric"` cannot express the ordinal
  columns):** `numeric` reuses the EXISTING facet machinery (`numericValueFor` /
  `parsePriceToCopper` in `facetDefs.ts` — HP/AC/Price/Bulk are already numeric facets; note
  **bulk is already normalized to `0.1` in `_index.json`, there is NO "L" string** — pin
  corrected). `{ rank }` is an explicit ordinal table, unknown values LAST:
  - size: `tiny < sm < med < lg < huge < grg`
  - rarity: `common < uncommon < rare < unique`
  - actionCost/castTime: `free < reaction < 1 < "1 or 2" < "1 to 3" < 2 < "2 or 3" < 3 <`
    time-strings (by parsed duration: rounds < minutes < hours < days) `< passive` — passive
    (45% of feat rows, NOT in the action-glyph vocabulary) sorts with missing, LAST.
- **Coverage-aware sets (adversarial B-U3 — 64/88 categories have 0% `level` coverage;
  rarity is degenerate cardinality-1 on rules/trait/source/article and absent on sidebar):**
  `columnsFor` takes the listing's rows and DROPS a fallback column whose live coverage
  fails the facetKeys.ts classifier rule (coverage < 40% or cardinality < 2) — reusing
  `categoryHasLevelCoverage` (`filterEngine.ts:354`) for level and the same computed-once
  (useMemo) check for rarity. A dropped column widens Name. No all-em-dash columns, desktop
  or mobile.
- **Two width tiers, container-driven (adversarial B-U1 — the split-view list pane is 416px
  and the CURRENT five-field row already wraps there; also the 640–896px non-split band):**
  each category defines a FULL set and a COMPACT set (`compact: true` columns — Name ·
  Lvl(if covered) · Source · icon). The compact set applies whenever the LIST CONTAINER is
  narrow (< ~600px content width — i.e. split view open, or narrow viewports incl. mobile),
  via container query or measured width — keyed to the container, never the viewport. While
  the preview pane is open the row's job is picking, not stat-scanning; the full set returns
  when the pane closes.

- **Column sets** (from the scope doc's measured shapes):
  - spell: Name · Lvl · Cast · Range · Source — Cast renders `1/2/3/reaction/free` as action
    glyphs (**`@/ui`'s `ActionGlyph`/`normalizeActionCost`**, NOT the `domain/render`
    body-node shim of the same filename), `"1 or 2"/"1 to 3"` as glyph–glyph ranges;
    time-strings AND unenumerated composites (`"2 to 2 rounds"` ×3 exists) as condensed text
    **truncated w/ `title`**; Range gets the SAME truncate-w/-`title` treatment (adversarial
    B-U1: worst real value is 47 chars — `"60 feet; 10-foot radius, 60-foot tall cylinder"`
    — ft-abbreviation alone cannot save the row) plus `feet → ft`; `""`/absent → `—`.
    32.8% of spell rows carry no facets at all — `—`/`—` cells are expected, not a bug.
  - creature & hazard & vehicle: Name · Lvl · Size · HP · AC · Source (size uppercased
    abbr; hazard/vehicle facet gaps render `—`).
  - equipment/weapon/armor/shield: Name · Lvl · Price · Bulk · Source.
  - feat & creature-ability: Name · Lvl · Actions · Type · Source — Type via a literal
    7-value override map (`classfeature` → "Class Feature", `ancestryfeature` → "Ancestry
    Feature", `deityboon` → "Deity Boon", rest capitalized; `humanizeSlug` splits only on
    `-` and would emit "Classfeature").
  - **fallback (every other category):** Name · Lvl · Rarity · Source — subject to the
    coverage-aware drop rule above (64/88 categories have 0% level coverage; rarity is
    cardinality-1 on rules/trait/source/article and ABSENT on sidebar → e.g. sidebar
    renders Name · Source only).
  - Every set ends with the edition icon as a fixed narrow cell (not a labeled column).
- **Missing values:** `—` (em-dash), never blank; sorting puts missing LAST (extends the
  existing M7/M8 rule).
- **Sortable headers replace the Sort `<select>`.** Click cycles asc → desc → (back to
  name-asc default). Name + Lvl sortable everywhere; facet columns sortable per their
  comparator (HP/AC numeric; Price via the EXISTING `parsePriceToCopper`; Bulk numeric —
  already `0.1`-normalized; Cast/Actions/Size/Rarity via `{rank}` tables above; Type text).
  Sort state lives in the URL — extend `?sort=` to
  `name|-name|level|-level|<facetKey>|-<facetKey>`; unknown/inapplicable values fall back
  to `name` silently (forever-decode discipline). **Enumerated codec surface (adversarial
  M6):** decoder (`urlState.ts:127` literal match), encoder (`:325`),
  `emptyFilterState`/`isEmptyFilterState`/`setSort`, AND the round-trip fuzzer
  (`urlState.test.ts:378`) must generate the widened value space. `sortRows` gains the
  comparator arg **additive-optional** — existing 2-arg call sites keep compiling.
  (`searchUrlState.ts` carries no sort; `activeFilterPills` excludes sort by design — both
  verified untouched.)
- **Narrow-container collapse** (replaces the viewport-keyed mobile rule): compact set =
  `compact: true` columns (Name · Lvl-if-covered · Source · icon) whenever the list
  container is < ~600px — the 640–896px non-split band at the narrow end and mobile take
  this path. No horizontal scroll, ever.
- **S1-build amendment (2026-07-17): the list-pane track widens at desktop.** S1 proved the
  pre-P8 `.codex-browse-layout` cap (`minmax(0, 26rem)` = 416px at ANY viewport ≥ 897px)
  would make the FULL set unreachable on desktop — contradicting the stakeholder's chosen
  "full table register" preview outright. S2 rebalances the split grid so the LIST track
  gets ≥ 600px at wide viewports (≈55/45 at 1600px — incidentally 5e.tools' own split),
  making FULL the desktop default with the preview pane open; the compact tier remains for
  genuinely narrow containers. Gate B's "full set at 1600px" reads against this layout.
- **Alphabet jump strip + letter section headers are REMOVED from listings** — and the
  `LetterGroupedList`/`LevelOrderedList` render-path split collapses into ONE flat sorted
  renderer (adversarial N11: don't hide the headers and keep the dead branch). The count
  line stays. **Recorded trade-off (adversarial M9):** quick-filter narrows rather than
  jumps — "scan near letter S with neighbors visible" has no exact replacement; accepted
  for this round, a lightweight jump aid can return later if gate H asks.
- Table semantics: real `<table>`/`<thead>`/`<th scope="col">` or CSS-grid with equivalent
  ARIA — **`aria-sort` lives on the header CELL (`<th>`/`role="columnheader"`), never on
  the inner `<button>`** (undefined there per WAI-ARIA); the button is the plain click
  target. Rows remain anchor-wrapped — note a `<tr>` cannot be wrapped in `<a>`, so the
  table option means row-level click/keyboard delegation to the name-cell anchor, or the
  grid option keeps the current full-row `<a>`; implementer picks, ARIA contract holds
  either way.
- **Row virtualization (adversarial M5):** the letter `<section>` was the ONLY
  `content-visibility` chunking boundary (`globals.css:1071` — `.codex-listing-letter`,
  640px intrinsic size); the flat table replaces it with **per-row `content-visibility:
  auto` + `contain-intrinsic-size: auto <row-height>`** (or fixed-size row chunks if
  per-row proves janky) — prove on feat (8,484 rows) incl. j/k scroll-into-view.

### D29-79 — traits leave the rows (R3)

Row markup drops trait pills entirely. Traits remain: drawer facet (unchanged), entity
page/split pane (unchanged). `TraitPill` keeps its non-row users.

### D29-80 — nav carets

- `.codex-nav-caret` de-chromed: `appearance: none; border: none; background: none;
  font: inherit; color: inherit; cursor: pointer;` (root cause: UA default chrome, measured
  `2px outset black` + gray fill).
- Every dropdown trigger in `HeaderNav.tsx` gains the same `▾` affordance (aria-hidden span,
  same size/voice as Rules'). Rules keeps its split-control semantics (D29-47/M4) — after
  this change it visually matches the others, its behavior stays two-tab-stop.

### D29-81 — exact-name search boost

At the `pagefindClient.ts` shaping seam (shared by Omnibar + SearchPage + HeroSearch):
after fragments load, partition hits into **name-match** (case/diacritic-insensitive:
exact `name === query`, then `name.startsWith(query)`) and the rest; render the name-match
partition as a pinned **"Name matches"** group ABOVE category groups (omnibar) / at the top
of results (SearchPage), exact before prefix, ties by level-then-name. Match against the
displayed name (`meta.title`/`SearchDisplayResult.name`).

**Hydration window (adversarial B1 — the blocker that would have made this a no-op):**
`Omnibar.tsx:47` hydrates only the FIRST 8 stubs (`MAX_RESULTS`) — an exact-name hit that
Pagefind ranks #10 (the measured `fireball` case, the very case this fix exists for) is
never fetched, so a post-hydration partition cannot see it. The boost therefore widens the
hydration window: hydrate `min(res.results.length, 40)` stubs (fragments are small; stub
`.data()` is the only way to learn the name — stubs carry no metadata), partition over that
window, then DISPLAY at most the previous counts (8 omnibar / 20 per SearchPage page).
SearchPage's `PAGE_SIZE = 20` gets the same widened scan ahead of page 1. **S3-build pin amendment
(2026-07-17): the window is 60, not 40** — the real transform showed `heal` (this
decision's own second acceptance query) at Pagefind position **43**; 40 was sized off the
fireball/rank-10 measurement alone (`NAME_BOOST_HYDRATE_WINDOW`, mechanism unchanged —
the "ship the mechanism, amend the pins" convention). Cap the pinned
group at 8; pinned hits are NOT repeated in the groups below (dedupe by fragment id/url).

Acceptance queries: `fireball` → spell Fireball #1 (currently rank 10 — proves the window);
`heal` → spell Heal #1 (kills the documented P3 limitation); `wand of smoldering
fireballs` → that wand #1; a non-name query ("gambling lore satinder") unchanged.

### D29-82 — split-view keyboard nav + hint

- On split-view listings (desktop): **`j`/`k` move REAL DOM focus to the next/prev row's
  anchor** (adversarial B-U4: focus ring == selection, `Tab` resumes from the row, screen
  readers announce the anchor natively — no parallel aria-activedescendant machinery), with
  native scroll-into-view. `Enter` is then native link activation on the focused anchor →
  the full entity page; no separate Enter handler.
- **Preview follows focus, debounced + replace (adversarial B2/B-U2):** the focused row
  commits `?entry=` after a **180ms settle** (mirror `Omnibar.tsx`'s existing debounce)
  using **`replace: true` navigation** — never the click path's deliberate non-replace push
  (`$category/index.tsx:88` — holding `j` across 15 rows must NOT create 15 history
  entries). Click keeps its existing push semantics unchanged. Add a **client-side entity
  memo keyed by slug** (parallel to `memoizedListing` in `listingClient.ts` — no entity
  cache exists today; creature pages average 43.5 KB/max 361 KB, unthrottled scanning would
  re-fetch each per keypress; the memo also makes revisits free).
- **Guard:** keys are inert when `document.activeElement` is an input/select/textarea OR
  sits inside an open `<dialog>` (`closest('dialog')` — focus lands on inner controls, not
  the dialog element; adversarial M11: no shared guard utility exists, this is new code),
  and on narrow containers (no preview pane). Must not collide with the Omnibar's global
  Ctrl+K listener (`Omnibar.tsx:171`).
- Hint line, small condensed voice, right of the count line: `Ctrl+K search · j/k browse ·
  enter open` — desktop only, one line, plain text (AT-readable as ordinary content), no
  dismiss state.

## 3. Slices

- **S1 — columns + sort + BrowseListing table (the big slice).** `columnDefs.ts` (+ unit
  tests incl. every-category-has-columns totality + fallback), `filterEngine.ts` SortMode
  widening + comparator sort (missing-last tests), BrowseListing row grammar → table register
  w/ sortable headers, strip/section-header removal + single flat renderer, `?sort=` URL
  codec extension w/ forever-decode (+ fuzzer widening), per-row content-visibility,
  narrow-container FULL/COMPACT collapse. Rows-per-screen proof on /spell and /feat (≥ 24
  rows at 1600×900) + the 416px worst-case width proof.
- **S2 — site-wide density + secondary surfaces + carets.** D29-77 token block; entity
  page/split pane, search results, rules tree, sources, drawer, header lead-in; D29-80 both
  caret changes; goldens re-verified (expected ZERO delta — CSS-only for entity pages; if
  EntityPage markup moves, regen + flag).
- **S3 — search boost + keyboard + hint.** D29-81 at pagefindClient seam w/ tests (fireball/
  heal/exact-wand + dedupe); D29-82 keys + hint + input-focus guard + Escape ordering vs
  omnibar singleton.
- **S4 — sweep + deploy.** Full codex suite, both CI lanes, hydration-zero pass on the
  reworked routes, weights capture (row DOM shrinks — expect flat-or-smaller), lead-in ≤
  300px measured, telemetry spot-check, README render section, `just up` + edge verify
  (three-prong real-corpus + spot URLs + a sorted-column URL), spec build record, RESUME +
  memory updates. Screenshot set to the stakeholder (density is his call to eyeball early).

## 4. Acceptance gates

- **A.** Every category listing renders its columnDefs set; totality test (88 categories →
  columns, fallback included); missing facet values render `—`; the coverage-drop rule
  proven on sidebar (Name·Source only) and rules (no Lvl, no Rarity).
- **B.** /spell at 1600×900 shows **≥ 24 rows**; lead-in ≤ 300px (desktop); zero horizontal
  scroll at 390px. **Width-tier proof: the spell FULL set renders single-line at the real
  416px split-pane width with the measured worst-case Range value** — if it can't, the
  compact set is what renders there (that's the spec'd behavior, assert it), and the full
  set must survive 1600px full-width with worst-case values un-wrapped.
- **C.** Sorting: every sortable header cycles asc/desc, missing-last holds (passive sorts
  last on feat Actions), rank tables verified (uncommon < rare; med < lg), `?sort=` URLs
  round-trip + SSR to the same order (loaderDeps proven), unknown `?sort=` falls back
  silently, fuzzer covers the widened space.
- **D.** Search: `fireball` (rank-10 today — proves the hydration window) and `heal`
  name-pinned #1 in omnibar AND /search; pinned hits not duplicated below; "gambling lore
  satinder" unchanged.
- **E.** Keyboard: j/k move real focus (focus-visible ring on the row anchor — asserted),
  Enter = native activation, `?entry=` commits replace-only after settle (history length
  unchanged after a 10-row j-scan — asserted), entity memo hit on revisit, guard covers
  inputs + open dialog + Omnibar Ctrl+K coexistence; hint desktop-only.
- **F.** Nav: caret chrome-free (computed border none) on all eight dropdown triggers; Rules
  split semantics intact (two tab stops).
- **G.** Both CI lanes green; goldens byte-stable (or regen'd + flagged if EntityPage markup
  changed); zero hydration errors across the spot-set; weights recorded; feat (8,484 rows)
  scroll + j/k under per-row content-visibility proven jank-free.
- **H.** Stakeholder eyeball of the new register (folds into the running gate H) — S1/S2
  send screenshots early, not at gate.

## 5. Non-goals / risks

- No transform/emit/index changes; no drawer/facet-logic changes; no mobile nav rework.
- Backrefs explicitly deferred (own scope).
- Risk: two visual registers (sourcebook pane vs data-table list) on one page — mitigated by
  keeping name-serif + parchment tokens in rows; stakeholder sees S1/S2 screenshots early.
- Risk: `?sort=` × `?entry=` × facet params interaction — S1 must thread sort through
  `filterStateToSearch` (the P4.5 entry-resync bug class).
- Risk: j/k scroll-into-view vs `content-visibility` row estimation — verify on feat (8,484
  rows).

## 6. Adversarial review record (2026-07-16, two independent lenses)

**Mechanics lens — folded:** B1 omnibar 8-stub hydration window (D29-81 rewritten around a
40-stub scan); B2 j/k history/fetch spam (D29-82: replace + 180ms settle + entity memo); B3
comparator expressiveness (`{rank}` ordinal tables; passive-last; numeric reuses
`numericValueFor`/`parsePriceToCopper`); M4 bulk-"L" pin corrected (already `0.1` in
`_index.json`); M5 per-row content-visibility replaces the deleted letter-section boundary;
M6 `?sort=` codec surface enumerated + `sortRows` additive-optional; M11 focus guard is new
code incl. `closest('dialog')`. Verified-no-issue: goldens decoupled from listings;
searchUrlState/activeFilterPills carry no sort; no test pins the Sort select or jump strip.

**UX/edges lens — folded:** U1 416px split-pane can't fit the full spell set (container-
driven FULL/COMPACT tiers; Range truncate+title; the 640–896px band covered); U3
coverage-aware fallback/mobile columns (64/88 categories are 0% level; sidebar has NO
rarity); U4 j/k a11y = real-focus pattern chosen (option a); M5 `aria-sort` on the `<th>`,
never the button; M6 itemCategory 7-value override map; M7 density selectors named
(`body` global, `.wrap-wide` == `.codex-entity-page` clamp → one token, ul/ol lockstep);
M8 header target desktop-only + mobile check added; M9 alphabet-strip loss recorded as a
deliberate trade-off; N10 `@/ui` ActionGlyph disambiguated; N11 single flat renderer.

## 7. Build record

- **S1 `0693d61` (2026-07-17):** columnDefs.tsx (+totality/rank/coverage tests), SortMode +
  `?sort=` widening (fuzzer widened), BrowseListing flat table register, per-row
  content-visibility, ResizeObserver FULL/COMPACT tiers, listing density tokens. Live-proven
  25 rows/900px @ 23.94px pitch; two real bugs caught pre-ship (inherited line-height 1.6
  ballooned pitch to ~32px; `?sort=level` decoded to nothing). Deviations: Source/Range not
  sortable (spec-literal); the FULL-set-unreachable-at-desktop finding → the D29-78
  S1-build amendment (list track widens).
- **S2 `fa0b42d`:** site-wide density on the spec's named selectors (body 16px/1.5,
  `--density-page-pad` shared token, p/ul/ol lockstep, header 54.6px desktop, lead-in
  228px), browse grid 58/42 (55/45 fell 15px short of the 600px floor), `/search` scoped
  override (its own mobile collapse — a real specificity bug found+fixed live), caret
  de-chrome + 7 dropdown carets (Sources is bare by design — "eight" in gate F was wrong).
  Goldens byte-stable.
- **S3 `e969cf0`:** partitionNameMatches at the pagefindClient seam — **hydration window 60,
  pin amended from 40 ("heal" ranks 43 raw)**; pinned Name-matches group both surfaces,
  loadMore cursor pinnedCount-aware; j/k real-DOM-focus + 180ms-settled replace-only
  `?entry=` (zero history growth), memoizedEntity (50-entry) on both loaders,
  keyboard-Enter falls through to native navigation (`detail === 0`), guards, hint line.
  1,649 tests.
- **S4 (sweep + deploy, 2026-07-17):** README P8 section + P3-section pointer; `just up`
  only (render-only round). **Edge verification, both hostnames:** three-prong real-corpus
  (ritual "145 of 145 shown" — NB React `<!-- -->` text-node breaks separate the numbers in
  raw HTML, grep the segments; zero fixture warns; noindex both); SSR sort proof
  (`?sort=-level` → Apex Companion/Avatar first, `?sort=banana` → name fallback);
  hydration-ZERO page errors across 8 reworked routes; live search boost (omnibar
  `fireball` → Fireball #1; `/search` `heal` → Heal #1; satinder unchanged); j/k 10-row scan
  → history delta 0, focus on row anchor, `?entry=` replace-committed; carets 7/7 computed
  border-none; mobile zero h-scroll; 30 rows in the first viewport. Stakeholder screenshot
  set delivered (gate H continues on the live site). **Weights (gate G, recorded):** `/` 12.6
  KB/3.0 gz · `/spell` 2.75 MB/204 KB gz · `/creature` 7.59 MB/736 KB gz · `/spell/heal`
  37.8 KB/8.7 gz · `/rules` 417 KB/83 gz · **`/feat` 8.04 MB/630 KB gz — NOT flat: +35% gz
  vs P3's 4.49 MB/465 KB**, the per-row Cast-glyph inline SVGs are the growth; flagged, a
  `<symbol>`/`<use>` dedupe is the ready follow-up if gate H feels it.
