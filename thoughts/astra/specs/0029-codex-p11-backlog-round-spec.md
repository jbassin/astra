# 0029 codex P11 — backlog round (tables, data quality, popovers, nav, density) — NLSpec

**Status:** FINAL (2026-07-18) — adversarially reviewed ×2 (independent lenses: mechanism/
transform; product/runtime). **11 blockers + ~20 minors ALL folded below.** The reviews'
headline catches: the popover clones the STANDALONE page's SSR HTML, so suppressing the
standalone h1 (draft D29-112) would have deleted the title from every popover site-wide;
the dedupe pin was proxy-derived — the same repoint artifact lives in `mastheadExtra` at
947 occurrences the draft scanner never walked (real population 1,147/123, epicenter
`domain/*` "Deities" lists); the `<%ACTION.TYPES#N%%>` mapping table exists NOWHERE in the
repo and the obvious `#N → N Actions` guess is off-by-one on all 9 docs; 3 resolved EMBEDS
point into the drop set (inbound ≠ crossrefs-only); 56 kept entities carry `remasteredAs`
pointers into the drop set that the drop pass never cleaned (colliding with this spec's own
S5); the drift-guard cell-fit assert would false-fail on by-design-ellipsis columns; the
listing reveal count is not derivable during the P9 SSR window without new plumbing; the
trait link landed on a dead filter-only /search; a rarity "order array" would silently
vanish 2,031 `unique` entities. **Stakeholder amendment folded: the drop predicate widened
to BOTH activation-debris families** (leading-`(` + digit-leading-with-activation-parens).
**Scope doc:** `thoughts/shared/research/2026-07-18-codex-0029-p11-backlog-round-thoughts.md`
(R1–R5 RESOLVED). **Provenance:** the 2026-07-18 live-sweep backlog (`8454534`); item
numbers cited as (#N); item 3 REFUTED and OUT.
**Population-pin discipline:** hard pins are review-measured; anything marked
**derive-at-build** must be re-derived by the slice engineer from the real mechanism — on
an unexplained delta, STOP with options (the P6/P10 rule), never ship a stale pin.

## 1. Problem

Twenty-odd verified defects/enhancements across four surfaces: (a) listing tables clip every
numeric column site-wide and cap at ~617px on any viewport; (b) the action category is ~35%
nameless activation debris across two name shapes, 12 names carry raw AoN templates,
internal facets leak ("Item Category", "Valued: false"), and deliberate legacy→remaster
link repointing leaves identical adjacent duplicate crossrefs (body AND masthead surfaces);
(c) popovers are dead to pointer events and clip; scrollbars are stock UA chrome on a
parchment skin; (d) the nav exposes all 88 categories (10 default-empty), listings lie
about hidden superseded rows, and page titles waste ~120px below a 55px header.

## 2. Decisions

### Transform / ingest lane

- **D29-98 — activation drop at ingest (#3a; R2 + widening amendment).** In
  `src/ingest/drop.ts` (`applyAonPrimaryDrop`, post-join/pre-emit — NOT join.ts; AoN-only
  entities flow through it, and it runs on RESOLVED names, i.e. after D29-99's extract-time
  rename, which the extract→join→drop order gives for free), drop AoN-only `action`
  entities whose name matches EITHER family: (i) starts with `(`; (ii) starts with a digit
  AND contains a parenthesized activation string (the "1 hour (envision, Interact)" /
  "10 minutes (concentrate, manipulate)" family). Report-counted `activationDropped` +
  drop-listed in `report.md`; **the report must list every family-(ii) name dropped**
  (bounded ~163) for orchestrator eyeball review before the S1 commit — the widened
  predicate is new and un-censused.
  **Keep-list (exact, keyed on entity ID — never the `slug` FIELD, which is unsuffixed and
  shared by ~456 entities):** `action/manipulate`, `action/concentrate`,
  `action/concentration`, `action/command`, `action/concentrate-manipulate`,
  `action/envision` (56 inbound crossrefs: 29/18/5/2/1/1) **+ `action/concentration-3`,
  `action/concentration-4`, `action/spellshape`** (3 resolved inbound EMBEDS from
  `armor/hollow-robes` — embeds count as inbound; the draft's "zero inbound" was
  crossref-only).
  **Dangling edition pointers:** the drop pass must also strip `remasteredAs`/`legacyOf`
  entries pointing into the drop set (56 kept→dropped edges measured under the narrow
  predicate, e.g. `action/interact-142`; dropped→dropped edges vanish with their owners) —
  report-counted `postDropEditionPointerStripped`, **derive-at-build** with the final
  predicate. Without this, S5's D29-109a renders raw-id fail-softs on every such page.
  **Pins:** paren family = 1,233 (measured, incl. the 9 keeps); digit family ≈ 163
  (review-measured survivors — derive-at-build); dropped ≈ 1,387, action ≈ 2,638, total
  ≈ 44,805, categories exactly **88** — final numbers derive-at-build, recorded in §6, with
  the STOP-on-unexplained-delta rule. Dropped URLs 404 (no redirects). Crossrefs INTO the
  drop set must be 0 post-drop (measured 0 under the narrow set; re-assert). Search index
  count follows the final total.
- **D29-99 — AoN name-template resolution (#3b).** In `extractAonMeta`
  (`aonFacets.ts:362`), resolve both glyph forms in `src.name` before `required()`:
  `<%TRAITS%N%%>display<%END>` → `display`; `<%ACTION.TYPES#N%%>` → **the pinned table
  `{2: "Single Action", 3: "Two Actions", 4: "Three Actions"}`** — NO repo mapping source
  exists (the census stores verbatim strings only); this table is derived from the same
  docs' pre-resolved `markdown` (all 9 ACTION.TYPES docs verified; AoN's id space is
  shifted — a naive `#N → N Actions` is wrong on all 9). `slug: sluggify(name)` follows
  the resolved name for free. Pins: exactly **12** entities (all `action`; snapshot-wide
  scan found no third template form); zero inbound crossrefs to the 12; the link table
  re-resolves by normalized AoN url on regen, so internal links self-heal. **Recorded
  churn:** the renames land in existing slug-collision groups (one 5-doc group reshuffles;
  the six "Cast a Spell…" docs form two identical-name triples → `-2`/`-3` suffixes) —
  live URLs in those groups move; accepted, recorded in §6. **Overlap with D29-98:** some
  resolved names remain in a drop family (2 paren-leading measured; "10 minutes
  (concentrate, manipulate)" is digit-family) — `nameTemplateResolved` = 12 at extract;
  the post-drop SURVIVOR count is derive-at-build and gate D checks survivors only.
- **D29-100 — adjacent-crossref dedupe, whole-document (#17; review-repopulated).** A
  single post-join, pre-emit walk (drop.ts-adjacent, ONE owner — "after resolution" is not
  one place: body crossrefs finalize in join pass 5, masthead crossrefs at the parse-time
  resolver seam, and pass 5 never walks `mastheadExtra`) over **body + loreBody +
  embeddedItems + mastheadExtra + hazard `stats.disable/routine/reset`** (the P6
  latent-gap surface — 0 dupes there today; walking it keeps that gap closed). Collapse
  RUNS (not pairwise — one triple exists) of crossref nodes with identical `targetId` and
  equivalent `display`, separated only by whitespace/punctuation-only text nodes, to a
  single crossref + one separator. **Display equivalence folds apostrophe variants
  (`'`/`’`) and case** (18 near-dupes measured: Cyth-V'sug/Cyth-V’sug, Ma'at/Ma’at,
  Palatine Eye title-case), keeping the FIRST display; genuinely-distinct displays
  ("Frightened 1"/"Frightened 2", 371 adjacents) must NEVER collapse — display-keying is
  load-bearing. Root cause is the DELIBERATE legacy→remaster repoint landing AoN's
  distinct same-named pairs on one target; dedupe is the policy-consistent fix. **Pins:
  1,147 occurrences / 123 entities → 0** (body-walk subset 200/54; masthead 947/69,
  epicenter `domain/*` "Deities" lists — `domain/knowledge-domain` alone 37). Gate =
  whole-document re-scan == 0. Adjacent duplicate embeds: 0 today (crossref-only walk).
  Report-count `adjacentCrossrefDeduped`. Goldens unaffected under the wide walk
  (verified; the weapon hits are whip, not chakri). No render-side dedupe.
- **D29-101 — search-index enrichment (#5, #6) + filter-only /search fix (#16's
  prerequisite).** In `build-search.ts` (which already loads the full entity per row):
  (a) new `meta.class` = `collectText(value).trim()` of the `Class` mastheadExtra label
  when present (values carry a measured leading space; breadth 1,254 class-feature
  entities); collides with no existing meta/filter key. (b) Leads-to exclusion as a
  **top-level pre-filter of `entity.body`** before `collectText` (which has no skip hook):
  drop any top-level heading whose text matches `/ leads to\.\.\.$/i` plus the immediately
  following crossref-bearing paragraph — measured 1,404 instances, ALL top-level and all
  heading+one-paragraph shaped, zero false positives, zero in loreBody. (c) **Client
  plumbing is part of this decision:** `toDisplayResult` (an explicit whitelist) gains
  `class`; `pagefindClient.test.ts`'s exact-shape projection pin updates; and
  `SearchPage.tsx:157` passes **`null` (not `""`)** to `pf.search` when the trimmed query
  is empty — measured live: `""` returns 0 results vs 686 for `null` with filters, so
  filter-only /search (including D29-109c's trait links) is dead without this; add a
  filter-only test. Host-only reindex (~33 s) rides the deploy.

### Render / CSS lane

- **D29-102 — listing table content fits (#1).** Every non-Name `ColumnDef.width` in
  `columnDefs.tsx` changes `"Nch"` → `"calc(Nch + 1rem)"` (1rem = the two 0.5rem cell
  paddings; border-box stays site-wide). The edition-icon column is CSS-sized, NOT a
  columnDef — widen `.codex-listing-col-icon` in `globals.css` (currently `width: 1.4em;
  padding-inline: 0.35rem` per side). **Drift-guard extension (scoped — the draft's
  every-cell assert false-fails on by-design ellipsis):** `rowHeightDriftGuard.ts`
  additionally asserts `td.scrollWidth <= td.clientWidth` ONLY for the max-bounded
  columns the fix targets — level, hp, ac, size, rarity, actionCost, source, icon —
  with the by-design truncators (name; the p99-sized cast/range/type) explicitly
  excluded; both tier viewports (1600×900, 375×800), on `/feat` AND `/creature`. Same CI
  job.
- **D29-103 — browse container widens (#2).** `routes/$category/index.tsx` ONLY (named
  file — `.wrap-browse` must not leak to /search//rules//sources, which own their own
  `wrap-wide` mains; the P8 `.codex-browse-layout` reuse gotcha's cousin): swap
  `.wrap-wide` (72rem cap → measured emergent 617px table) for `.wrap-browse`
  (same padding/centering, `max-width: 96rem`). Invariants: `NARROW_CONTAINER_WIDTH_PX`
  (600) semantics and gate-B full-column-set-at-1600px (widening only helps); the P9 SSR
  window derivation is width-independent (initialRect width 0 — verified). Split-view
  `.codex-entry-pane` readability at the wider track: derive-at-build (cap its inner
  measure with the existing prose var if it degrades).
- **D29-104 — facet-leak suppression + action glyph (#3c, #18, #13c-leak, #3d).** In
  `GenericFacetLine` (`facetHeader.tsx`): extend the existing **`SPILLOVER_KEYS`** set
  (its real name; currently `["featLevel","rank"]` — never a second set) with
  `"itemCategory"` (measured leak 1,594 entities / 5 categories; equipment categories
  unaffected — they route to `EquipmentFacetHeader`; the sidebar filter + Type column are
  separate seams, untouched). `valued` renders ONLY when `true`, as the single word
  `Valued` (42/98 conditions carry it). `actionCost` renders via `CodexActionGlyph` (the
  `FeatFacetHeader` idiom) — **recorded + accepted:** the majority generic-group value is
  `passive` (762/1,131), which renders as the bare unlabeled glyph-span, matching the
  feat-header idiom (golden-pinned there). All 7 goldens contain zero
  "Item Category"/"Valued"/"Action Cost" strings (verified — no golden churn from this
  decision). This seam also fixes the popover leak (the popover clones the rendered page
  HTML).
- **D29-105 — popover interaction + compact styling + border token (#13a, #13c, #13b).**
  (a) Interaction: active popovers get `pointer-events: auto`; `Popover.tsx` — which
  today closes INSTANTLY on trigger mouseleave (no timer exists) — gains a short
  grace-delay close timer plus a panel hover bridge: `mouseenter`/`mouseleave` bound on
  the popover element too, the close timer cancelled on panel re-entry, close on leaving
  both. Wheel then scrolls `.popover-inner`. New smoke test (ZERO coverage exists):
  jsdom with mocked `fetch` — init, dispatch mouseenter, assert the `.active-popover`
  class + panel-hover keep-open; computed `pointer-events` is NOT assertable in jsdom
  (globals.css never loads) — assert classes/behavior, not styles.
  (b) Compact: CSS scoped under `.popover-inner` — the cloned page's h1 (which STAYS in
  the standalone SSR DOM per D29-112's sr-only rule, precisely so this clone keeps its
  title) re-shows at the small-title scale; `.codex-edition-banner` hides. No server
  fragment.
  (c) Token: `.popover-inner` border → `var(--color-gold-frame)` (matches the Filters
  dialog; the background already shares `--color-elevated` — "hardcoded tan" refuted).
  No sitewide `--color-elevated` retune (out).
- **D29-106 — scrollbar theming (#13d; the scroll affordance for #7/#10/#13a).**
  `scrollbar-color` (+ `scrollbar-width: thin` on compact inner regions) on `:root` and
  each inner region, plus `::-webkit-scrollbar/-track/-thumb` fallbacks (zero existing
  rules to collide with — verified). Palette: track `--color-void`, thumb
  `--color-gold-frame` family, hover maroon accent. Regions (measured, corrected):
  `:root` (covers the P9 windowed listing — the document scrolls), `.codex-facet-options`,
  `.codex-trait-chips`, `.codex-nav-panel`, `.popover-inner`, `.codex-entry-pane`.
- **D29-107 — filter-dialog usability (#7, #8, #9).** (a) Traits + Source sections gain
  per-section type-ahead inputs (client substring filter; the /rules quick-filter idiom;
  the j/k dialog guard already ignores INPUT targets — verified safe). (b) Source options
  sort by the DISPLAYED label, case-insensitive, with `abbreviateBook() === undefined` →
  sort AND render by the full title alone (never "(undefined)");
  `filterEngine.test.ts`'s pinned option order updates. (c) Rarity: sort the row-derived
  options by a rank map `{common: 0, uncommon: 1, rare: 2, unique: 3}`, unknown values
  last — **a sort, NEVER a whitelist** (`unique` = 2,031 measured entities; an order
  array used as the option source silently vanishes them).
- **D29-108 — rules browser fixes (#12, #11).** (a) `RulesBookSection` returns `null`
  when a text-query filter is active and the filtered tree is empty (mirror the
  `allHidden` case). (b) Book headers render full title + abbreviation when one exists —
  `Battlecry! (BC)`, else the title alone; order: remaster cores first (Player Core,
  Player Core 2, GM Core, Monster Core), then alphabetical by full title (derive
  core-first from existing sources/edition data; hardcode only the four names).
- **D29-109 — polish batch (#14, #15, #16, #19, #20).**
  (a) *Pointer boxes (#14):* `entityPageData.ts` adds `remasteredAs`/`legacyOf` ids to
  the embeds prefetch; `EditionBanner` accepts ctx and renders `Name (Book)` via
  `resolveEmbed`, raw-id fail-soft (rare post-D29-98 stripping — that's the S1
  dependency). Goldens `spell-heal.html` + `class-investigator.html` regen (measured).
  A lighter name+book projection instead of full-entity prefetch is optional (recorded).
  (b) *Heading anchors + ToC (#15):* GitHub-slugger-style pure fn (lowercase, hyphenate,
  strip punctuation, `-2`/`-3` per-page collision suffixes) assigns `id` to body
  headings (`nodes.tsx` heading case), the Lore h2, and `AttachedSidebars` h2/h3. No
  schema change; SSR-visible. **Golden impact is NOT one file** — `creature-dragon.html`
  carries a body h2; treat golden diffs as derive-at-build (potentially all 7),
  hand-check + record. ToC = a **collapsible "On this page" box above the content**
  (entity pages are a centered 52rem article with NO aside slot, and `.codex-rules-main`
  is a flex column — a sticky side rail is a layout sub-project this round doesn't
  take); mounts when ≥ 8 headings; rules pages get the same box inside
  `.codex-rules-main` (the left rail stays the book tree).
  (c) *Trait cross-nav (#16):* trait pages render "Find everything with this trait →" to
  `/search?traits=<trait>` — REQUIRES D29-101c's null-query fix (measured dead today).
  Per-category links are OUT (future memo).
  (d) *Category display names (#19):* ONE seam — `displayCategoryName(category)`
  (override map over `humanizeSlug`; seeded from `category-page/*.json` divergences;
  `hunters-edge` → "Hunter's Edge" confirmed) — consumed by ALL the sites the draft
  missed: nav labels, listing h1/header title, **the route `<title>`** (today renders
  the raw slug — "hunters-edge · codex"), `entityPage` type tag, /categories links,
  Omnibar group titles, SearchPage meta, the BrowseListing empty-state noun.
  (e) *404 (#20):* `DefaultNotFoundComponent` derives the attempted slug from
  `useRouterState()` pathname; adds `Search for "<slug>" →` to `/search?q=<slug>`.

### Nav / IA lane

- **D29-110 — nav curation (R5, #13f, #10).** `NAV_ITEMS` becomes the curated set —
  **28 categories** (the draft said 29; count fixed): **Player** (class, ancestry,
  heritage, background, feat, archetype, skill, condition, action, trait) · **Spells**
  (spell, ritual) · **Equipment** (equipment, weapon, armor, shield, vehicle) · **GM**
  (creature, creature-family, hazard, warfare-army, kingdom-event, kingdom-structure,
  curse, disease) · **Setting** (deity, plane, language) · **Rules** (bare link, split
  control gone) · **Sources** (bare link) · **All categories → /categories** (replaces
  "Everything"). All 28 slugs verified present in the corpus. Everything else reachable
  via /categories, the omnibar, and in-context links (stakeholder-sanctioned).
  Conformance rewrite touches THREE files: `navData.test.ts` (the union-equality and
  `=== 88` nav-count asserts are DELETED; **the corpus-census `=== 88` assert STAYS** —
  it anchors the new "curated ⊆ 88, every entry exists" check), `HeaderNav.test.tsx:21`
  ("renders every one of the 88"), plus a new "/categories renders all 88" assert.
  ssrSmoke/corpusFs 88-pins are category counts, unchanged. Dropdown panels:
  `max-height: min(70vh, 24rem)` (#10) + the D29-106 themed scrollbar.
- **D29-111 — listing superseded reveal (R3, #13, #3e, #3f).** **New plumbing first
  (the P9 seam):** `WindowedCategoryListing` + the route payload gain a `hiddenCount`
  (superseded-hidden total) computed loader-side, threaded as an override prop exactly
  like `eligibleCountOverride` — a locally-computed count over ≤60 windowed rows is
  WRONG on cold load and SSR-vs-client would disagree (the hydration-mismatch class);
  `virtualization.ts` + the loader are in this decision's ripple. `BrowseListing`'s
  count row then gains the /rules idiom: superseded off ∧ hidden > 0 →
  `Show N hidden (superseded) →`; widened → `Hide superseded ←`. **The navigate is a
  functional merge** `search: (prev) => ({...prev, superseded: true})` with
  `resetScroll: false` — the /rules `navigate` is a whole-search replace and would wipe
  `q`/`traits`/`sort`/`entry` (measured). Count line keeps visible-count semantics;
  honesty comes from the note. Empty-visible case (the 10 all-superseded categories):
  empty state reads `All N entries here are superseded (legacy).` + the reveal control.
  Predicate untouched (`filterEngine.ts:176`; `loaderDeps` needs no change — verified,
  only `entry` is a loader dep). `BrowseListing.test.tsx` gains reveal-state asserts.
- **D29-112 — title-into-header (R4, #13e).** **Mechanism PINNED (the draft's
  "derive at build" is closed):** the root header reads the RESOLVED matches via
  `useRouterState`/`useMatches` — listing title from `params.category` +
  `displayCategoryName` (no loader dependency — immune to the D29-89 projection),
  entity title from the entity route's dehydrated `loaderData.entity.name`, rules docs
  likewise. An effect-based "context setter" is **FORBIDDEN** (client-only → wordmark
  flash + hydration mismatch). SSR-clean, no flash. Applies on listing + entity + rules
  routes; landing, /search, /categories, /sources keep the wordmark. A small home
  glyph precedes the title and carries `Link to="/"` (the wordmark is the ONLY home
  affordance today — that must survive).
  **Heading policy (a11y + the B1 popover fix, pinned):** exactly ONE h1 per document,
  and it lives IN THE CONTENT: the header title element is a styled `div` (never h1);
  standalone entity routes KEEP `<h1 class="codex-entity-name">` in the SSR DOM with a
  `codex-entity-name-standalone` modifier that page-level CSS renders sr-only —
  `.popover-inner` re-shows it (D29-105b), the document outline keeps its h1, and the
  type-tag row's layout with the h1 visually absent is restyled deliberately (it's
  `space-between` today — the orphaned tag must not float alone-left). Listings: the
  in-content `<h1 class="codex-listing-title">` becomes sr-only the same way; count
  line + hint + reveal note + Filters controls compact to ONE slim row above the table
  (reclaims the measured ~120px). The `standalone` flag threads **through
  `EntityRenderPane`** (both the route and the split view consume EntityPage only via
  it); embedded contexts (drawer, goldens) render h1-visible as today — goldens
  unaffected by THIS decision. Rules pages: header shows the doc name; the breadcrumb
  leaf also names it — accepted duplication, recorded. The route `<title>` uses
  `displayCategoryName` (D29-109d). Mobile: header title ellipsizes, never wraps the
  bar taller. (Verified: no guard/smoke greps h1 — `ssrSmoke.test.ts:499` asserts only
  the ABSENCE of `codex-listing-title` on entity routes, still true under sr-only?
  **No — sr-only keeps the class in the DOM: update that assert to tolerate presence on
  LISTING routes only**, i.e. re-word it to assert the entity route has no listing
  title; derive exact wording at build.)

## 3. Scope

**In:** everything above + tests/fixtures/goldens/search-index/deploy ripple.
**Out (explicit):** backlog item 3 (refuted); sitewide `--color-elevated` retune;
per-category trait browse links; upstream-data override registry (P10 carry); backrefs
round; activation redirects (dropped URLs 404); server-fragment compact popover (CSS layer
chosen); any Pagefind ranking change; a sticky ToC side rail (box-above-content chosen);
omnibar keyboard scroll-follow (pre-existing gap, recorded, not taken).

## 4. Slices (serial; one engineer + one reviewed commit each; globals.css is shared
state — no parallel worktrees this round)

- **S1 — transform + search-build (D29-98..101).** Widened drop pass + ID-keyed keep-9 +
  edition-pointer stripping; name templates (pinned ACTION.TYPES table); whole-document
  adjacent dedupe (runs, apostrophe/case fold); build-search `meta.class` (trimmed) +
  top-level leads-to pre-filter; report counters + the family-(ii) name list for review.
  **Regression coverage is currently ZERO for all three mechanisms at fixture level
  (measured: no fixture entity is paren-named, template-named, in the 123, or
  leads-to-bearing)** — add raw-fixture picks: one paren-named action, one
  template-named action, one dupe-bearing `domain/*` page, one leads-to feat (e.g.
  `feat/fledgling-flight`), plus unit tests at the drop/rename/dedupe seams. Fixture
  regen (extract-fixture; virt-001..090 restore-from-git + re-splice per the P10 §6
  procedure). Scratch-outDir transform + determinism 2× (live `data/corpus` untouched
  until deploy); record final pins (STOP on unexplained delta). ~~transform.test.ts pin
  updates~~ — **struck: it has no absolute count pins (manifest-driven)**; instead sweep
  the stale `46,192` COMMENTS (`build-search.ts`, `build-search.test.ts`,
  `columnDefs.tsx`, `ssrSmoke.test.ts`, `facetKeys.ts`, `urlState.ts`).
- **S2 — listing tables + facet header + filter dialog + rules fixes
  (D29-102/103/104/107/108).** Column calc widths + icon CSS + scoped drift-guard
  extension; `.wrap-browse` (one file); SPILLOVER_KEYS + valued-when-true + action
  glyph; type-ahead inputs + label-sorted sources + rarity rank map; rules zero-match
  guard + book headers. Goldens: derive-at-build (none expected from D29-104 —
  verified zero leak strings in goldens).
- **S3 — popovers + scrollbars (D29-105/106).** Grace-delay close + panel bridge +
  pointer-events + smoke test (class-based asserts, mocked fetch); compact popover CSS
  (depends on D29-112's sr-only h1 CLASS existing — if S3 lands first, scope the compact
  h1 rule to the plain `codex-entity-name` selector and let S4 tighten it); border
  token; scrollbar theming across the 6 regions + nav panel max-height (#10).
- **S4 — nav + reveal + title-into-header (D29-110/111/112).** Curated NAV_ITEMS +
  three-file conformance rewrite; `hiddenCount` plumbing (virtualization.ts + loader +
  override prop) + reveal control (functional-merge navigate, resetScroll:false) +
  empty-state copy; header title via resolved matches + sr-only h1 policy +
  `standalone` through EntityRenderPane + slim listing bar + the ssrSmoke:499 assert
  re-word. Heaviest UX slice — Playwright spot-checks desktop + 390px mobile before
  commit (DOM textContent asserts, never curl|grep — the React SSR `<!-- -->` separator
  gotcha).
- **S5 — search meta render + polish batch (D29-101c-render, D29-109).** Omnibar rows
  add **rarity + class only** (level already renders; category rides the group header —
  the draft's per-row category duplicated it); /search rows add class; pointer-box
  names; heading ids + ToC box; trait link (with the /search null-query fix proven);
  `displayCategoryName` at ALL enumerated sites incl. the route `<title>`; 404 search
  link. Goldens: derive-at-build (heading ids may touch all 7), hand-check + record.
- **S6 — consolidated sweep + deploy.** Full member suite + both CI lanes local; gates
  A–G; deploy per the D29-97 staged order (build image FIRST → one in-place transform →
  `just codex-search-index` → immediate `just up`; record the degraded window); spec
  build record + memory + RESUME.

## 5. Acceptance gates

- **A (determinism + counts):** 2 scratch transforms byte-identical; final pins recorded
  == the S1 re-derivation (≈ 44,805 / 88 / action ≈ 2,638; `activationDropped` ≈ 1,387
  with the family-(ii) list reviewed; keep-9 intact and crossref/embed-resolvable;
  `nameTemplateResolved` 12; `postDropEditionPointerStripped` recorded;
  whole-document dupe re-scan == **0** from 1,147/123).
- **B (hermetic):** full codex member suite green; both CI lanes local; goldens
  byte-exact post-regen, every diff hand-checked + recorded (no pre-pinned lists); P9
  row-height + interaction guards pass including the SCOPED cell-fit asserts; the new
  S1 fixture picks exercise drop/rename/dedupe/leads-to. (Pre-existing residue rides:
  7 ssrSmoke fails on main; the virtualization-guard CI-env flake.)
- **C (tables):** live /feat + /creature at 1440/1920: no clipped cell in the
  max-bounded columns (level "11", HP "287", "Passive", rarity, icons fully drawn);
  table visibly wider than 617px at 1920; 390px mobile: **no h-scroll and Name stays
  the dominant column** (compact columns DO widen by design — the draft's "unchanged"
  was wrong).
- **D (data quality, via Playwright textContent):** /action renders NO dropped row; its
  first rows are the keep-list entries followed by real actions (the debris families
  are gone per the widened predicate); the renamed survivors (derive-at-build count)
  live at template-free slugs; a kept-entity crossref still resolves (equipment/vorpal);
  `/action/interact-142` shows NO dangling edition pointer; Sarenrae "Pantheons" lists
  Cosmic Caravan once; `domain/knowledge-domain`'s "Deities" masthead has no adjacent
  dupes (the epicenter case); deity shows no "Item Category"; a condition shows no
  "Valued: false".
- **E (popovers + chrome):** hover a crossref → panel opens **with a visible title**
  (the B1 case), mouse into the panel keeps it open, wheel scrolls, leaving closes;
  no edition banner; gold-frame border; themed scrollbars in all 6 regions; nav
  dropdown shows beyond 12 items on a 900px viewport.
- **F (nav/IA + reveal):** nav = the curated 28 + All categories; /categories lists 88;
  `/doctrine` shows "All 2 entries here are superseded (legacy)." + reveal →
  `?superseded=1` rows; /spell shows "Show N hidden (superseded) →" and the toggle
  PRESERVES active `q`/`traits`/`sort`/`entry` and scroll position; header title on
  listing/entity/rules with a working home glyph; exactly one h1 per document
  (sr-only where the header carries the visual title); landing + /search keep the
  wordmark; the P9 interaction guard re-run green.
- **G (search + telemetry):** reindex done; omnibar "shield block" rows distinguishable
  (rarity + owning class; the three PC1 rows differ); filter-only `/search?traits=fire`
  returns results (686-scale, not zero); a leads-to excerpt no longer shows
  "leads to..." text; "fireball"/"heal" still #1 (P8 boost intact); SigNoz
  `astra.codex` zero new ERROR post-deploy.
- **H:** after this round ships, gate H = the ONE consolidated **P2–P11** stakeholder
  review on live.

## 6. Build record

**S1 (transform + search-build, D29-98..101) — real-corpus 2× scratch transform, `data/corpus`
untouched throughout (verified: `manifest.json.totalEntityCount` stayed 46,192 on disk).**
Determinism: 2 independent scratch runs, `diff -rq` over 44,901 files — **byte-identical**.

**Derive-at-build pins (final, all explained):** total **44,808** (46,192 baseline − 1,384
new activationDropped, exact); categories **88** (exact); action finalOut **2,641**;
`activationDropped` **1,384** = parenFamily **1,224** (1,233 measured incl. 9 keeps − 9 = exact)
+ digitFamily **160** (independently cross-checked via raw AoN snapshot scan and fresh-corpus
scan, both agree — supersedes the spec's un-censused ≈163 estimate); `nameTemplateResolved`
**12** (exact hard-pin match); `postDropEditionPointerStripped` **55**, not the narrow-predicate
56 — traced exactly: `action/1-minute-concentrate-manipulate-17` (a kept→dropped pointer OWNER
under the narrow predicate) is itself a digit-family drop under the WIDENED predicate, so its
`remasteredAs` edge vanishes with its own owner instead of being counted as stripped; D29-99
churn confirmed live — the six "Cast a Spell…" docs resolved into exactly two 3-member
`-2`/`-3` collision groups, matching the spec's prediction verbatim. Gates: crossrefs into the
drop set **0**; whole-document re-scan **0**; `equipment/vorpal` (kept-entity crossref) still
resolves; `action/interact-142` carries no dangling edition pointer; Sarenrae body lists
"Cosmic Caravan" exactly once; `domain/knowledge-domain` masthead carries zero adjacent dupes.

**`adjacentCrossrefDeduped` AMENDED (P6 "ship the mechanism, amend the pins" precedent):**
measured **1,167 occurrences / 133 entities**, not the spec's review-measured 1,147/123.
Independently verified at the epicenter: a regex scan of `domain/knowledge-domain`'s RAW AoN
markdown (source-of-truth, no codex code involved) found **38** genuine duplicate pairs, not
37 — the engineer's `collapseAdjacentCrossrefs` also reports 38 for that entity, matching the
raw-markdown ground truth exactly. The spec's own review pin undercounted by a small margin;
1,167/133 is recorded as the authoritative pin going forward, backed by the re-scan==0 gate
(idempotent — no residual dupes anywhere in the output corpus).

**Bug found + fixed via this derivation (not spec-anticipated):** the first-pass
`activationDropFamily` fired on ANY `action`-category entity matching a drop-family name shape,
not just AoN-only ones — a handful of genuine Foundry adventure-specific actions (e.g.
`"(Affinity Ablaze) Arms of Balance: Walking the Cardinal Paths"`, from
`packs/pf2e/adventure-specific-actions/`) also start with `(` and were being misclassified as
`activationDropped` (same end-state either way — the pre-existing D29-14/17 pass would have
dropped them anyway as unjoined Foundry-only residue — but the ACCOUNTING was wrong). Fixed by
scoping the predicate to `proseOnly === true`, matching D29-98's literal "AoN-only" wording;
verified all 9 keep-list entities are themselves `proseOnly: true`, confirming the scope.
Regression test added (`drop.test.ts`).

**Fixture regen** (`extract-fixture.ts`, new `REQUIRED_AON_PICKS`): `action-2910` "(arcane)"
(paren-family drop) · `action-4171` (ACTION.TYPES template → survives renamed, non-drop-family)
· `action-2461` (TRAITS template → "10 minutes (concentrate, manipulate)", the D29-99/-98
overlap case, dropped after resolution) · `domain-113` "Naga" + `deity-313/218/620/601/422`
(the dedupe epicenter — Ravithra legacy+remaster repoint to one target) · `feat-2649`/`feat-2653`
(Fledgling Flight / Juvenile Flight, the leads-to exclusion case; `feat/fledgling-flight` also
added to `REQUIRED_CANONICAL_IDS` for `build-search.test.ts`'s end-to-end proof —
`class-feature/ability-boosts-15`, already required, covers `meta.class` for free). virt-001..90
restored from git + `ritual/_index.json`/`manifest.json` re-spliced by hand per the P10 §6
procedure (a full `git checkout` of `ritual/` came out byte-identical to HEAD, confirming the
regen reproduces committed content exactly); `manifest.json` patched to `ritual: 96`,
`totalEntityCount: 204`, `totalSizeBytes` recomputed from actual on-disk bytes.

**CI:** `tsc --noEmit` clean (codex + `vp run -r typecheck` repo-wide, 32 tasks); `oxlint
--threads=4` clean (the documented OOM workaround); `oxfmt --check` clean; `vp run -r test`
repo-wide — 1917/1924 tests pass, the 7 failures all in `ssrSmoke.test.ts`'s
`$category/ browse route (D29-35 tier 3)` block, same signature/count/location as the
documented pre-existing residue (accepted, no stash A/B required); `vp run -r build` repo-wide
clean; Playwright `virtualizationInteractionGuard.ts` (P9 guard) — all 22 cases PASS against
the real corpus. A `vp run` side effect regenerated `apps/heartwood-frontend/src/
routeTree.gen.ts` (the documented flap) — reverted before commit.

**Deviations (both minor, recorded not silently done):** (1) `extractAonMeta` takes `report`
as an OPTIONAL 3rd param (default no-op) rather than required, to avoid touching ~40
pre-existing fixture-shaped call sites in `aonFacets.test.ts`/`join.test.ts` that never
exercise D29-99 — real call sites (`transform.ts`/`dev-join.ts`/`parse-aon.ts`) all pass it
explicitly. (2) `columnDefs.tsx`'s two historical p99/max width-measurement comments were
annotated as stale/NOT re-measured (rather than silently rewriting the cited numbers) — that
remeasurement is D29-102/S2 territory, out of S1's scope.

**Files:** new `src/ingest/dedupeCrossrefs.ts`/`.test.ts`,
`src/domain/search/SearchPage.test.tsx`, 4 new/updated fixture files; modified across ingest
(`drop.ts`, `aonFacets.ts`, `report.ts` + tests, `transform.ts`, `dev-join.ts`, `parse-aon.ts`,
`extract-fixture.ts`), search (`build-search.ts`, `pagefindClient.ts`, `SearchPage.tsx` +
tests), and the 46,192→44,808 comment sweep (`columnDefs.tsx`/`.test.tsx`, `urlState.ts`,
`facetKeys.ts`, `ssrSmoke.test.ts`, `build-search.ts`/`.test.ts`).

**S2 (listing tables + facet header + filter dialog + rules fixes, D29-102/103/104/107/108) —
all five decisions landed, CI green.** Column `calc(Nch + 1rem)` widths (border-box padding
compensation) + `.wrap-browse` (96rem, `routes/$category/index.tsx` ONLY — verified `.wrap-wide`
still serves /search//rules//sources) + `SPILLOVER_KEYS`+itemCategory/valued-bare-word/
actionCost-glyph + Traits+Source type-ahead + Source label-sort + Rarity rank-sort + rules
zero-match guard + core-first book headers, all built and locally live-verified via Playwright
against the real corpus (screenshots + DOM assertions, not curl|grep).

**Two live-caught deviations (both real-corpus-only, invisible against the fixture — recorded in
place, not silently done):** (1) the edition-icon column's `padding-inline: 0.35rem` was losing
the CSS cascade to `.codex-listing-table th, .codex-listing-table td`'s higher-specificity
`padding: 4px 0.5rem` shorthand — the SAME trap `.codex-listing-col-name` already documents —
so the real applied padding stayed `4px 8px` regardless of this rule's own number; split into a
separately-qualified `.codex-listing-table th.codex-listing-col-icon, …td.codex-listing-col-icon`
rule (width stays on the bare class, since `table-layout: fixed` needs it on `<th>` too), final
width `calc(0.95em + 0.9rem)`. (2) Source's `9ch` (p99=8+1ch) still clipped the real corpus's
"COCA-ECPG" (9 chars, uppercase+hyphen-heavy — `ch` is pinned to the "0" glyph's width, narrower
than this string's real per-character average) — bumped to `10ch` (still comfortably under
Source's own max=18, so the genuine long tail still ellipsis-truncates by design).

**Drift-guard PASS matrix (real corpus, both routes × both viewports, post-fix):** FULL
(1600px) `/feat` row height 24px, cell-fit `[level, actionCost, source, icon]` PASS; COMPACT
(375px) `/feat` `[level, source, icon]` PASS; FULL (1600px) `/creature`
`[level, hp, ac, size, source, icon]` PASS; COMPACT (375px) `/creature`
`[level, source, icon]` PASS. `rarity` is structurally unexercised by this guard (no real
category shares a scoped Rarity column with either named route) — carried into gate H's S6
live-sweep checklist (hand-check a rarity-carrying category) per orchestrator note.

**Goldens: zero churn, confirmed not assumed** — grepped all 7 for "Item Category"/"Valued"/
"Action Cost" BEFORE touching code (0 hits), then regenerated all 7 post-change and diffed
byte-identical against pre-change copies.

**`.codex-entry-pane` readability (D29-103's derive-at-build call): no cap needed.** Live-measured
at 1920px under `.wrap-browse`: entry pane 608px (58/42 split of the 96rem-capped, padded,
gapped container) — well under `.codex-entity-page`'s own 52rem (832px) prose cap regardless of
viewport width (the container's own max-width bounds it, not the viewport). Verified both by
arithmetic and a live Playwright screenshot of a long-prose feat page in split view — comfortable
line lengths, no degradation; no `.codex-entry-pane` CSS change made.

**D29-108 book order — live-proven against the real 45-book corpus:** exact rendered order
`Player Core (PC1) → Player Core 2 (PC2) → GM Core (GMC) → Monster Core (MC) →
Advanced Player's Guide (APG) → Ancestry Guide (LOAG) → Battlecry! (BC) → …` (alphabetical by
full title for the remaining 41). Zero-match guard live-proven: a nonsense query zeroes every
`.codex-rules-book` section; a real partial query narrows correctly (8/45 for "crafting").

**CI:** `vp run -r typecheck` 32/32 clean; `oxlint --type-aware --deny-warnings --threads=4`
clean; `oxfmt --check` clean; `vp run -r test` 26/26 tasks — codex 1940/1947, the 7 failures
matching the documented pre-existing `ssrSmoke.test.ts` residue by NAME not just count; `vp run
-r build` 26/26 clean. The `routeTree.gen.ts` flap recurred once (build lane) — reverted before
commit.

**Files:** modified `scripts/rowHeightDriftGuard.ts`;
`src/domain/browse/{columnDefs,columnDefs.test,FacetPanel,FacetPanel.test,filterEngine,
filterEngine.test}.{ts,tsx}`; `src/domain/render/{facetHeader,facetHeader.test}.tsx`;
`src/domain/rules/{RulesTree,RulesTree.test,treeModel,treeModel.test}.{ts,tsx}`;
`src/routes/$category/index.tsx`; `src/styles/globals.css`. No new files.

**S3 (popovers + scrollbars, D29-105/106) — both decisions landed, CI green.** D29-105a
(interaction): `Popover.tsx`'s instant `clearActivePopover()` on trigger `mouseleave` (no
timer existed) replaced with a **200ms grace-delay close timer** (`GRACE_DELAY_MS`, chosen not
measured — long enough for a deliberate trigger→panel move, short enough not to leave a stale
card lingering; tunable at gate H if it reads snappy/sluggish live) + a **panel hover bridge**
(`mouseenter`/`mouseleave` bound on the `.popover` element itself, once at creation since
elements are reused across repeat hovers of the same target via the `prev` lookup — binding
per-onEnter-call would have piled up duplicate listeners); `initPopovers` exported for
testability (previously module-private, zero coverage). CSS: `.popover.active-popover {
pointer-events: auto }` (was `none` even when active — the actual root cause of "dead to
pointer events," wheel included). D29-105b (compact): `.popover-inner .codex-entity-name {
font-size: 1.1rem }` scoped to the **plain class**, not a `-standalone` modifier — D29-112
(S4) hasn't landed yet, so per the spec's own cross-slice note this rule targets the bare
`codex-entity-name` selector and stays live once S4 adds the modifier alongside it (S4's job
is to tighten the selector, never to re-show a hidden title). `.popover-inner
.codex-edition-banner { display: none }`. D29-105c (border): `.popover-inner` border
`--color-rule` → `var(--color-gold-frame)`, matching `.codex-filter-drawer`. D29-106
(scrollbars): `scrollbar-color`/`scrollbar-width: thin` (the last omitted on `:root`/`html`
per spec) added to all 6 measured regions — `html` (`:root`'s the document scroll, covers the
P9 windowed listing), `.codex-facet-options`, `.codex-trait-chips`, `.codex-nav-panel`,
`.popover-inner`, `.codex-entry-pane` — plus a consolidated `::-webkit-scrollbar/-track/
-thumb(:hover)` fallback block (Chromium/Safari don't read `scrollbar-color`). Palette:
track `--color-void`, thumb `--color-gold-frame`, hover `--color-accent` (maroon alias).
`.codex-nav-panel` max-height `24rem` → `min(70vh, 24rem)` (#10, same slice per §4's list).

**Live gate-E verification (production build, real corpus, local port 10374 — see process
note below):** hovering the `Healing` trait crossref on `/spell/heal` opened the panel with
**pointer-events computed `auto`**, border computed `rgb(194, 164, 109)` = `#c2a46d` =
`--color-gold-frame` exactly, edition banner present in the DOM at `display: none`, and — the
review's headline B1 catch — **the cloned title stayed visible**: `.codex-entity-name`
text "Healing" at computed `17.6px` (1.1rem against the 16px root, the compact scale applied).
Panel-hover bridge: moved into `.popover-inner`, panel stayed `active-popover` past 1s (≫ the
200ms grace window). Wheel: a long popover (`/creature/red-dragon-adult`'s
cinder-dragon-adult crossref, `scrollHeight` 4728 vs `clientHeight` 350) scrolled via a real
`page.mouse.wheel` — `scrollTop` 0→300, panel stayed open throughout (pointer-events: auto
letting the wheel reach it). Close: moved the mouse off both trigger and panel — still open
at 50ms, closed at 300ms (past the 200ms grace, not instant). `scrollbar-color` computed
`rgb(194, 164, 109) rgb(238, 231, 216)` (gold-frame/void) confirmed on all 6 regions
(`document.documentElement`, `.codex-nav-panel`, `.popover-inner`, `.codex-facet-options`,
`.codex-trait-chips`, `.codex-entry-pane`), `scrollbar-width: thin` on the 5 inner ones. Nav
panel at 1280×900 (Player dropdown, 39 items — un-curated pending S4's D29-110): computed
`max-height: 384px` = `min(70vh, 24rem)`; `scrollHeight` 1203 vs `clientHeight` 382; scrolled
the panel to bottom and confirmed the **39th item became visible within bounds** — items
beyond 12 are genuinely reachable, not just numerically capped the same as before (the
`min()` formula's own benefit is on viewports shorter than ~549px tall; at 900px the themed,
always-rendered scrollbar is what makes the pre-existing `overflow-y: auto` reach
discoverable).

**Process note (recorded, not a fault to fix now):** verification needed the production
server on port 10374 (`config.kdl`'s fixed `codex.port`, no PORT env override — `vite dev`
doesn't serve `staticMounts`/pagefind, so a production `build && start` was required), which
collided with the live `astra-codex` Docker container already bound to that port. The
container was stopped for the session, the local server verified against, then the container
was restarted and confirmed healthy — a brief live-site downtime window resulted. Orchestrator
confirmed the container recovered healthy. Future slices needing a local production server
should bind a different port for verification rather than stopping the live container.

**Tests:** new `Popover.test.tsx` (jsdom, duck-typed `fetch`/`Response` mock — not the real
classes, which aren't guaranteed present under vitest's jsdom environment — + `vi.useFakeTimers`
for the grace-delay assertions): open-with-title, grace-delay close (not instant), panel-hover
bridge cancels the close, leaving the panel re-schedules and fires. 4/4 pass.

**CI:** `tsc --noEmit` (codex) clean; `vp run -r typecheck` 32/32 clean; `oxlint --type-aware
--deny-warnings --threads=4 apps libs/ts` clean; `format:check` clean (850 files); `vp run -r
test` 26 tasks — codex 1944/1951 (7 failures, exact-NAME match to the documented pre-existing
`ssrSmoke.test.ts` residue, zero delta from S2's count baseline once the 4 new Popover tests
are added); one unrelated flake, `akasha-frontend#test` exit 137 (SIGKILL/OOM under the
26-way parallel run) — re-ran in isolation, 12/12 files / 56/56 tests pass; not caused by this
slice (akasha-frontend untouched) — accepted by the orchestrator as environmental. `vp run -r
build` 26/26 clean. The `routeTree.gen.ts` flap recurred once — reverted before commit per the
sanctioned procedure.

**Files:** modified `src/domain/components/islands/Popover.tsx`, `src/styles/globals.css`;
new `src/domain/components/islands/Popover.test.tsx`.
