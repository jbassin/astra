# codex 0029 P13 — filter panel redesign (pane-swap) — scoping thoughts

**Date:** 2026-07-19 · **Status:** SCOPED — decisions R1–R6 all stakeholder-RESOLVED same day
**Provenance:** tester feedback relayed by the stakeholder: "the aesthetics and ux of the filter
panel are very poor." Staff review same day: live inspection of `codex.iridi.cc/feat` (desktop
1440×900 + mobile 390×844, filters open/closed/active states, DOM probes of the drawer's scroll
regions) + a full implementation map agent verified against the real repo
(`apps/codex/src/domain/browse/*`, `src/styles/globals.css`) + orchestrator corpus spot-checks
(`apps/codex/data/corpus`).

---

## 1. The diagnosis (what testers are hitting)

Screenshots captured 2026-07-19 (desktop drawer top/bottom + mobile) — delivered to the
stakeholder in-session. Six findings, ordered by severity:

1. **The container hides the thing being filtered.** The panel is a centered
   `width: min(28rem, 92vw)` modal `<dialog>` (`.codex-filter-drawer`, `globals.css:1133-1155`;
   opened from the "Filters" button, `BrowseListing.tsx:766-768`). While open it occludes the
   table AND the "N of M shown" count row — zero feedback while filtering; you toggle blind,
   press DONE, then see what happened. On desktop it reads as a stranded mobile sheet.
2. **Triple-nested scrolling.** The drawer body scrolls (measured 1730 px of content in a 765 px
   window on /feat); *inside it* the traits list (1637 px in 224 px) and source list (2837 px in
   224 px) each independently scroll at `max-height: 14rem` (`.codex-facet-options` /
   `.codex-trait-chips`, `globals.css:1187-1200,1261-1294`). The only exit is a DONE button at
   the bottom of the outer scroll; no ✕, no Clear-all inside the panel, no per-section clear.
3. **Raw data leaks into the UI.**
   - **Source** = 114 raw abbreviation checkboxes on /feat ("AP147", "AP148", …), label-sorted —
     meaningless without Paizo catalog knowledge, and unrelated to the product-line grouping
     `/sources` already renders.
   - **Category/type facet values** render as CSS-capitalized raw tokens: "Ancestryfeature",
     "Classfeature" (count 3), "Deityboon" (count 1) — degenerate values surfacing as choices.
     `displayCategoryName` exists (`src/domain/render/displayCategoryName.ts`, used at 8+ sites)
     but the facet panel isn't one of them (these are facet *values* not categories, but the
     same humanization treatment is missing).
   - **Edition** options are labeled by `<EditionIcon>` ALONE — no visible text
     (`editionOptionLabel`, `FacetPanel.tsx:241-243`); on mobile the checkboxes read as bare
     "◯" / "✦" glyphs.
   - "*— without data: 213*" (`EnumOptionList`, `FacetPanel.tsx:99-131`) is developer-speak.
4. **Visual identity mismatch.** Native unstyled checkboxes; trait chips styled as dark boxes
   that read as a foreign design system against the parchment tokens; the blue explainer callout
   (`.codex-facet-superseded-explainer` → `.codex-callout-blue`) as the loudest element in the
   panel; three different option-sort conventions (source label-sort, rarity rank-sort,
   everything else raw-alphabetical — `filterEngine.ts:558-624`, flagged in its own comments).
5. **Duplicated/forked controls.** Superseded is reachable twice with different wording
   ("Show 2,313 hidden (superseded) →" toolbar reveal, `BrowseListing.tsx:916-946`, vs
   "Include Superseded Content" drawer checkbox, `FacetPanel.tsx:403-428`). Separately,
   `/search` maintains a **hand-copied duplicate** of the entire panel markup
   (`SearchPage.tsx:295-486`, its own comments admit the fork at 22-23,463-466) — a
   FacetPanel-only redesign silently forks the site's filter UX.
6. **Type-ahead coverage is arbitrary.** Only Source and Traits have option-list search
   (P11 S2, `FacetPanel.tsx:70-97`); derived facets never do regardless of length —
   `creature.family` has **467 options** (corpus-verified) with no search at all.

