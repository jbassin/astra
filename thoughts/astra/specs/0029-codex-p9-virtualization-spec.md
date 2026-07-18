# 0029 P9 — listing windowed virtualization (spec)

**Status:** FINAL (2026-07-17 — adversarial review ×2 folded: 2 mechanics blockers + 2
interaction blockers + 2 stakeholder resolutions R5/R6 + 5 minors + 3 nits, §6)
**Scope doc:** `thoughts/shared/research/2026-07-17-codex-0029-p9-virtualization-thoughts.md`
(R1–R4 stakeholder-resolved 2026-07-17: option A windowed virtualization chosen; Ctrl+F and
"N of N shown" trade-offs accepted; D29-35 full-rows-client-side DATA decision untouched.
**R5/R6 resolved in-review 2026-07-17:** R5 Tab-reach narrowing ACCEPTED with
`aria-rowcount`/`aria-rowindex` compensation; R6 name column goes single-line +
ellipsis — the fixed-pitch invariant wins over two-line wrapping.)
**Change class:** render/client-only. No transform, no corpus regen, no Pagefind reindex.
Deploy = `just up` only.
**Ordering:** builds on the landed SVG dedupe (`a298025`); its live /feat weights
(7,157,306 B decoded / 546 KB gz, dehydration blob 2,264,706 B measured live) are this
spec's "before" baseline.

## 1. Goal

Kill the /feat-class parse+hydrate cost (8,485 SSR'd + hydrated `<tr>`s → ~2.8 s parse +
~1 s hydrate at 4× CPU throttle) by (a) rendering listing rows as a **window** over the row
array — SSR ships only the first-window rows; the client mounts only visible + overscan —
and (b) **removing the full-row array from the router's dehydration payload** (measured
2.26 MB inside /feat's HTML — DOM windowing alone cannot touch it; D29-89). Row DATA still
reaches the client in full (D29-35 untouched); sort/filter/count/split-view semantics
preserved; j/k changes mechanism (index-based) but not behavior.

## 2. Decisions

### D29-83 — windowed virtualization of `BrowseListing`'s table (R1)

- **New dependency: `@tanstack/react-virtual`** (repo has no windowing lib; same vendor
  family as the pinned router/start). Caret-range like the other TanStack deps.
- **Window-scroll, fixed-size:** the DOCUMENT scrolls (`.codex-listing-pane` has no
  overflow, `globals.css:943-945`) → `useWindowVirtualizer` (SSR-safe: `initialRect`/
  `initialOffset` fallbacks are read whenever the real scroll rect is still null — verified
  against `@tanstack/virtual-core` source, §6 V-OK). Constant `estimateSize =
  ROW_PITCH_PX`, **no `measureElement`**.
- **Pitch truth (review M4 — the proxy-pin class):** P8's build record measured the LIVE row
  at **23.94 px**, not the token's 24 px, and `globals.css`'s own "≈24px" comment arithmetic
  doesn't match its actual `padding: 4px` rule. Fixed-size windowing never self-corrects, so
  S1 must first **tighten the row CSS until the real rendered height is exactly 24 px**
  (integer border-box: content + 2×4px padding + 1px hairline — adjust line-height/padding
  as needed), then the **drift-guard is a real-browser probe** asserting
  `getBoundingClientRect().height === ROW_PITCH_PX` on rendered rows at BOTH container
  tiers — NOT a tokens.css parse (the token≠live gap is the exact failure the guard exists
  to catch).
