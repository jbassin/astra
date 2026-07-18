# 0029 P9 — listing windowed virtualization (spec)

**Status:** DRAFT (2026-07-17, pre-adversarial-review)
**Scope doc:** `thoughts/shared/research/2026-07-17-codex-0029-p9-virtualization-thoughts.md`
(R1–R4 stakeholder-resolved 2026-07-17: option A windowed virtualization chosen; Ctrl+F and
"N of N shown" trade-offs accepted; D29-35 full-rows-client-side DATA decision untouched).
**Change class:** render/client-only. No transform, no corpus regen, no Pagefind reindex.
Deploy = `just up` only.
**Ordering:** builds ON TOP of the same-day SVG `<symbol>`/`<use>` dedupe slice (lands first;
its /feat weights are this spec's "before" baseline for gate P1).

## 1. Goal

Kill the /feat-class parse+hydrate cost (8,485 SSR'd + hydrated `<tr>`s → 2.8 s parse +
~1 s hydrate at 4× CPU throttle) by rendering listing rows as a **window** over the in-memory
row array: SSR ships only the first-window rows; the client mounts only what's visible plus
overscan. Row DATA stays fully client-side (D29-35 untouched); sort/filter/count/split-view
semantics are byte-for-byte preserved; j/k changes mechanism (index-based) but not behavior.

## 2. Decisions

### D29-83 — windowed virtualization of `BrowseListing`'s table (R1)

- **New dependency: `@tanstack/react-virtual`** (same vendor family as the pinned
  `@tanstack/react-router`/`react-start`; nothing in `pnpm-lock.yaml` provides windowing
  today). Caret-range like the other TanStack deps.
- **Window-scroll, fixed-size:** `.codex-listing-pane` has no overflow — the DOCUMENT scrolls
  (`globals.css:943-945`) → `useWindowVirtualizer`. Row pitch is already pinned by
  `--density-row-pitch` (24 px, `tokens.css`) → constant `estimateSize`, **no per-row
  measurement**. A shared `ROW_PITCH_PX` TS constant becomes the one JS-side authority, with a
  **drift-guard test** asserting it equals the CSS token's value (parse `tokens.css` in the
  test — the P8 pitch and this constant must never diverge silently).
- **Applies to ALL category listings uniformly** (one code path; virtualizer overhead on a
  40-row category is nil). `/search`, `/rules`, `/sources` untouched (own components,
  10–100× smaller).