**What is NOT broken (preserve, don't rebuild):** the filter engine. Ambient per-dimension
option counts that narrow live (`ambientRows`, `filterEngine.ts:336-342`), missing-key
semantics + bounds-imply-has-value (D29-61), tri-state traits, the human-readable URL codec w/
forever-decode aliases (`urlState.ts`), active-filter pills + Clear all in the toolbar
(`activeFilterPills.ts`), filter-locally-over-full-rows. This is a presentation-layer failure
over a sound engine — the redesign must not touch `filterEngine.ts` semantics or the codec.

## 2. Architecture facts (agent-verified, file:line)

- `FacetPanel.tsx` is pure-presentational, driven by `BrowseFilterState`
  (`filterEngine.ts:74-91`); the route file (`routes/$category/index.tsx`) is the only
  reader/writer of URL params. Fixed section order Level → Rarity → Traits → Source → Edition →
  Superseded → derived (`FacetPanel.tsx:434-500`).
- The drawer is a container-swap only: `BrowseListing.tsx:886-901` wraps an unmodified
  `<aside class="codex-facet-panel">`; a leftover `position: sticky` from the pre-drawer inline
  era is overridden back to `static` by a more specific rule (`globals.css:1164-1174`) — dead
  weight that hints the panel was once inline and can be again.
- Browse layout: `.codex-browse-layout` = `minmax(0,58fr) minmax(0,42fr)` grid
  (`globals.css:1053-1066`), preview pane `.codex-entry-pane` sticky+scrollable; `/search`
  overrides the ratio with a more-specific rule. `.wrap-browse` caps at 96rem.
- Facets per category: 5 core (coverage-gated) + 0 derived for 73/88 categories; up to 8 for
  creature (`facetKeys.ts:143-170`). Widgets are only `enum` | `range`; traits' tri-state is
  hardcoded outside `facetDefs`.
- Every facet write must resync `entry` via `withEntryPreserved` (`urlState.ts:382-389`) or the
  split-view selection silently deselects.
- SSR ships ≤60 rows (`computeWindowedListing`); the client refetches the full array
  post-hydration keyed on the explicit `windowed` flag (P11's fix — never `rows < totalCount`).
  Option counts derive from loaded rows → during the ~100–300 ms cold-load window counts are
  computed over the 60-row window. Today that's invisible (panel is behind a click); a
  live-updating pane makes it visible → the panel must gate count display (or the whole pane)
  on the full-array settle.
- **Tests/pins a redesign will hit** (update deliberately, not incidentally):
  `FacetPanel.test.tsx` (placeholder strings "Filter source"/"Filter traits", rarity order,
  no-has-value-checkbox assertions); `BrowseListing.test.tsx` (pills, drawer-contains-panel,
  no-sort-select, j/k dialog guards, 600 px narrow collapse); `ssrSmoke.test.ts:229-245`
  (literal `"codex-facet-panel"` + `codex-facet-option-label">ancestry<` substring matches —
  rebuild dist before trusting it, the P12 stale-dist find); `activeFilterPills.test.ts`;
  `scripts/rowHeightDriftGuard.ts` (24.00 px row pitch — untouched by this round, must stay
  green).

## 3. Data facts (corpus-verified 2026-07-19, real `_index.json` reads — NOT proxies)

- `/feat`: 8,484 rows · **380 distinct traits** · **114 distinct source books**.
- `/creature`: 7,296 rows · **`facets.family` = 467 distinct values** (largest un-searchable
  option list).
- `sources-index.json`: **496 books**, entries carry `{book, productLine, edition, license,
  entityCount, categoryCounts, sourceEntityRef}`. `productLine` populated for 243:
  Adventure Paths 106 · Society 30 · Rulebooks 28 · Lost Omens 26 · Blog Posts 25 ·
  Adventures 20 · Comics 6 · April Fools 2 · **null 253** (the expected "Other" bucket, P4).
  → the grouping data EXISTS server-side; `sources-index.json` is **server-only** (the P6 R10
  lesson — its spec'd client wiring had no data path) so the panel needs a small client-safe
  emit: `{abbrev → productLine}` (or book→line joined at build). `abbreviateBook()`
  (`src/domain/sources/abbreviations.ts`) is already the client-safe precedent to mirror.
- Global trait fold is 644 (P2); per-category trait lists are smaller (380 on feat) but still
  far past scannable.

## 4. Decisions

- **R1 — container: pane-swap. RESOLVED (stakeholder, 2026-07-19).** On desktop, opening
  Filters swaps the 42% preview pane (`.codex-entry-pane`) to the filter panel — the table stays
  fully visible and re-filters live; a sticky pane header carries the live "N of M shown" count
  + Clear all + close ✕; closing restores the preview. The `<dialog>` remains **mobile-only**,
  restyled as a proper bottom sheet w/ sticky Done. Rationale over alternatives (filter-bar
  popovers; restyled modal): zero occlusion, no third-column squeeze of the 58/42 grid,
  generous height kills the nested scrolling, and the preview pane is idle while filtering
  anyway.
- **R2 — option-list search on every long facet, default-hidden. RESOLVED (stakeholder,
  2026-07-19: "for filters with many options like traits, adding a searchbar (perhaps default
  hidden?)").** Generalize the P11 type-ahead from its two hardcoded sites (Source/Traits) to
  ANY option list above a threshold (~20 options — spec pins the number), including derived
  facets (`creature.family` 467). Default-hidden presentation: a small search affordance in the
  section header expands to the input (stakeholder's "perhaps" = spec latitude on the exact
  reveal; auto-showing the input on very large lists (≥100) is sanctioned latitude).
- **R3 — degenerate facet values: keep ALL, humanized. RESOLVED (stakeholder, 2026-07-19).**
  Every value stays visible ("Ancestryfeature" 1 / "Classfeature" 3 / "Deityboon" 1 on /feat's
  type facet included) — no fold, no hide, zero information loss; the fix is label humanization
  only ("Ancestry Feature", "Deity Boon"). Needs a facet-value display formatter (title-case +
  compound-word split; the `displayCategoryName` humanization precedent, applied to facet
  values).
- **R4 — source grouping: product-line groups. RESOLVED (stakeholder, 2026-07-19).** Collapsed
  groups ordered Rulebooks → Lost Omens → Adventure Paths → Society → Adventures → Blog Posts →
  Comics → April Fools → Other, per-group counts, full book names + abbreviation suffix,
  type-ahead matches name AND code and auto-expands matching groups. Mirrors `/sources` and the
  P11 /rules core-first precedent.
- **R5 — no toolbar promotion; ALL filtering in the pane. RESOLVED (stakeholder, 2026-07-19).**
  The count row keeps only name quick-filter + superseded reveal + Filters button (P11's
  compaction stands).
- **R6 — `/search` unification: IN SCOPE this round. RESOLVED (stakeholder, 2026-07-19).**
  `SearchPage.tsx` consumes the shared `FacetPanel` — component-level only; its inline 26rem
  left-rail layout stays (no pane-swap on /search, there is no preview pane to swap).

## 5. Content redesign (applies inside whatever container — the spec's checklist)

- **Source:** R4's grouping + type-ahead matching full name AND abbreviation code.
- **Rarity / Edition / Action cost / small enums:** compact parchment-styled toggle-chip rows
  (segmented) replacing checkbox columns; Edition always icon **+ text label** ("Remaster" /
  "Legacy"); rarity keeps rank order; option sort unified into one convention with declared
  exceptions (rank-ordered sets), replacing the three ad-hoc conventions.
- **Traits:** keep tri-state + type-ahead; **selected chips pin first**; restyle chips to the
  token palette (gold-rule neutral / maroon include / struck amber exclude); replace the inner
  scrollbox with a bounded initial render + "show all N" expansion; add a one-line tri-state
  gesture hint (currently undiscoverable).
- **Level / ranges:** styled stepper inputs (dual-thumb slider = optional polish, not required);
  bounds-imply-has-value semantics untouched.
- **"— without data: N"** → "Unspecified (N)" phrasing (still informational, not selectable —
  semantics unchanged).
- **Superseded:** ONE control. The toolbar reveal keeps ownership (it owns the
  `resetScroll:false` functional-merge mechanics); the pane renders the same state as a plain
  toggle; the blue explainer callout becomes the established popover-hint pattern.
- **Panel chrome:** sticky live count + Clear all + ✕; per-section clear when active; one scroll
  region (no nested `max-height:14rem` boxes); section title shows active-value count badge.
- **Pills row:** restyle to match; add truncation for many-value pills
  (`activeFilterPills.ts:50-56` plain-joins today).

## 6. Proposed slice plan (for the spec)

1. **S1 — container swap + chrome:** pane-swap state machine in `BrowseListing.tsx`
   (filters-open ↔ entry-preview interplay: row-click while filtering closes the pane back to
   preview — spec pins the exact behavior), sticky pane header w/ live count gated on the
   `windowed` settle, mobile bottom-sheet restyle, kill the dead sticky CSS, superseded
   consolidation.
2. **S2 — facet content:** generalized default-hidden type-ahead (R2), toggle-chip enums +
   edition text labels, trait chip restyle + selected-first + show-all expansion, unified option
   sort, humanized labels + "Unspecified", the R3 facet-value formatter, styled range inputs.
3. **S3 — source grouping (R4) + `/search` unification (R6):** the client-safe
   `abbrev → productLine` emit (mirror `abbreviateBook`'s module shape; determinism ×3), grouped
   source section, SearchPage fold-onto-FacetPanel (R6 in-scope).
4. **S4 — sweep + deploy:** test-pin updates (§2 list), ssrSmoke against a REBUILT dist, both
   lanes green, weights (panel adds no route weight — verify), `just up` render-only deploy
   (no corpus/index change expected → NO reindex; assert search rows byte-stable like P12),
   SigNoz check, stakeholder screenshot set.

Adversarial review ×2 before build (standing practice). **Every count pinned in the spec must be
regenerated from the real corpus at spec time** — the proxy-pin class has struck in P6/P8/P10/P12;
§3's numbers are real-index reads dated 2026-07-19 but the corpus moves.

## 7. Known risks / spec attention points

- **The pane-swap ↔ `entry` interplay** is the one real state-machine risk: `entry` lives
  outside `BrowseFilterState`, every filter write goes through `withEntryPreserved`, and the
  pane now has two occupants. Pin: does opening Filters with an entry selected drop the
  selection (no — preserve it, swap back on close), and does j/k or row-click while filtering
  swap panes? Spec must enumerate; the P4.5 loader blockers (loaderDeps, memoized listing,
  entry resync) all live in this file.
- **Cold-load count window:** live counts in a visible pane surface the 60-row SSR window
  (§2) — gate on settle; the ~300 ms register item from P9 becomes user-visible otherwise.
- **ssrSmoke string pins + stale dist** (P12 find): rebuild before trusting.
- **`/search` unification (R6):** component-level only — watch `SearchPage`'s own state shape
  vs `BrowseFilterState` (the fork exists partly because /search filters Pagefind results, not
  IndexRow[]); the spec must pin the adapter seam rather than assume drop-in.
- **jsdom lacks `showModal`** (P4.5) — the mobile sheet keeps the existing test polyfill.
- **Narrow-desktop tier:** `.codex-browse-layout` collapses to one column under 56rem — there
  the pane-swap degenerates to the sheet/dialog anyway; pin the breakpoint behavior.
- **No new dependencies:** chips/segmented controls/sliders are hand-rolled on existing tokens
  (site convention since P4.5 dropped gothic); a dual-thumb slider dependency is NOT sanctioned.
- **Drift guard + row pitch untouched** — this round must not touch `.codex-listing-*` metrics.

## 8. Next

`octo:spec` → `thoughts/astra/specs/0029-codex-p13-filter-redesign-spec.md` on the back of this
doc (all decisions resolved). Gate H (the consolidated P2–P12 review) remains open and separate;
P13 will fold its own register into it.