- **Applies to ALL category listings uniformly.** `/search`, `/rules`, `/sources` untouched.
- **In-table windowing via spacer rows:** register stays a real `<table>`/`<thead>`/
  `<tbody>`. `<tbody>` = top spacer `<tr>` + mounted window + bottom spacer `<tr>`. Spacer
  height lives on the spacer's single **`<td colSpan style={{height, padding:0,
  border:"none"}}>`**, never the `<tr>` (cross-engine `<tr>` height + `border-collapse` is
  unreliable — review N6). Spacers `aria-hidden` (AT row-count side effect recorded, N7 —
  compensated by R5's `aria-rowcount`). Row `key` = entity slug. No transform-positioned
  rows (`border-collapse` doesn't compose with absolutely-positioned `<tr>`s).
- **`scrollMargin` (review M3):** the table sits below variable-height furniture (header,
  controls, conditional pills row). The virtualizer's `scrollMargin` = the list element's
  ref-measured document offset, applied in a **post-hydration effect**; server pass and
  client FIRST pass both run with `scrollMargin: 0` so the hydration ranges agree (the
  effect-time correction re-renders with the true margin — post-hydration, mismatch-free).
- **Overscan: 20.** Per-row `content-visibility`/`contain-intrinsic-size` DELETED from
  `.codex-listing-row` (redundant at ≤ ~110 mounted rows; removes the half-working
  find-in-page middle state; R2). `--density-row-pitch` survives as the CSS authority the
  24 px live target is tuned to.

### D29-84 — SSR window determinism + hydration-zero (the risk center)

- **The window arithmetic is DERIVED, not asserted (review B2):** both passes get identical
  `initialOffset: 0` and `initialRect = { width: 0, height: INITIAL_VIEWPORT_PX }` with
  `INITIAL_VIEWPORT_PX = 40 × ROW_PITCH_PX = 960`. First computed range = 40 visible + 20
  overscan → **`SSR_WINDOW = 60` is the OUTPUT of that formula** (change any input → re-derive,
  don't re-assert). A unit test computes the range through the real virtualizer with these
  options on a server-like pass and asserts `[0, 60)`.
- SSR renders exactly that range in the URL's sort order (P8 gate-C bar carries over) + the
  bottom spacer sized `(total − 60) × pitch` — full final scroll height on arrival.
- **Zero hydration mismatch** on the 8-route ssrSmoke sweep stays the hard gate, AND (review
  B2-interaction) a **real-browser reload-at-depth gate**: the ssrSmoke harness is
  structurally blind to the scroll-restoration path — TanStack's restoration fires
  `scrollTo` in a layout effect on the FIRST render when sessionStorage has an entry, before
  the virtualizer's scroll listener has recomputed, which under windowing = a blank-spacer
  flash at the restored offset. S2 must **synchronize the virtualizer's first post-hydration
  range with the restored `scrollY` in the same layout-effect timing** (read the restored
  offset / `window.scrollY` before first paint and seed the virtualizer's offset), and the
  Playwright case (scroll deep → reload the tab) gates it: restored viewport shows real
  rows, no spacer flash beyond one frame.
- **Deep links:** `?entry=` beyond the initial window → post-mount `scrollToIndex(target,
  align: "center")`. Precedence (review): a scroll-restoration entry for the same URL
  **wins over** deep-link centering (back-nav returns where the user was; centering is for
  fresh arrivals only).

### D29-89 — rows leave the router dehydration payload (NEW — review B1-mechanics)

- **Measured live:** the loader's full-row return is auto-dehydrated by TanStack Router into
  a 2,264,706 B inline `<script>` (31.7% of post-dedupe /feat) — unconditional for
  non-SPA-mode apps (`dehydrateMatch` maps `loaderData` for every matched route). Windowing
  rows without touching this leaves a ~2.4 MB floor and pays its parse+eval on the main
  thread.
- **Mechanism:** the route loader returns a **windowed projection** on the server — `{ rows:
  <the SSR_WINDOW slice in URL sort/filter order>, totalCount, eligibleCount, category
  meta, entry }` — so the dehydrated payload carries ≤60 rows. Post-hydration, the client
  fetches the FULL row array through the **existing client listing path**
  (`memoizedListing`/`listingClient.ts` — the same serverFn fetch SPA navigations already
  use; module-level memoization already prevents re-fetch on row clicks, P4.5 blocker
  contract intact) and swaps it in. On client-side (SPA) navigations the loader behaves as
  today (full local array; no wire cost — it's the same memoized fetch).
- **D29-35 is semantically intact:** the full array still lives client-side and ALL
  filtering/sorting stays local. The narrowing: for the first ~100-300 ms after a cold
  load, filter/sort/count CONTROLS are live but compute over data that hasn't arrived —
  the UI renders the SSR window + the loader's counts until the full array lands, then
  recomputes. No control is disabled; a keystroke in that window applies when data
  arrives. (Engineering-decidable presentation; recorded so gate H sees it.)
- j/k across the frontier and deep-link `scrollToIndex` beyond row 60 depend on the full
  array having arrived — both already require a mounted-row round trip, and the fetch
  completes well inside human reaction time; S2's Playwright cases run against a cold load
  to prove it.

### D29-85 — j/k, Enter, preview-follow: index-based mechanism, identical behavior (P8 D29-82 carry)

- **Active position is PERSISTED STATE, keyed by SLUG** (review B1-interaction + M-reconcile):
  React state holds the active row's slug; each j/k resolves it against the current
  `visible` array. Wheel-scroll unmounting the focused row (browser moves focus to `body`)
  does NOT lose position — the next j/k resumes from the persisted slug (`scrollToIndex` →
  mount → focus), never snaps to row 0. If the slug is no longer IN `visible` (filter/sort
  changed underneath), treat as unfocused — matching today's filtered-out-focused-row
  behavior. `document.activeElement` is never the source of truth, only the focus target.
- **Ordinary j/k alignment (review M6): `align: "auto"`** (minimal scroll — the
  `scrollIntoView({block:"nearest"})` equivalent). `center` is reserved for deep-link
  arrivals (D29-84).
- **Unchanged:** native `focusin` preview-follow (mounted rows are real anchors), Enter =
  native activation with `e.detail === 0` fall-through, 180 ms settle + replace-only
  `?entry=`, hint line, zero history growth. Focus-after-mount keys off the virtualizer's
  rendered range change, never a timer.
- **R5 (stakeholder-RESOLVED):** Tab reaches only mounted-window anchors — ACCEPTED; j/k is
  the sanctioned traversal. Compensation: `aria-rowcount={visible.length}` on the table +
  `aria-rowindex={absoluteIndex}` per mounted `<tr>` so AT announces true position
  ("row 4,200 of 8,485") — the WAI-ARIA pattern for windowed tables, valid without
  `role="grid"`, matching the repo's existing bar (`aria-sort`/`scope="col"` already
  present).

### D29-90 — whole-row click target (stakeholder-requested amendment, 2026-07-17; S2)

Clicking ANYWHERE on a listing row selects it — today only the name `<a>` carries the
handler (`BrowseListing.tsx:523`, everything else in the row is inert). The row `<tr>`
gains a click handler with the SAME semantics as `handleRowClick` (`:244-259`), by
direct implementation, NOT a synthetic `anchor.click()` (a synthetic click carries
`detail === 0`, which the existing handler deliberately reads as keyboard activation →
it would full-navigate on desktop — the wrong branch):

- Guard order mirrors the anchor handler: primary button only; any modifier key → no-op
  (a `<td>` has no native new-tab affordance to preserve — the name anchor keeps its
  modified-click/new-tab behavior untouched); a click whose target is inside an `<a>` or
  `<button>` → the tr handler yields (the anchor's own handler owns it; no double-fire).
- A click that concludes a text-selection drag (non-collapsed `window.getSelection()`)
  → no-op, so copying a value from a cell doesn't select the row.
- Split view: `onEntrySelect(slug)` — identical to a name click. Non-split (mobile):
  programmatic router navigation to the entity page — identical to the anchor's default.
- After a row-body click, move DOM focus to that row's name anchor so j/k continues from
  the clicked row (a name click already does this natively; the preview settle-timer's
  same-slug guard `:271-276` already absorbs the resulting `focusin`).
- `.codex-listing-row { cursor: pointer }`. No `role`/`tabindex` on the `<tr>` — the
  anchor stays the row's single focusable; this is a pointer-target widening only, the
  keyboard path is unchanged (R5 semantics untouched).

### D29-86 — `table-layout: fixed` + column width authority (windowing prerequisite)

- `table-layout: fixed` on `.codex-listing-table`; `columnDefs.tsx` gains a per-column
  `width` (`ch`-based; the established `.codex-listing-col-{key}` class convention is the
  delivery mechanism — only 3 consumers repo-wide, §6 V-OK). Data-column widths chosen from
  a one-time 99th-percentile value-width measurement against the real corpus (**measure,
  don't guess**). Fixed cells: `overflow: hidden; text-overflow: ellipsis`, nowrap stays.
- **The `.codex-listing-col-name { width: 100% }` rule is DELETED** (review M5): under
  fixed layout an explicit 100% + explicit `ch` siblings over-constrains the algorithm
  (engine-inconsistent proportional scaling, NOT "name takes remainder"). Name gets **no
  declared width** — the fixed-layout remainder rule does the work.
- **R6 (stakeholder-RESOLVED):** the name column goes **single-line: nowrap + ellipsis +
  `title` attribute** (was `white-space: normal` two-line wrap — a wrapped row would break
  the constant-pitch invariant and silently desync all spacer/scroll math below it). Gate:
  **zero wrapped/clipped-to-two-line rows** — proven with the longest real corpus name
  (41 chars) + collision suffix at the narrowest engaged FULL-tier width (P8's 416 px
  worst case).

### D29-87 — scroll restoration + count invariants

- Total scroll height constant (count × pitch) → router `scrollRestoration` keeps working
  for SPA back-nav; the RELOAD path is D29-84's synchronized-seed + gate. Gate: browse →
  scroll deep → entity page → back → same rows, AND scroll deep → tab reload → same rows.
- "N of N shown" unchanged — counts the array (loader counts until the full array lands,
  D29-89), not the DOM (R3).

### D29-88 — perf gates (the point of the round)

Probe method: headless Chromium, 4× CPU throttle, buffered long-task observer, through the
LIVE edge post-deploy; before = the dedupe-only baseline recorded above.

- **/feat decoded HTML ≤ 600 KB without `?entry=`** (shell + 60 rows + ≤60-row dehydration
  payload; was 7.16 MB); with `?entry=` adds only the entity pane (heaviest real feat
  entity 35.7 KB JSON — not a budget risk, §6 V-OK). gz proportionate.
- **/feat main-thread-quiet ≤ 1.2 s at 4× throttle** (from ~3.8-4.5 s); **DCL ≤ 800 ms**
  (from ~2.8-3.3 s). /spell proportionate (quiet ≤ 1 s). No regression on `/` and `/rules`.
- Full-row fetch (D29-89) must not push interaction readiness past the quiet gate — the
  probe records fetch-complete time too.

## 3. Slices

- **S1 — the virtualized table + data split:** dep add; row CSS tightened to a true 24 px +
  real-browser drift-guard; `ListingTable` windowing (spacers-on-`<td>`, overscan 20, slug
  keys, aria-rowcount/rowindex); D29-86 fixed layout + measured `ch` widths + name-column
  nowrap/ellipsis + `width:100%` deletion; D29-84 derived-window SSR + range unit test;
  D29-89 loader projection + post-hydration full fetch; content-visibility deletion;
  hydration-zero sweep. CI green both lanes.
- **S2 — interaction parity:** D29-85 slug-persisted j/k/Enter/preview-follow +
  focus-after-mount; D29-84 deep-link centering + restoration precedence + the
  reload-at-depth synchronized seed; **D29-90 whole-row click target**; Playwright:
  frontier j/k, Enter-opens, preview-follows-focus, deep-link-centers,
  wheel-unmount-then-j/k resume, scroll-deep-reload no-flash, cold-load frontier nav
  (D29-89 fetch race), row-body click selects / text-drag doesn't / anchor
  modified-click unaffected.
- **S3 — sweep + deploy:** A-style sweep (hydration-zero 8 routes, sorted-URL SSR proof
  via the `grep -a` method, mobile 0 h-scroll incl. a touch-fling overscan check — review
  N-mobile), weights, README P9 section, spec §7 build record, `just up`, edge probes
  before/after, memory update.

## 4. Acceptance gates

- **A. Hydration:** zero hydration errors on the 8-route sweep incl. `?entry=`, a sorted
  URL, a filtered URL; PLUS the S1 range unit test proving server pass == client first pass
  == `[0, 60)`.
- **B. SSR order:** a `?sort=` deep link SSRs exactly its first 60 rows in sorted order
  (`grep -a`; React SSR `<!-- -->` separators defeat naive greps).
- **C. Interaction parity:** j/k walks beyond row 60 on a COLD load (frontier mounts +
  focuses; full-array fetch race covered); Enter opens; preview-follow updates `?entry=`
  replace-only, zero history growth; row click ≠ listing re-fetch; wheel-scroll past the
  focused row then j/k resumes from the persisted slug (no snap-to-top); a click on any
  non-anchor cell selects the row and moves focus to its anchor (D29-90), a
  text-selection drag does not, and a ctrl/cmd-click on the name anchor still opens a
  new tab.
- **D. Deep link:** `/feat?entry=<row ~#7000 by current sort>` SSRs the entry pane AND
  centers the row post-mount; back-nav restoration wins over centering.
