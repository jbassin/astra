// P9 S1 (D29-83/-84/-89) — the listing table's windowing constants + the
// SERVER-SIDE derivation both `routes/$category/index.tsx`'s loader and
// `ListingTable`'s own `useWindowVirtualizer` call share. Nothing here is
// React/DOM-specific (`@tanstack/react-virtual` re-exports the headless
// `@tanstack/virtual-core` `Virtualizer` class, constructible with no real
// scroll element at all) — the SAME code path proves the "server pass ==
// client first pass" claim gate A needs, rather than two hand-maintained
// arithmetic copies that could drift apart.

import { Virtualizer } from "@tanstack/react-virtual";

import type { IndexRow } from "@/schema/entity";

import { columnsFor, comparatorForSort } from "./columnDefs";
import { applyFilters, sortRows } from "./filterEngine";
import { searchToFilterState, type BrowseSearch } from "./urlState";

/** D29-83 — the live-measured, CSS-tightened row height (was the token's
 * un-true "≈24px" — P8 measured 23.94px live; `globals.css`'s
 * `.codex-listing-table`/`.codex-listing-row` rules are tuned so the REAL
 * rendered border-box height is exactly this, proven by the drift-guard). */
export const ROW_PITCH_PX = 24;

/** D29-84 — "40 visible rows" is the INPUT the initial viewport height is
 * derived from, not a standalone constant on its own; `INITIAL_VIEWPORT_PX`
 * below is the one both passes' `initialRect.height` actually carries. */
const INITIAL_VIEWPORT_ROWS = 40;

/** `initialRect = { width: 0, height: 40 × ROW_PITCH_PX }` — identical on the
 * server pass and the client's FIRST pass (before any real `ResizeObserver`/
 * window-rect measurement has landed), per D29-84. */
export const INITIAL_VIEWPORT_PX = INITIAL_VIEWPORT_ROWS * ROW_PITCH_PX; // 960

/** D29-83 — "overscan: 20", applied on BOTH passes (adversarial review B2 —
 * the pre-review draft only asked for the 40 visible rows, silently
 * OMITTING overscan from the SSR side; the real virtualizer applies it to
 * every pass identically, so this constant is shared, not re-declared). */
export const OVERSCAN = 20;

/**
 * D29-84 — runs the REAL `@tanstack/virtual-core` `Virtualizer` through a
 * "server-like pass" (no `getScrollElement`/`observeElementRect`/
 * `observeElementOffset` ever fires — verified against the pinned
 * `@tanstack/virtual-core@3.17.4` source: `getSize()`/`getScrollOffset()`
 * fall back to `initialRect`/`initialOffset` whenever `scrollRect`/
 * `scrollOffset` are still null, exactly the SSR/pre-mount state) with the
 * SAME `count`/`estimateSize`/`overscan`/`initialRect`/`initialOffset`/
 * `scrollMargin: 0` options `ListingTable`'s own `useWindowVirtualizer` call
 * uses for its first render — so this function's OUTPUT is the proof the
 * window is DERIVED, not asserted: change `INITIAL_VIEWPORT_ROWS`/
 * `ROW_PITCH_PX`/`OVERSCAN` and the returned range moves with them,
 * `initialWindowRange.test.ts` merely observes the CURRENT output rather
 * than hardcoding the arithmetic a second time.
 *
 * Returns a slice-style `[startIndex, endIndex)` range (`endIndex`
 * EXCLUSIVE) — `count` real rows or fewer both slot straight into
 * `rows.slice(startIndex, endIndex)`.
 */
export function initialWindowRange(count: number): { startIndex: number; endIndex: number } {
  if (count <= 0) return { startIndex: 0, endIndex: 0 };
  const virtualizer = new Virtualizer<Window, Element>({
    count,
    estimateSize: () => ROW_PITCH_PX,
    overscan: OVERSCAN,
    initialRect: { width: 0, height: INITIAL_VIEWPORT_PX },
    initialOffset: 0,
    scrollMargin: 0,
    getScrollElement: () => null,
    observeElementRect: () => undefined,
    observeElementOffset: () => undefined,
    scrollToFn: () => {
      // never invoked in a server-like pass (no scroll ever happens) — a
      // required option on `VirtualizerOptions` regardless.
    },
  });
  const items = virtualizer.getVirtualItems();
  if (items.length === 0) return { startIndex: 0, endIndex: 0 };
  const first = items[0];
  const last = items[items.length - 1];
  return { startIndex: first?.index ?? 0, endIndex: (last?.index ?? -1) + 1 };
}