- **In-table windowing via spacer rows:** the register stays a real
  `<table>`/`<thead>`/`<tbody>` (P8 D29-78 semantics). `<tbody>` renders: one top spacer
  `<tr>` (height = `start × pitch`), the mounted window rows, one bottom spacer `<tr>`
  (height = `(total − end) × pitch`). Spacer rows are borderless/padding-less (hairlines live
  on `.codex-listing-row`, untouched) and `aria-hidden`. Row `key` stays the entity slug —
  stable identity as the window moves. Transform-positioned rows are NOT used
  (`border-collapse: collapse` + absolutely-positioned `<tr>`s don't compose).
- **Overscan: 20 rows** each side (≈ one extra screen at 24 px pitch/30-row screens).
- **Per-row `content-visibility: auto` + `contain-intrinsic-size` are DELETED** from
  `.codex-listing-row` — redundant under windowing (≤ ~90 mounted rows), and it removes the
  Chromium-only half-working find-in-page middle state; R2 accepted the categorical behavior.
  `--density-row-pitch` itself SURVIVES (it's now the virtualizer's size authority).

### D29-84 — SSR window determinism + hydration-zero (the risk center)

- **SSR renders rows `[0, SSR_WINDOW)` in the URL's sort order** (the P8 gate-C "SSR to the
  same order" bar carries over verbatim) + the bottom spacer sized `(total − SSR_WINDOW) ×
  pitch` — so the document arrives with its full, final scroll height. `SSR_WINDOW = 60`
  (≈ two 30-row screens; covers first paint + overscan at every desktop viewport).
- **The client's FIRST render must reproduce the identical range** — zero hydration mismatch
  is a hard gate (this repo has caught two at-HEAD hydration classes before; a virtualizer
  whose server pass computes a different range than the client's first pass is the classic
  third). Mechanism is the engineer's choice, sanctioned options: pin the virtualizer's
  `initialRect`/initial offset so both passes compute `[0, SSR_WINDOW)`, OR branch — server
  renders the range directly without the hook, client's virtualizer is configured to emit the
  same first range before its first real measurement. Whichever is chosen, the ssrSmoke sweep
  must show **zero hydration errors on all 8 sweep routes** (P8 S4 pattern).
- **Deep links:** `?entry=` targeting a row beyond the initial window → post-mount
  `scrollToIndex(target, align: "center")`, after which focus/preview mechanics see a real
  mounted anchor. (Small deliberate improvement: today a deep-linked row can sit off-screen;
  recorded as engineering-decidable in the scope doc.) `?sort=`/facet params in the URL
  determine the SSR window's CONTENT (sorted/filtered order first), same as today.

### D29-85 — j/k, Enter, preview-follow: index-based mechanism, identical behavior (P8 D29-82 carry)

- The real-DOM `querySelectorAll(ROW_ANCHOR_SELECTOR)` walk (`BrowseListing.tsx:308-344`)
  becomes an **active-index model over the `visible` array**: j/k moves the index,
  `scrollToIndex` guarantees the target row is mounted, then the row's anchor receives real
  `.focus()` (post-render effect — never a bare rAF race; hook into the virtualizer's
  rendered-range change).
- **Unchanged:** native `focusin` preview-follow (`:261-297` — mounted rows are real anchors),
  Enter = native activation with the `e.detail === 0` fall-through (`:244-259`), the 180 ms
  settle + replace-only `?entry=` write, the hint line, zero history growth.
- **Recorded narrowing:** Tab reaches only mounted-window anchors (was: all 8,485). j/k is
  the sanctioned traversal; accepted alongside R2/R3.

### D29-86 — `table-layout: fixed` + column width authority (windowing prerequisite)

- Today's table is AUTO layout, no widths, `white-space: nowrap` — under windowing, only
  mounted rows would feed column sizing → **widths jitter as the window scrolls. Mandatory:**
  `table-layout: fixed` on `.codex-listing-table`; `columnDefs.tsx` gains a per-column
  `width` field (`ch`-based for data columns — level/price/rank etc. are near-constant width;
  the NAME column takes the remainder). FULL/COMPACT tiers keep their existing column sets;
  widths defined per column, tiers just include/exclude columns as today.
- Fixed cells get `overflow: hidden; text-overflow: ellipsis` so a rare long value truncates
  instead of breaking layout (nowrap stays). Column proportions therefore change slightly vs
  auto-sizing — a small visible delta on a stakeholder-reviewed surface, recorded; the gate is
  a screenshot check that nothing truncates in the common case (99th-percentile value widths
  per column measured from the real corpus once, in-slice, to choose the `ch` values —
  **measure, don't guess: the proxy-pin lesson**).

### D29-87 — scroll restoration + count invariants

- Total scroll height is CONSTANT (count × pitch, spacers included) → the router's existing
  `scrollRestoration` (`router.tsx:38`) keeps working: back-nav restores the offset, the
  virtualizer renders the window at that offset. Gate: browse → scroll deep → open an entity
  page → back → same rows visible.
- "N of N shown" (`visible.length`/`eligibleCount`, `:350-353`) unchanged — counts the array,
  not the DOM (R3 accepted the perceptual gap).

### D29-88 — perf gates (the point of the round)

Measured with the session's probe method (headless Chromium, 4× CPU throttle, buffered
long-task observer, through the LIVE edge post-deploy; probe scripts from the scratchpad are
re-created in-slice under `apps/codex/scripts/` if not already present):

- **/feat decoded HTML ≤ 1.5 MB** (from 8.04 MB; window rows + entry pane + shell — the entry
  pane's SSR'd entity content is the irreducible remainder), gz proportionate.
- **/feat main-thread-quiet ≤ 1.2 s at 4× throttle** (from 3.77 s); **DCL ≤ 800 ms** (from
  2.85 s). /spell proportionate (quiet ≤ 1 s from 1.57 s).
- No regression on `/` and `/rules` (already fast).
- Numbers recorded in §7 build record + the memory, with the dedupe-only baseline captured
  first (so the two rounds' contributions stay separable).

## 3. Slices

- **S1 — the virtualized table:** dep add; `ListingTable` windowing (spacers, overscan,
  slug keys); `ROW_PITCH_PX` + drift-guard test; D29-86 fixed layout + measured `ch` widths;
  D29-84 SSR window + hydration-zero on the sweep routes; content-visibility deletion; unit
  tests (window math, spacer heights, SSR range determinism). CI green both lanes.
- **S2 — interaction parity:** D29-85 index-based j/k/Enter/preview-follow + focus-after-mount;
  D29-84 deep-link `scrollToIndex`; D29-87 scroll-restoration proof; Playwright coverage of
  j/k walk across the window frontier, Enter-opens, preview-follows-focus, deep-link-centers.
- **S3 — sweep + deploy:** full A-style sweep (hydration-zero 8 routes, sorted-URL SSR proof,
  mobile 0 h-scroll, weights), README P9 section, spec §7 build record, `just up`, edge-probe
  before/after table, memory update.

## 4. Acceptance gates

- **A. Hydration:** zero hydration errors/warnings on the 8-route sweep (P8 S4 pattern), incl.
  `/feat?entry=…`, a sorted URL, and a filtered URL.
- **B. SSR order:** a `?sort=` deep link SSRs its first `SSR_WINDOW` rows in sorted order
  (grep the raw HTML — `grep -a`; React SSR `<!-- -->` separators defeat naive greps, use the
  P8-established method).
- **C. Interaction parity:** j/k walks beyond the SSR window (frontier mounts + focuses);
  Enter opens the focused row; preview-follows-focus updates `?entry=` replace-only with zero
  history growth; row click ≠ listing re-fetch (memoizedListing untouched).
- **D. Deep link:** `/feat?entry=<row #7000 by current sort>` SSRs the entry pane content AND
  centers the row post-mount.
- **E. Scroll restoration:** deep-scroll → navigate → back → same window visible.
- **F. Perf:** D29-88 numbers met through the live edge, before/after recorded.
- **G. No-regression:** column widths stable during scroll (no jitter — the D29-86 point);
  mobile (≤56 rem, entry pane hidden) scrolls clean with 0 horizontal scroll; hairlines/
  hover/selected-ribbon visuals unchanged on mounted rows; both CI lanes green; hermeticity
  (no test touches the real corpus).

## 5. Non-goals / risks

- **Non-goals:** `/search`/`/rules`/`/sources` lists; any filter/sort/URL-codec change; the
  P8 column REGISTER (sets/labels/comparators — only widths gain an authority); pagination;
  the SVG dedupe (separate, already landing).
- **Risk — hydration mismatch** is the named failure class (two prior at-HEAD catches in this
  app); D29-84's zero-tolerance gate + the sanctioned deterministic-range mechanisms are the
  mitigation.
- **Risk — focus timing:** focus-after-mount must key off the virtualizer's rendered range,
  not a timer; Playwright C covers the frontier case.
- **Risk — find-in-page + Tab-reach narrowing:** accepted (R2 + D29-85), recorded here so
  gate H sees it.

## 6. Adversarial review record

_(to be filled — two independent lenses, pre-build)_

## 7. Build record

_(to be filled)_