- **E. Scroll restoration:** SPA back-nav AND tab-reload at depth both restore to real rows
  (no blank-spacer flash beyond one frame).
- **F. Perf:** D29-88 numbers met through the live edge, dedupe-baseline before/after
  recorded, full-row fetch-complete time recorded.
- **G. No-regression:** column widths stable during scroll (no jitter); zero wrapped name
  rows at 416 px FULL-tier width with the longest corpus name + collision suffix; row
  height exactly 24.00 px at both tiers (drift-guard); mobile ≤56 rem clean, 0 h-scroll;
  hairline/hover/selected-ribbon visuals unchanged on mounted rows; both CI lanes green;
  hermeticity (no test touches the real corpus — the drift-guard and width measurements run
  against fixtures/local build, with the corpus-derived `ch` values checked in as
  constants).

## 5. Non-goals / risks

- **Non-goals:** `/search`/`/rules`/`/sources`; filter/sort/URL-codec semantics; the P8
  column REGISTER (sets/labels/comparators); pagination; further dehydration-payload work
  beyond D29-89 (e.g. binary formats).
- **Risk — hydration mismatch** stays the named class; mitigations are now mechanical
  (derived identical initialRect/offset, scrollMargin-0 first pass, range unit test).
- **Risk — D29-89 fetch window:** a user filtering within ~300 ms of a cold load sees
  results only when the array lands; recorded for gate H, judged imperceptible.