export interface WindowedCategoryListing {
  category: string;
  rows: IndexRow[];
  /** `visible.length` under `search`'s filter/sort state — the count line's
   * numerator (D29-87 R3: counts the ARRAY, not the mounted DOM) and the
   * virtualizer's own `count` option while the full array is still in
   * flight (D29-89's "full final scroll height on arrival"). */
  totalCount: number;
  /** Same "superseded-aware eligible" definition `BrowseListing.tsx`'s own
   * `useMemo` computes once the full array lands — duplicated here (not
   * imported) only because it's three lines of arithmetic over `rows`, not
   * worth a shared export for. */
  eligibleCount: number;
  /** Whether the requested `?entry=` row passes the CURRENT filter state —
   * `undefined` when no `entrySlug` was given. `BrowseListing.tsx`'s own
   * `entryVisible` normally derives from `rows.find(...)`, which only works
   * when `rows` is the FULL array; during the SSR-only windowed pass `rows`
   * is at most `SSR_WINDOW` items, so an entry sorted outside that slice
   * (e.g. deep-linking straight to row #4,200) would otherwise read as
   * "filtered out" even under NO active filter at all — a real bug found
   * live while verifying this slice (a fresh `?entry=` deep link
   * incorrectly rendered "isn't shown under the current filters"). Computed
   * here against the FULL `visible` array the loader already has on hand
   * (never shipped to the client in full), so it's correct regardless of
   * where the entry sorts. */
  entryVisible?: boolean;
}

/**
 * D29-89 — the route loader's SSR-only windowed projection: sort/filter
 * `rows` exactly the way `BrowseListing.tsx`'s own render-path does (same
 * pure functions, same inputs), then slice to `initialWindowRange`'s output
 * — so the dehydrated payload carries at most that many rows, in the URL's
 * real sort/filter order (gate B), while `totalCount`/`eligibleCount` still
 * reflect the FULL corpus so the count line and the bottom spacer are
 * correct on arrival, before the post-hydration full-array fetch
 * (`CategoryIndexComponent`'s own effect) ever lands.
 *
 * Pure — no corpus/fs/network access — so it's the same function BOTH the
 * server-only loader branch AND `virtualization.test.ts` (a synthetic,
 * >60-row, hermetic fixture — no real corpus touched, gate G) exercise.
 *
 * `entrySlug` is the raw `?entry=` id SEGMENT (same format as
 * `BrowseListing.tsx`'s own `rowSlug()`) — optional, since most windowed
 * loads carry no split-view selection at all.
 */
export function computeWindowedListing(
  category: string,
  rows: readonly IndexRow[],
  search: BrowseSearch,
  entrySlug?: string,
): WindowedCategoryListing {
  const state = searchToFilterState(search);
  const cols = columnsFor(category, rows);
  const sortDesc = state.sort.startsWith("-");
  const sortBaseKey = sortDesc ? state.sort.slice(1) : state.sort;
  const sortComparator =
    sortBaseKey === "name" || sortBaseKey === "level"
      ? undefined
      : comparatorForSort(cols, sortBaseKey);
  const visible = sortRows(applyFilters(rows, state), state.sort, sortComparator);
  const eligibleCount = state.superseded ? rows.length : rows.filter((r) => !r.superseded).length;
  const { startIndex, endIndex } = initialWindowRange(visible.length);
  const entryId = entrySlug !== undefined ? `${category}/${entrySlug}` : undefined;
  return {
    category,
    rows: visible.slice(startIndex, endIndex),
    totalCount: visible.length,
    eligibleCount,
    entryVisible: entryId !== undefined ? visible.some((r) => r.id === entryId) : undefined,
  };
}
