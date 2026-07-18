# codex 0029 P9 — listing virtualization (scope)

**Date:** 2026-07-17 · **Status:** RESOLVED (stakeholder picked windowed virtualization same day)
**Provenance:** stakeholder report "the website is very slow to load, like multiple seconds" against
the live P8 site. Measured root cause + a two-track response (SVG dedupe + this round) both
stakeholder-directed 2026-07-17.

## 1. The measured problem

Server and edge are NOT the problem (TTFB 45–275 ms on every route through `codex.iridi.cc`;
gzip on — /feat transfers 580 KB). The cost is browser main-thread work on the big SSR'd
category listings:

| route | decoded HTML | DCL (4× CPU throttle) | main-thread quiet | wall |
|---|---|---|---|---|
| `/` | 12 KB | 36 ms | 157 ms | 1.7 s |
| `/spell` | 2.7 MB | 1,130 ms | 1,570 ms | 3.1 s |
| `/feat` | 7.9 MB | 2,847 ms | 3,769 ms | 5.4 s |

(Playwright headless Chromium, `Emulation.setCPUThrottlingRate 4` ≈ mid-range laptop; long-task
observer buffered; worst /feat tasks 1,342 ms = HTML parse, 888 ms = hydration.)

Two independent components:
1. **Parse** — 8,485 `<tr>`s (8.04 MB decoded) must become DOM nodes before first paint.
   P8's per-row `content-visibility: auto` (`globals.css:1211-1219`) skips layout/paint only —
   it cannot skip parse or hydration.
2. **Hydrate** — codex is stock TanStack Start full-document SSR + full-document `hydrateRoot`
   (`vite.config.ts:34`, no custom entries); React walks every SSR'd row node. No subtree-skip
   primitive exists in the app.

A separate same-day slice (SVG `<symbol>`/`<use>` dedupe — 8,332 inline SVGs = 2.69 MB of /feat,
5 distinct shapes) attacks the parse term only; it cannot touch hydration and leaves row count
intact. This round is the structural fix.

## 2. Options evaluated (read-only research agent vs the real repo, file:line-cited)

- **A. Windowed virtualization** (`@tanstack/react-virtual`, new dep — zero matches in
  `pnpm-lock.yaml` today): SSR ~first-screen rows only; client renders a window over the
  in-memory row array. Large parse AND hydrate savings; reworks j/k to index-based focus,
  needs SSR-window determinism for `?entry=`/`?sort=` deep links. M-L.
- **B. Progressive/idle chunked append:** SSR first N, client appends rest at idle. Smallest
  blast radius, but the DOM still eventually holds all 8,485 rows (total main-thread work
  similar, just deferred) and bytes-in-DOM stay maximal. S-M.
- **C. Static rows without hydration:** REJECTED — React has no subtree-hydration-skip; honest
  version = hand-rolled event delegation + manual HTML re-injection per sort/filter, and it
  pressures server-side filter/sort, which would reopen settled D29-35.
- **D. Pagination:** last resort — reopens the P8 flat-table browse model for an engineering
  problem A/B solve without touching product surface.

## 3. RESOLVED — stakeholder decisions (2026-07-17, in-chat)

- **R1: Option A — true windowed virtualization.** ("lets do 2" against the ranked
  recommendation of B-then-A; the stronger fix chosen directly.)
- **R2: Ctrl+F trade-off ACCEPTED** — unmounted rows are not findable via native find-in-page.
  (Already imperfect today under `content-visibility`; windowing makes it categorical.)
- **R3: "N of N shown" perceptual trade-off ACCEPTED** — the count line keeps reporting the
  full filtered count while the DOM holds only the window.
- **R4 (standing, untouched): D29-35 "full rows client-side, filter locally" stays** — the row
  DATA remains fully client-side; only DOM materialization changes. Sort/filter/count/
  `?superseded=`/split-view-loader all operate on the in-memory array and are unaffected
  (verified: `filterEngine.ts:205-207,274+`, `BrowseListing.tsx:207-215,350-353`,
  `listingClient.ts:29-88`).

## 4. Load-bearing structural facts (verified against the repo, not the research report)

- **The document scrolls, not the pane.** `.codex-listing-pane` has no `overflow`
  (`globals.css:943-945`); `.codex-entry-pane` is the sticky/overflow one. → window-scroll
  virtualization (`useWindowVirtualizer`), not element-scroll.
- **Fixed row pitch already exists and is authoritative:** `--density-row-pitch` (24 px)
  drives both row padding targets and `contain-intrinsic-size` (`globals.css:1146-1219`).
  → fixed-size virtualization (constant `estimateSize`, no per-row measurement), and total
  scroll height (count × pitch) is CONSTANT — scroll restoration and spacer math stay exact.
- **The table today is AUTO layout with `white-space: nowrap` and no column widths**
  (`.codex-listing-table`, `columnDefs.tsx` has no width fields). Under windowing, only
  mounted rows feed auto column sizing → widths would jitter as the window scrolls.
  → `table-layout: fixed` + explicit per-column widths become mandatory (a small visible
  change to column proportions; engineering-decidable, recorded here).
- **j/k + preview-follow are real-DOM mechanisms** (`ROW_ANCHOR_SELECTOR` querySelectorAll walk
  `BrowseListing.tsx:308-344`, native `focusin` `:261-297`, Enter `e.detail===0` `:244-259`) —
  must become index-based over the `visible` array, driving `scrollToIndex` then focusing the
  mounted anchor. Behavior (j/k moves, Enter opens, preview follows) unchanged; mechanism only.
- **Search is uncoupled:** the exact-name boost hydrate-window-60 is Pagefind-side
  (`pagefindClient.ts:178-286`); `/search` uses its own results list, not `BrowseListing`.
- **noindex three layers** (`__root.tsx:37` + robots.txt + Caddy header, ssrSmoke-asserted) —
  SSR'd rows carry zero SEO value; shrinking the SSR window is free of SEO consequence.

## 5. Out of scope

- The SVG dedupe (separate slice, same day, landing first).
- Any change to filter/sort semantics, URL codecs, the P8 column register, or the split-view
  loader contract.
- `/search`, `/rules`, `/sources` (their lists are 10–100× smaller; virtualize only the
  category listings' `BrowseListing`).

**→ Spec:** `thoughts/astra/specs/0029-codex-p9-virtualization-spec.md` (D29-83..88).