- **Risk — focus timing:** slug-persisted state + rendered-range-keyed focus; Playwright C
  covers frontier + wheel-unmount.
- **Accepted + recorded for gate H:** Ctrl+F categorical (R2), count-vs-DOM gap (R3),
  Tab-reach narrowing w/ ARIA compensation (R5), name-column single-line (R6), the D29-89
  fetch window.

## 6. Adversarial review record (2026-07-17, two independent lenses, pre-build)

**Mechanics lens — NOT-READY → folded:** B1 router dehydration ships the full row array
(measured 2,264,706 B live = 31.7% of post-dedupe /feat; `dehydrateMatch` unconditional) →
NEW D29-89 + byte gate rewritten 1.5 MB → 600 KB. B2 SSR_WINDOW=60 was asserted not
derived; `overscan` applies to BOTH passes → D29-84 formula (`initialRect.height = 40 ×
pitch`, window = output) + range unit test; pitch input corrected to the live-measured
23.94 px reality → D29-83 tighten-CSS-to-true-24 + real-browser drift-guard (M4, the
proxy-pin class — the token-parse guard would have guarded the proxy). M3 `scrollMargin`
required + dynamic → measured post-hydration, 0 on both first passes. M5 `.codex-listing-
col-name{width:100%}` over-constrains fixed layout → deleted, name = undeclared remainder.
N6 spacer height on `<td>` not `<tr>`. N7 aria-hidden spacer AT footnote → absorbed by R5.
**Verified-OK:** `useWindowVirtualizer` SSR mechanism real (initialRect/initialOffset
fallback chain confirmed in virtual-core source); dedupe zero-conflict; ColumnDef.width 3
consumers; entry-pane weight not a risk (heaviest feat entity 35.7 KB).

**Interaction lens — NOT-READY → folded:** B1 focus-loss-on-wheel-unmount (activeElement→
body → j/k snaps to row 0) → D29-85 slug-persisted state, activeElement never
source-of-truth. B2 reload+scroll-restoration race (restoration's layout-effect `scrollTo`
fires before the virtualizer recomputes → blank-spacer flash; ssrSmoke structurally blind)
→ D29-84 synchronized seed + reload-at-depth Playwright gate (E). B3 Tab-reach was bundled
as pre-approved but wasn't an R-item → asked; **R5 resolved: accept + aria-rowcount/
rowindex**. B4 name-column wrap breaks the constant-pitch invariant (41-char corpus names
verified) → asked; **R6 resolved: single-line + ellipsis** + zero-wrap gate. M index/slug
reconciliation tension → slug wins, absent-slug = unfocused. M aria row semantics →
absorbed into R5. M j/k alignment unpinned → `auto` ordinary / `center` deep-link. N mobile
fling overscan → S3 touch-emulation check. **Verified-clear:** no nth-child zebra on the
listing table (spacer-safe); no renderer golden covers listing rows; filter-shrink scroll
clamp predates windowing; row pitch has no mobile media-query override.

## 7. Build record

_(to be filled)_
