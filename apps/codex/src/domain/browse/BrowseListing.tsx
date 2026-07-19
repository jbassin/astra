import { useWindowVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactElement,
  type RefObject,
} from "react";

import { displayCategoryName } from "@/domain/render/displayCategoryName";
import { EntityRenderPane } from "@/domain/render/EntityRenderPane";
import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { IndexRow } from "@/schema/entity";
import type { EntityPageData } from "@/server/entityPageData";
import { Button, EditionIcon, Input } from "@/ui";
import { cx } from "@/ui/cx";

import { activeFilterPills } from "./activeFilterPills";
import {
  columnsFor,
  comparatorForSort,
  NARROW_CONTAINER_WIDTH_PX,
  type ColumnDef,
} from "./columnDefs";
import { BrowseEmptyState } from "./EmptyState";
import { FacetPanel } from "./FacetPanel";
import {
  applyFilters,
  clearAllFilters,
  collidingNames,
  setQuery,
  setSort,
  sortRows,
  type BrowseFilterState,
} from "./filterEngine";
import { initialWindowRange, INITIAL_VIEWPORT_PX, OVERSCAN, ROW_PITCH_PX } from "./virtualization";

export type FilterStateUpdater = (updater: (prev: BrowseFilterState) => BrowseFilterState) => void;

/** P4.5 S4 (D29-49) — the split view is only live at/above this width; below
 * it row taps fully navigate instead (the CSS breakpoint, `globals.css`'s
 * `.codex-browse-layout`, uses the mirrored `max-width: 56rem` — a hair
 * below this so the two never disagree at exactly 56rem). Read at CLICK
 * time (never at render time), so the row markup itself never differs
 * between desktop/mobile — "one component, one breakpoint-gated behavior
 * branch, not two components" (spec's own text). */
const SPLIT_VIEW_MEDIA = "(min-width: 56.0625rem)";

/** P8 S3 (D29-82) — how long a j/k-focused row must "settle" before its
 * `?entry=` preview commits, mirroring `Omnibar.tsx`'s own `DEBOUNCE_MS`
 * (that file's own module-scope constant isn't exported — this is the same
 * value, independently named for this file's own debounce). Holding `j`
 * across many rows must produce exactly ONE commit after the LAST keypress,
 * never one per row. */
const FOCUS_SETTLE_MS = 180;

/** Row-anchor selector shared by the focus-follow listener and the P9 S2
 * (D29-85) slug->anchor lookup below — every row's name cell renders exactly
 * one such anchor (`displayName()` below), tagged with `data-entry-slug` so
 * neither caller needs to re-derive `rowSlug` from the DOM. */
const ROW_ANCHOR_SELECTOR = ".codex-listing-name";

/** P9 S2 (D29-85) — resolves a row's anchor by SLUG, never by array index
 * into `document.activeElement`/a live NodeList: `focusedSlug` (persisted
 * React state, `BrowseListing`'s own) is the single source of truth for
 * "which row is active," and this is the one place that turns a slug back
 * into a real, currently-MOUNTED DOM node to move focus onto — returns
 * `false` (a no-op) when the row isn't in the mounted window yet, which the
 * caller (the rendered-range-keyed effect below) treats as "keep waiting,"
 * never a timer.
 *
 * `preventScroll: true` (orchestrator review): a bare `.focus()` on an
 * off-viewport element makes the browser scroll it into view — and the
 * focus-after-mount effect deliberately fires on EVERY rendered-range
 * change, including a wheel-scroll bringing the persisted row back toward
 * the window, where it MOUNTS while still up to OVERSCAN×pitch (~480px)
 * OUTSIDE the viewport. Without this flag, that remount's focus call
 * yanked the scroll position out of the user's hands mid-wheel, against
 * their gesture. Safe for every caller: the j/k path's positioning is
 * already owned by `scheduleScrollToIndex(align:"auto")` (the target is
 * in-viewport before focus lands), the D29-90 row-click path's row is by
 * definition visible, and native Tab does its own scroll before the focus
 * event ever fires — positioning stays 100% the virtualizer's job; focus
 * is now side-effect-free. */
function focusAnchorForSlug(container: HTMLElement, slug: string): boolean {
  const anchors = container.querySelectorAll<HTMLAnchorElement>(ROW_ANCHOR_SELECTOR);
  for (const anchor of anchors) {
    if (anchor.dataset.entrySlug === slug) {
      if (document.activeElement !== anchor) anchor.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}

/**
 * P8 S1 (D29-78) — "the compact set applies whenever the LIST CONTAINER is
 * narrow ... via container query or measured width — keyed to the
 * container, never the viewport." A `ResizeObserver` on the listing pane
 * itself (not `window.matchMedia`) is what makes this genuinely
 * container-driven rather than viewport-driven: it's the ONE mechanism that
 * naturally covers every scenario the spec names — split view open (the
 * 416px pane), the 640–896px non-split band's narrow end, AND mobile —
 * without this component needing to know WHY its container is narrow.
 * `undefined`/no `ResizeObserver` (SSR, or a test env that doesn't polyfill
 * it) keeps the initial `false` (full set) — a safe, SSR-hydration-matching
 * default that only ever adjusts client-side, after mount, same posture as
 * `EntityRenderPane`'s own `useRouterState`-driven islands. */
function useNarrowListingContainer(ref: { current: HTMLElement | null }): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setNarrow(width < NARROW_CONTAINER_WIDTH_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return narrow;
}

/** Click-to-sort header cycle (D29-78): asc -> desc -> back to the name-asc
 * default. Switching to a DIFFERENT column always starts fresh at ascending
 * — only re-clicking the SAME already-active column advances the cycle. */
function nextSortForClick(current: string, key: string): string {
  const desc = current.startsWith("-");
  const base = desc ? current.slice(1) : current;
  if (base !== key) return key;
  return desc ? "name" : `-${key}`;
}

/**
 * D29-35 — the faceted `/{category}` listing island. Purely a function of
 * `state`/`rows`/`onStateChange` (no router/URL awareness of its own): the
 * ROUTE FILE (`routes/$category/index.tsx`) owns the URL<->state codec (P4.5
 * D29-48: a plain per-page `superseded` URL read, no site-wide toggle), so
 * this component stays directly render-testable with a plain
 * `BrowseFilterState` object — same posture as `listing.tsx`'s
 * presentational components over already-fetched data.
 *
 * P4.5 S4 (D29-49) — now a split-column view (except `rules`, which never
 * reaches this route at all — a static top-level route always out-ranks
 * `$category` for the literal path `/rules`, so no runtime guard is needed
 * here): the left pane is this same listing, narrower; the right pane is
 * the full entity render for `?entry=<slug>` (`entrySlug`/`entryData`,
 * resolved by the ROUTE's loader — this component never fetches). Row
 * click above `SPLIT_VIEW_MEDIA` intercepts into `onEntrySelect`; at/below
 * it, the row's own `<a href>` fully navigates to the canonical entity page
 * (unchanged markup, only the click handler's early-return differs) — see
 * `SPLIT_VIEW_MEDIA`'s own comment.
 */
export function BrowseListing({
  category,
  rows,
  totalCount,
  eligibleCountOverride,
  entryVisibleOverride,
  hiddenCountOverride,
  state,
  onStateChange,
  entrySlug,
  entryData,
  onEntrySelect,
  onEntryPreview,
  onSupersededReveal,
  restoredScrollY,
}: {
  category: string;
  rows: readonly IndexRow[];
  /** P9 S1 (D29-89) — `undefined` for every ordinary caller (SPA
   * navigations, tests): `rows` IS the full array, and the count line/
   * virtualizer both derive their totals from it locally, exactly as
   * before this slice. Set ONLY by the route while a cold load's SSR
   * window (`rows.length < totalCount`) hasn't been replaced by the full
   * array yet — the eventual TRUE row count under the current URL's
   * filter/sort, so the count line and the virtualizer's bottom spacer are
   * both correct on arrival (the router's D29-84 "full final scroll height
   * on arrival") instead of transiently reading `rows.length`. */
  totalCount?: number;
  /** Same pending-window override as `totalCount`, for the count line's
   * "of N" denominator (`eligibleCount`, below) — always supplied together
   * with `totalCount` or not at all. */
  eligibleCountOverride?: number;
  /** Same pending-window override, for whether the CURRENT `?entry=`
   * selection passes the active filters — `entryRow`/`entryVisible` below
   * normally derive from `rows.find(...)`, which is wrong while `rows` is
   * only the SSR window (a deep-linked entry sorted outside that window
   * would read as "filtered out" under NO active filter at all — found live
   * verifying this slice, `virtualization.ts`'s own doc comment on
   * `WindowedCategoryListing.entryVisible`). */
  entryVisibleOverride?: boolean;
  /** D29-111 (P11 S4) — same pending-window override pattern as
   * `eligibleCountOverride` above, for the reveal control's "N hidden"
   * total: a locally-computed count over ≤60 windowed rows is WRONG on a
   * cold load (see `virtualization.ts`'s own doc comment on
   * `WindowedCategoryListing.hiddenCount`). */
  hiddenCountOverride?: number;
  state: BrowseFilterState;
  onStateChange: FilterStateUpdater;
  /** The raw corpus id SEGMENT from `?entry=` (identical format to the
   * `/{category}/{slug}` route's own `slug` param) — `undefined` when no
   * split-view selection is active. */
  entrySlug?: string;
  /** The route loader's already-resolved `getEntityPage({category, slug:
   * entrySlug})` payload — `null` for a genuinely unknown slug, `undefined`
   * only alongside an `undefined` `entrySlug` (no fetch was attempted). */
  entryData?: EntityPageData | null;
  /** Desktop/tablet row click (D29-49): the ROUTE performs the actual
   * `navigate({search: {...search, entry: slug}})` non-replace push; this
   * component just reports which row's raw slug was clicked. */
  onEntrySelect: (slug: string) => void;
  /** P8 S3 (D29-82) — focus-follow preview: fired at most once per
   * `FOCUS_SETTLE_MS` settle window after DOM focus lands on a row anchor
   * (j/k or Tab), already deduped against the currently-shown `entrySlug`.
   * The ROUTE performs the actual `navigate({..., replace: true})` — same
   * "component reports, route navigates" split as `onEntrySelect`, but
   * REPLACE instead of push (never adds a history entry). */
  onEntryPreview: (slug: string) => void;
  /** D29-111 (P11 S4) — the superseded-reveal control's own navigate: the
   * ROUTE performs a FUNCTIONAL search merge (`search: (prev) => ({...prev,
   * superseded})`) with `resetScroll: false` — deliberately NOT routed
   * through `onStateChange` (which the general facet-write path uses,
   * ordinary `resetScroll: true` included): revealing/hiding superseded
   * rows isn't a new search, and jumping the user back to the top of a
   * long, already-scrolled listing just to widen the edition filter would
   * be jarring (measured, the review's own reasoning) — this is its own
   * "component reports, route navigates" callback, same split as
   * `onEntrySelect`/`onEntryPreview` above. */
  onSupersededReveal: (superseded: boolean) => void;
  /** P9 S2 (D29-84) — the current URL's window scroll-restoration entry
   * (`scrollY`), if TanStack's `useElementScrollRestoration` found one — the
   * ROUTE reads it (that hook needs real router context, which this
   * component deliberately doesn't have, see the file-level doc comment
   * above: "no router/URL awareness of its own," directly render-testable
   * with a plain state object) and passes down just the number this
   * component actually needs. `undefined` means "no restoration entry for
   * this URL" (a genuinely fresh arrival — see the mount-sync effect below,
   * which is also what every ordinary caller/test gets by not passing this
   * prop at all). */
  restoredScrollY?: number;
}): ReactElement {
  // Local echo of the quick-filter text so typing feels instant; the actual
  // filter state (and therefore the URL) updates on every keystroke too —
  // no debounce needed, `applyFilters` over a few thousand rows is well
  // under a frame (measured — see the spec's §5 F perf gate).
  const [queryText, setQueryText] = useState(state.query);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listingPaneRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrowListingContainer(listingPaneRef);
  const entrySlugRef = useRef(entrySlug);
  useEffect(() => {
    entrySlugRef.current = entrySlug;
  }, [entrySlug]);

  // Native `<dialog>` owns its own open/close semantics (Esc, backdrop via
  // the `::backdrop` pseudo-element, native focus-trap + focus-return) —
  // this effect is just the one-way React-state -> imperative-DOM bridge;
  // `onClose` (below) is the DOM -> React-state bridge for the Esc/backdrop
  // paths that don't go through our own "Filters"/"Done" buttons.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  // P8 S1 (D29-78) — the per-category column model, memoized on the same
  // (category, rows) pair `columnsFor` itself only needs (its two coverage
  // checks are computed once per listing here, not per row/render).
  const cols = useMemo(() => columnsFor(category, rows), [category, rows]);
  const visibleCols = useMemo(
    () => (narrow ? cols.filter((c) => c.compact) : cols),
    [cols, narrow],
  );

  const sortDesc = state.sort.startsWith("-");
  const sortBaseKey = sortDesc ? state.sort.slice(1) : state.sort;
  // "name"/"level" stay on `sortRows`'s own built-in path (no comparator);
  // everything else resolves against the CURRENT category's column set — a
  // miss (an inapplicable key, e.g. `?sort=hp` on `/spell`) yields
  // `undefined`, which `sortRows` treats as "fall back to name" (the
  // `SortMode` doc comment in `filterEngine.ts` spells out why this half of
  // the fallback lives here and not in `urlState.ts`).
  const sortComparator = useMemo(
    () =>
      sortBaseKey === "name" || sortBaseKey === "level"
        ? undefined
        : comparatorForSort(cols, sortBaseKey),
    [cols, sortBaseKey],
  );

  // P9 S1 (D29-89) — re-running `applyFilters`/`sortRows` over `rows` is
  // idempotent whether `rows` is the full array (ordinary case) OR the
  // route's SSR window (already filtered/sorted server-side by the SAME
  // pure functions, same `state` — filtering an already-filtered set with
  // an unchanged filter, or sorting an already-sorted one with an unchanged
  // sort, is a no-op): no special-casing needed here for the pending
  // window, only for the COUNTS below, which `rows.length`/`.filter(...)`
  // alone can't answer correctly while `rows` is still partial.
  const visible = useMemo(
    () => sortRows(applyFilters(rows, state), state.sort, sortComparator),
    [rows, state, sortComparator],
  );
  const collisions = useMemo(() => collidingNames(visible), [visible]);
  const localEligibleCount = useMemo(
    () => (state.superseded ? rows.length : rows.filter((r) => !r.superseded).length),
    [rows, state.superseded],
  );
  // D29-111 (P11 S4) — the reveal control's "N hidden" total: a fixed
  // per-category count, deliberately NOT keyed on `state.superseded` (unlike
  // `localEligibleCount` above) — see `virtualization.ts`'s own doc comment
  // on `WindowedCategoryListing.hiddenCount` for why this needs the same
  // override-prop treatment as `eligibleCount`.
  const localHiddenCount = useMemo(() => rows.filter((r) => r.superseded).length, [rows]);
  // D29-87 (R3) — "N of N shown" counts the ARRAY, not the mounted DOM;
  // `totalCount`/`eligibleCountOverride` (set by the route ONLY during the
  // D29-89 pending window) keep that count line reading the eventual TRUE
  // total immediately, instead of the transient `rows.length` the SSR
  // window alone would give.
  const displayTotalCount = totalCount ?? visible.length;
  const displayEligibleCount = eligibleCountOverride ?? localEligibleCount;
  const displayHiddenCount = hiddenCountOverride ?? localHiddenCount;
  const visibleIds = useMemo(() => new Set(visible.map((r) => r.id)), [visible]);
  const pills = useMemo(
    () => activeFilterPills(state, category, onStateChange),
    [state, category, onStateChange],
  );

  const entryRow = useMemo(
    () =>
      entrySlug !== undefined ? rows.find((r) => rowSlug(r, category) === entrySlug) : undefined,
    [rows, entrySlug, category],
  );
  // P9 S1 (D29-89) — `entryVisibleOverride` wins while present (the SSR
  // windowed pass, computed against the FULL corpus server-side); falls
  // back to the ordinary `rows`-derived check once it's gone (the full
  // array has landed, or this was never a windowed render at all).
  const entryVisible =
    entryVisibleOverride ?? (entryRow !== undefined && visibleIds.has(entryRow.id));

  // P9 S2 (D29-83/-84/-85) — the virtualizer now lives HERE, not inside
  // `ListingTable`: both D29-85 (slug-persisted j/k needs `scrollToIndex` +
  // the rendered range to know when a target row has mounted) and D29-84
  // (deep-link centering, reload-at-depth sync) are keyboard/router-level
  // concerns this component already owns, and `ListingTable` stays a plain
  // presentational renderer over the `virtualRows`/spacer arithmetic it's
  // handed. `tableRef` is created here and threaded down so the scrollMargin
  // measurement below can still read the real `<table>`'s document offset.
  const tableRef = useRef<HTMLTableElement>(null);
  // D29-83 (review M3) — `scrollMargin` = the table's own document-top
  // offset, ref-measured in a POST-hydration effect only: both the server
  // pass and the client's FIRST pass render with 0 (so the hydration ranges
  // agree byte-for-byte), and this effect's `setState` re-renders with the
  // true margin afterward — a client-only correction, never part of the
  // hydration comparison itself. P9 S2: promoted `useEffect` -> `useLayoutEffect`
  // (still strictly post-hydration-commit, so the hydration-mismatch
  // invariant above is untouched) so the D29-84 mount-sync effect below,
  // which depends on `scrollMargin` to compute correct pixel offsets, always
  // settles in the SAME pre-paint window — gate E's "no flash beyond one
  // frame" needs both corrections to land before the browser's first paint,
  // not across two.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: displayTotalCount,
    estimateSize: () => ROW_PITCH_PX,
    overscan: OVERSCAN,
    // D29-84 — identical on the server pass and the client's first pass;
    // only `scrollMargin` (above) ever differs, and only post-hydration.
    initialRect: { width: 0, height: INITIAL_VIEWPORT_PX },
    initialOffset: 0,
    scrollMargin,
    getItemKey: (index) => visible[index]?.id ?? index,
  });
  const virtualRows = virtualizer.getVirtualItems();

  // P9 S2 (D29-85) — a rAF-coalesced `scrollToIndex`: calling the virtualizer
  // once PER KEYDOWN (a rapid "j" burst — holding the key down produces
  // native OS key-repeat well over 30/s, verified against real Chromium) can
  // call `scrollToIndex` — and therefore `window.scrollTo` — more often than
  // the browser dispatches "scroll" events for them; `@tanstack/virtual-core`
  // only recomputes its rendered range (`getVirtualItems`) in response to an
  // ACTUAL "scroll" event (verified against the pinned `virtual-core@3.17.4`
  // source: `observeWindowOffset`'s handler is what calls `maybeNotify()` —
  // `scrollToIndex` itself just calls `scrollToFn`/schedules an rAF
  // reconcile, it never updates `scrollOffset`/notifies directly) — under a
  // fast-enough burst the mounted window can measurably get STUCK short of
  // the true target for a real, human-reachable span (found live driving
  // this exact case in Chromium while writing S2's own Playwright coverage:
  // a 160-keydown burst left the mounted range short and never recovered on
  // its own, even seconds later). Batching every keydown's target down to AT
  // MOST one real `scrollToIndex` call per animation frame (always the
  // LATEST target — never queued/coalesced-then-replayed) keeps pace with
  // what the browser can actually dispatch, and the ref-persisted target
  // (`focusedSlugRef`, above) means no intermediate keypress's INTENT is
  // ever lost even though most of them never place their own imperative
  // scroll call.
  const pendingScrollIndexRef = useRef<number | null>(null);
  const scrollRafIdRef = useRef<number | null>(null);
  const scheduleScrollToIndex = useCallback(
    (index: number) => {
      pendingScrollIndexRef.current = index;
      if (scrollRafIdRef.current !== null) return;
      scrollRafIdRef.current = requestAnimationFrame(() => {
        scrollRafIdRef.current = null;
        const target = pendingScrollIndexRef.current;
        pendingScrollIndexRef.current = null;
        if (target !== null) virtualizer.scrollToIndex(target, { align: "auto" });
      });
    },
    [virtualizer],
  );
  useEffect(
    () => () => {
      if (scrollRafIdRef.current !== null) cancelAnimationFrame(scrollRafIdRef.current);
    },
    [],
  );

  // P9 S2 (D29-84) — the mount-time precedence gate: a scroll-restoration
  // entry for this exact URL WINS over deep-link centering (back-nav/reload
  // returns where the user was; centering is for fresh arrivals only).
  // `initialScrollResolvedRef` — set exactly ONCE this decision is actually
  // MADE (not merely attempted) — is what keeps this a genuine "resolve once
  // on arrival" effect despite needing to run more than once: a fresh
  // `?entry=` deep link beyond row 60 is, on the client's FIRST hydration
  // pass, only present in the SSR-shipped WINDOW's `data.rows` (60 items —
  // `computeWindowedListing` never special-cases a deep entrySlug into that
  // slice, only `entryVisible` accounts for it), so `visible.findIndex(...)`
  // genuinely returns -1 on that first pass — a real bug found live running
  // this exact case in Chromium: keying this effect on `scrollMargin` alone
  // (as S2 first shipped it) meant that first `idx === -1` was FINAL, the
  // D29-89 post-hydration full-array fetch landing moments later never got a
  // second look, and the row never centered — `visible` (now also a
  // dependency) is what lets this effect get a SECOND chance once that fetch
  // actually lands, while the ref is what still stops it from re-centering
  // on every LATER `visible` change a filter/sort/j-k/click causes (D29-84's
  // own "centering is for fresh arrivals only") — `visible.length >=
  // displayTotalCount` is the signal that the full array has landed, so an
  // entrySlug that's STILL not found at that point is conclusively
  // unknown/filtered-out (not just "hasn't arrived yet"), and the ref locks
  // in either way.
  const initialScrollResolvedRef = useRef(false);
  // oxlint-disable react-hooks/exhaustive-deps -- `category`/`entrySlug`/
  // `virtualizer` deliberately excluded: `entrySlug`/`category` are read
  // through the ref-gated body above (only ever ACTED on before
  // `initialScrollResolvedRef` locks), and `virtualizer` is a referentially
  // stable instance (its own methods, not its identity, are what matter
  // here) — including them would only invite MORE spurious re-runs of an
  // effect the ref already keeps from doing anything a second time.
  useLayoutEffect(() => {
    if (initialScrollResolvedRef.current) return;
    if (restoredScrollY !== undefined) {
      virtualizer.scrollToOffset(restoredScrollY, { align: "start" });
      initialScrollResolvedRef.current = true;
      return;
    }
    if (entrySlug === undefined) {
      initialScrollResolvedRef.current = true; // fresh arrival, no selection at all — nothing to center
      return;
    }
    const idx = visible.findIndex((r) => rowSlug(r, category) === entrySlug);
    if (idx === -1) {
      // Not (yet?) found — the full array may simply not have landed. Only
      // give up for good once it demonstrably HAS (`visible.length` caught
      // up to the true total) and the slug is STILL missing (unknown, or
      // filtered out under the current — default — filter state).
      if (visible.length >= displayTotalCount) initialScrollResolvedRef.current = true;
      return;
    }
    const { startIndex, endIndex } = initialWindowRange(visible.length);
    if (!(idx >= startIndex && idx < endIndex)) virtualizer.scrollToIndex(idx, { align: "center" });
    initialScrollResolvedRef.current = true;
  }, [scrollMargin, visible, displayTotalCount]);
  // oxlint-enable react-hooks/exhaustive-deps

  // P9 S2 (D29-85) — the active row, PERSISTED as a SLUG (never a DOM index
  // or `document.activeElement` reference): every j/k press resolves it
  // against the CURRENT `visible` array below, so wheel-scroll unmounting
  // the focused anchor (the browser moves focus to `<body>`) never loses
  // position, and a filter/sort change that drops the slug out of `visible`
  // reads as "unfocused" (matches the pre-P9 filtered-out-focused-row
  // behavior) rather than throwing or pinning a stale index.
  //
  // `focusedSlugRef` mirrors the state SYNCHRONOUSLY, written by the same
  // `setFocusedSlug` call that updates the state — the keydown handler below
  // reads the REF, never the state/its derived index, so a burst of several
  // "j" keydowns dispatched within one browser task (holding the key down;
  // real, not just a test artifact — found while writing S2's own j-scan
  // Playwright/unit coverage) each see the position the PREVIOUS keydown in
  // the same burst just set, instead of every press in the burst reading the
  // same stale `useMemo`-derived index from before React had a chance to
  // re-render and reattach the listener with a fresh closure.
  const [focusedSlug, setFocusedSlugState] = useState<string | undefined>(undefined);
  const focusedSlugRef = useRef<string | undefined>(undefined);
  const setFocusedSlug = useCallback((slug: string | undefined) => {
    focusedSlugRef.current = slug;
    setFocusedSlugState(slug);
  }, []);

  function handleQueryChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQueryText(next);
    onStateChange((prev) => setQuery(prev, next));
  }

  function handleHeaderSort(key: string) {
    onStateChange((prev) => setSort(prev, nextSortForClick(prev.sort, key)));
  }

  function handleClear() {
    setQueryText("");
    onStateChange(() => clearAllFilters());
  }

  function handleRowClick(e: MouseEvent<HTMLAnchorElement>, row: IndexRow) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new-tab/etc — let it through
    // P8 S3 (D29-82) — "Enter is then native link activation on the focused
    // anchor -> the full entity page; no separate Enter handler": a
    // keyboard-triggered `click` (Enter/Space on a focused `<a>`) carries
    // `detail === 0` in every evergreen browser (a real mouse click's
    // `detail` is always >= 1) — the one reliable way to tell "this `click`
    // event came from keyboard activation" apart from a mouse click without
    // adding a parallel `onKeyDown` handler. Letting it through here means
    // Enter always fully navigates, even in split view where a MOUSE click
    // on the same anchor intercepts into the `?entry=` preview below.
    if (e.detail === 0) return;
    if (typeof window === "undefined" || !window.matchMedia(SPLIT_VIEW_MEDIA).matches) return; // mobile: full nav
    e.preventDefault();
    onEntrySelect(rowSlug(row, category));
  }

  /** P9 S2 (D29-90, stakeholder amendment) — the whole-row click target:
   * clicking ANYWHERE on a `<tr>` selects it, with the SAME semantics as
   * `handleRowClick` above, by direct implementation (never a synthetic
   * `anchor.click()` — that carries `detail === 0`, which `handleRowClick`
   * deliberately reads as keyboard activation, the WRONG branch on
   * desktop). Guard order mirrors the anchor handler exactly: primary button
   * only, any modifier -> no-op (a `<td>` has no new-tab affordance to
   * preserve, unlike the anchor), a click whose target sits inside an `<a>`/
   * `<button>` -> yield (that element's own handler owns it — `handleRowClick`
   * on the name anchor already fires first in bubble order; without this
   * guard both handlers would fire for the exact same click), and a click
   * that CONCLUDES a text-selection drag (non-collapsed
   * `window.getSelection()`) -> no-op, so copying a cell value doesn't also
   * select the row. */
  function handleRowBodyClick(e: MouseEvent<HTMLTableRowElement>, row: IndexRow) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target;
    if (target instanceof Element && target.closest("a, button")) return; // the anchor/button's own handler owns this click
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (selection !== null && !selection.isCollapsed) return; // concludes a text-selection drag, not a click-to-select
    if (typeof window === "undefined" || !window.matchMedia(SPLIT_VIEW_MEDIA).matches) {
      // Non-split (mobile): programmatic navigation identical to the name
      // anchor's OWN default — that anchor is a bare `<a href>` (not a
      // `<Link>`), i.e. a genuine full-page browser navigation, not an SPA
      // transition, so this is the direct DOM equivalent, not a shortcut.
      window.location.href = rowHref(row, state.superseded);
      return;
    }
    onEntrySelect(rowSlug(row, category));
    // D29-90 — "move DOM focus to that row's name anchor so j/k continues
    // from the clicked row"; the anchor is already mounted (this row was
    // just clicked), so a direct synchronous focus call suffices — no need
    // for the rendered-range-keyed wait the D29-85 j/k path uses below.
    const container = listingPaneRef.current;
    if (container) focusAnchorForSlug(container, rowSlug(row, category));
  }

  // P8 S3 (D29-82) — preview-follows-focus: whenever DOM focus lands on a
  // row anchor (j/k below, or a plain Tab), commit `?entry=` after a settle
  // window via REPLACE navigation (never the click path's push). Delegated
  // on the listing pane container (one listener, not one per row) via the
  // native `focusin` event (bubbles, unlike `focus`).
  //
  // P9 S2 — `onEntryPreview` mirrored into a ref (`onEntryPreviewRef`, same
  // "latest ref" pattern as `entrySlugRef` above), so `scheduleEntryPreview`
  // itself can be a referentially STABLE `useCallback` (`[]` deps) instead of
  // depending on `[onEntryPreview]` directly. This matters because
  // `onEntryPreview` is an inline arrow PROP (`routes/$category/index.tsx`) —
  // a NEW function identity on every render of the ROUTE — and D29-89's own
  // post-hydration full-array fetch (`CategoryIndexComponent`'s `setFullRows`)
  // causes exactly one such extra route re-render, asynchronously, sometime
  // after mount. Before this fix, THAT re-render's new `onEntryPreview`
  // reference rippled into a new `scheduleEntryPreview`, which reinstalled
  // the `onFocusIn` effect below, whose CLEANUP unconditionally
  // `clearTimeout`s the in-flight settle timer — silently cancelling a
  // pending preview commit with nothing left to reschedule it if the
  // reinstall landed between the last focus move and the 180ms mark. A real,
  // P9-introduced bug (P8 had no async post-mount route re-render to race
  // against) found live running this slice's own Playwright coverage: j-scan
  // to a real row, wait several seconds, `?entry=` never committed. Keeping
  // `scheduleEntryPreview`/the effect stable regardless of how often the
  // ROUTE re-renders removes the race at its root instead of chasing timing.
  const onEntryPreviewRef = useRef(onEntryPreview);
  useEffect(() => {
    onEntryPreviewRef.current = onEntryPreview;
  }, [onEntryPreview]);
  const previewTimerRef = useRef<number | undefined>(undefined);
  const scheduleEntryPreview = useCallback((slug: string) => {
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      // Re-check against the LATEST `entrySlug` at fire time, not at
      // schedule time: a click on this same row already pushed this exact
      // slug (and also focuses the anchor, so it ALSO fires this
      // listener) — without this guard the settle timer would still fire
      // a redundant same-slug replace 180ms later.
      if (slug !== entrySlugRef.current) onEntryPreviewRef.current(slug);
    }, FOCUS_SETTLE_MS);
  }, []);

  useEffect(() => {
    const container = listingPaneRef.current;
    if (!container) return;
    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const slug = target.dataset.entrySlug;
      if (slug === undefined) return;
      scheduleEntryPreview(slug);
      // P9 S2 (D29-85) — ANY real focus arriving at a row anchor (a plain
      // Tab, or the `.focus()` calls j/k and the D29-90 row-body click make
      // below) reconciles the persisted slug — so a subsequent j/k press
      // always resumes from wherever focus ACTUALLY is, not just from the
      // last j/k-initiated move.
      setFocusedSlug(slug);
    }
    container.addEventListener("focusin", onFocusIn);
    return () => {
      container.removeEventListener("focusin", onFocusIn);
      window.clearTimeout(previewTimerRef.current);
    };
  }, [scheduleEntryPreview, setFocusedSlug]);

  // P9 S2 (D29-85) — focus-after-mount: whenever the virtualizer's rendered
  // range changes (a j/k `scrollToIndex` call below mounting the target row,
  // or an ordinary wheel-scroll bringing it back into the window), check
  // whether `focusedSlug`'s anchor now EXISTS in the mounted DOM and move
  // real focus onto it if so — keyed off `virtualRows` (the rendered range),
  // NEVER a timer, matching D29-85's own text. A no-op whenever the anchor
  // is already focused (`focusAnchorForSlug`'s own guard) or isn't mounted
  // yet (the common case for most renders — this effect just fires again
  // next time `virtualRows` changes, until the target eventually mounts).
  useEffect(() => {
    if (focusedSlug === undefined) return;
    const container = listingPaneRef.current;
    if (!container) return;
    focusAnchorForSlug(container, focusedSlug);
  }, [focusedSlug, virtualRows]);

  // P9 S2 (D29-85) — j/k resolve the next/prev row purely off `visible` +
  // `focusedSlugRef` (the SYNCHRONOUS ref above — read fresh on every
  // keydown, never a `focusedIndex` value captured in this closure at
  // attach-time, which a rapid same-task "j" burst would otherwise see as
  // stale — see `focusedSlugRef`'s own comment) and drive the virtualizer's
  // `scrollToIndex` — `document.activeElement`/a live anchor NodeList is
  // never consulted for POSITION (only the typing/dialog guard below still
  // reads it, to decide whether this keystroke should be intercepted at all
  // — a different question). This is what survives a wheel-scroll
  // unmounting the focused anchor: the ref doesn't change just because the
  // browser moved `document.activeElement` to `<body>`, so the very next
  // j/k press still resolves the correct current index and resumes from
  // there — never a snap back to row 0. Enter needs no handler here (native
  // link activation, `handleRowClick`'s own `e.detail === 0` early-return
  // above). Guard: inert while `document.activeElement` is a form control
  // (covers the Omnibar's own `<input>` too — typing "j"/"k" there must
  // never hijack focus) or sits inside an open `<dialog>` (the filter
  // drawer), and inert on narrow containers (S1's own `narrow` tier state —
  // no preview pane to browse into there; matches split view's own
  // container-driven posture, D29-78).
  useEffect(() => {
    if (narrow) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        if (active.closest("dialog")) return;
      }
      if (visible.length === 0) return;
      e.preventDefault();
      const currentSlug = focusedSlugRef.current;
      const currentIndex =
        currentSlug === undefined
          ? -1
          : visible.findIndex((r) => rowSlug(r, category) === currentSlug);
      const nextIndex =
        currentIndex === -1
          ? 0
          : e.key === "j"
            ? Math.min(currentIndex + 1, visible.length - 1)
            : Math.max(currentIndex - 1, 0);
      const nextRow = visible[nextIndex];
      if (!nextRow) return;
      setFocusedSlug(rowSlug(nextRow, category));
      // `align: "auto"` (review M6) — minimal scroll, the
      // `scrollIntoView({block:"nearest"})` equivalent; `center` is reserved
      // for the D29-84 deep-link-arrival effect above. The focus-after-mount
      // effect (above) picks up once `virtualRows` reflects `nextIndex` —
      // this call itself never focuses anything directly. rAF-coalesced
      // (`scheduleScrollToIndex`, above) — never a raw `virtualizer
      // .scrollToIndex` call here, see that helper's own comment.
      scheduleScrollToIndex(nextIndex);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [narrow, visible, category, setFocusedSlug, scheduleScrollToIndex]);

  return (
    <div className="codex-listing">
      <header className="codex-listing-header">
        {/* D29-112 (P11 S4) — the root header now carries the VISIBLE title
            (`HeaderTitle.tsx`, resolved via `useMatches`/`params.category`);
            this in-content h1 stays in the SSR DOM (document outline + a11y
            tree intact, `globals.css`'s sr-only rule on this class) purely
            for that reason — exactly one visible h1 per document, matching
            the entity route's own `codex-entity-name-standalone` posture.
            Still `displayCategoryName` (D29-109d, created early by this
            same decision), same as the header's own title text and this
            route's `<title>`. */}
        <h1 className="codex-listing-title">{displayCategoryName(category)}</h1>
        {/* D29-112 — count line + hint + the D29-111 reveal control + the
            search input + Filters button compact to ONE slim row
            (`.codex-listing-count-row` extended, `.codex-listing-controls`
            deleted) now that the h1 above is out of the visual flow —
            reclaims the ~120px the two used to cost stacked. */}
        <div className="codex-listing-count-row">
          <p className="codex-listing-count">
            {displayTotalCount.toLocaleString()} of {displayEligibleCount.toLocaleString()} shown
          </p>
          <SupersededRevealControl
            superseded={state.superseded}
            hiddenCount={displayHiddenCount}
            onReveal={onSupersededReveal}
          />
          {/* P8 S3 (D29-82) — desktop-only hint, right of the count line;
              hidden under the same narrow-container condition that drops
              the split view/compact columns (S1's own `narrow` tier state):
              plain text, no dismiss state, AT-readable as ordinary content
              (not an ARIA live region — it never changes). */}
          {!narrow ? (
            <p className="codex-listing-hint">Ctrl+K search · j/k browse · enter open</p>
          ) : null}
          <Input
            type="search"
            aria-label="Filter by name"
            placeholder="Filter by name…"
            value={queryText}
            onChange={handleQueryChange}
          />
          <Button type="button" onClick={() => setDrawerOpen(true)}>
            Filters{pills.length > 0 ? ` (${pills.length})` : ""}
          </Button>
        </div>
      </header>

      {pills.length > 0 ? (
        <div className="codex-active-pills" aria-label="Active filters">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              className="codex-active-pill"
              title={pill.title}
              onClick={pill.onRemove}
            >
              {pill.label}
              <span className="codex-active-pill-remove" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
          <button type="button" className="codex-active-pill-clear" onClick={handleClear}>
            Clear all
          </button>
        </div>
      ) : null}

      <div className="codex-browse-layout">
        <div className="codex-listing-pane" ref={listingPaneRef}>
          {visible.length === 0 ? (
            // D29-111 (R3, #13/#3e/#3f) — the 10 all-superseded categories
            // (e.g. /doctrine) used to render the honest-but-misleading
            // "Nothing in this category yet." even though every entry DOES
            // exist, just superseded-hidden; distinguish that case from a
            // GENUINELY empty category (zero entries, superseded or not —
            // `displayEligibleCount === 0` under the WIDENED toggle too) and
            // from the ordinary filtered-to-zero case (`BrowseEmptyState`,
            // unchanged).
            !state.superseded && displayHiddenCount > 0 && displayEligibleCount === 0 ? (
              <div className="codex-empty-state">
                <p>
                  All {displayHiddenCount.toLocaleString()} entries here are superseded (legacy).
                </p>
                <button
                  type="button"
                  className="codex-rules-superseded-toggle"
                  onClick={() => onSupersededReveal(true)}
                >
                  Show {displayHiddenCount.toLocaleString()} hidden (superseded) &rarr;
                </button>
              </div>
            ) : displayEligibleCount === 0 ? (
              <p className="codex-listing-empty-category">Nothing in this category yet.</p>
            ) : (
              <BrowseEmptyState
                onClearFilters={handleClear}
                noun={displayCategoryName(category).toLowerCase()}
              />
            )
          ) : (
            <ListingTable
              category={category}
              cols={visibleCols}
              rows={visible}
              totalRowCount={displayTotalCount}
              virtualRows={virtualRows}
              tableRef={tableRef}
              collisions={collisions}
              superseded={state.superseded}
              selectedId={entryRow?.id}
              onRowClick={handleRowClick}
              onRowBodyClick={handleRowBodyClick}
              sort={state.sort}
              onSortClick={handleHeaderSort}
            />
          )}
        </div>

        {/* P4.5 S4 (D29-49) — the split-view right pane. CSS-hidden (not
            React-conditional) at/below the split-view breakpoint
            (`globals.css`), so a deep link's SSR HTML always contains the
            full entity body regardless of the requester's viewport (the
            curl-provable acceptance gate) — only the CSS visually hides it
            on a narrow screen, where row taps never populate `entry` in the
            first place (real content, `display:none`, never removed from
            the DOM). */}
        <div className="codex-entry-pane" aria-live="polite">
          {entrySlug === undefined ? (
            <p className="codex-entry-pane-placeholder">Select a row to preview it here.</p>
          ) : entryData === null || entryData === undefined ? (
            <p className="codex-entry-pane-message">
              &ldquo;{entrySlug}&rdquo; wasn&rsquo;t found in{" "}
              {displayCategoryName(category).toLowerCase()}.
            </p>
          ) : !entryVisible ? (
            <div className="codex-entry-pane-message">
              <p>{entryData.entity.name} isn&rsquo;t shown under the current filters.</p>
              <a href={canonicalHref(entryData, state.superseded)}>Open full page →</a>
            </div>
          ) : (
            <div className="codex-entry-pane-content">
              <a
                className="codex-entry-pane-open-link"
                href={canonicalHref(entryData, state.superseded)}
              >
                Open full page →
              </a>
              <EntityRenderPane data={entryData} superseded={state.superseded} />
            </div>
          )}
        </div>
      </div>

      {/* D29-49 — the filter drawer: a native `<dialog>` wrapping the
          UNMODIFIED `FacetPanel` section tree (container swap only, `<aside>`
          -> `<dialog>` — `FacetPanel` itself is untouched, still renders its
          own `<aside>` inside this). Opening never mutates `state` — every
          facet change already writes straight to the URL live, same as
          before; "Done"/Esc/backdrop are purely dismissive. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- native `<dialog>` "click the ::backdrop to dismiss" idiom: `<dialog>` IS the interactive/modal element (not a plain div), Escape already closes it via the same `onClose`, and this onClick only ever fires for a genuine backdrop click (the `e.target === dialogRef.current` guard). */}
      <dialog
        ref={dialogRef}
        className="codex-filter-drawer"
        aria-label="Filters"
        onClose={() => setDrawerOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setDrawerOpen(false); // backdrop click
        }}
      >
        <div className="codex-filter-drawer-body">
          <FacetPanel category={category} rows={rows} state={state} onChange={onStateChange} />
          <Button type="button" variant="solid" onClick={() => setDrawerOpen(false)}>
            Done
          </Button>
        </div>
      </dialog>
    </div>
  );
}

/** D29-111 (P11 S4, R3, #13/#3e/#3f) — the count row's superseded-reveal
 * control: "N of N shown" honesty comes from the note, not the denominator
 * (the denominator keeps its existing "visible under the current toggle"
 * meaning, `displayEligibleCount` above). Reuses the `/rules` inline
 * toggle's OWN classes (`codex-rules-superseded-toggle`/
 * `codex-rules-hidden-note`, `routes/rules.tsx`) rather than inventing
 * parallel `codex-listing-*` ones — same visual language site-wide for "some
 * content here is superseded-hidden," and zero new CSS. Renders nothing at
 * all when the category carries no superseded rows (`hiddenCount === 0`),
 * matching `/rules`'s own `totalHidden > 0 ? … : null` guard. */
function SupersededRevealControl({
  superseded,
  hiddenCount,
  onReveal,
}: {
  superseded: boolean;
  hiddenCount: number;
  onReveal: (superseded: boolean) => void;
}): ReactElement | null {
  if (hiddenCount === 0) return null;
  if (superseded) {
    return (
      <button
        type="button"
        className="codex-rules-superseded-toggle"
        onClick={() => onReveal(false)}
      >
        Hide superseded &larr;
      </button>
    );
  }
  return (
    <button
      type="button"
      className="codex-rules-superseded-toggle codex-rules-hidden-note"
      onClick={() => onReveal(true)}
    >
      Show {hiddenCount.toLocaleString()} hidden (superseded) &rarr;
    </button>
  );
}

/** The raw slug SEGMENT of a row within a KNOWN category — every row on a
 * `/{category}` listing shares that one category, so stripping the
 * `{category}/` prefix off `IndexRow.id` recovers exactly the same slug
 * format the `/{category}/{slug}` route's own `params.slug` carries
 * (`@legacy`/`-N` suffixes included). */
function rowSlug(row: IndexRow, category: string): string {
  return row.id.slice(category.length + 1);
}

function canonicalHref(data: EntityPageData, superseded: boolean): string {
  return superseded ? `/${data.entity.id}?superseded=1` : `/${data.entity.id}`;
}

/** A row's own href — identical for both branches of the breakpoint-gated
 * click behavior (D29-49's own "one component" text): mobile fully
 * navigates here; desktop's `onClick` intercepts and calls `preventDefault`
 * instead, but the href still governs a middle-click/cmd-click "open in new
 * tab". Carries `?superseded=1` when the current view is widened (M7) —
 * exactly the mobile-nav case's edition-context-symmetry requirement. */
function rowHref(row: IndexRow, superseded: boolean): string {
  return superseded ? `/${row.id}?superseded=1` : `/${row.id}`;
}

function displayName(
  row: IndexRow,
  category: string,
  collisions: ReadonlySet<string>,
  superseded: boolean,
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void,
): ReactElement {
  return (
    <a
      href={rowHref(row, superseded)}
      className="codex-listing-name"
      // P9 S1 (D29-86, R6) — the name column is single-line now (nowrap +
      // ellipsis); `title` carries the FULL name for hover/AT whenever the
      // fixed-layout column is too narrow to show it in full (the
      // collision suffix below already had its own `title`, on the BOOK —
      // this is the one on the NAME itself).
      title={row.name}
      // P8 S3 (D29-82) — the j/k scan + focus-follow listener read this
      // directly rather than re-deriving `rowSlug` from the DOM.
      data-entry-slug={rowSlug(row, category)}
      onClick={(e) => onRowClick(e, row)}
    >
      {row.name}
      {collisions.has(row.name) ? (
        <span className="codex-listing-collision" title={row.source.book}>
          {" "}
          ({abbreviateBook(row.source.book) ?? row.source.book})
        </span>
      ) : null}
    </a>
  );
}

/**
 * P8 S1 (D29-78) — the table register that replaces the old letter-grouped/
 * level-ordered `<ul>` split (`LetterGroupedList`/`LevelOrderedList` — R2:
 * "the render-path split collapses into ONE flat sorted renderer"). Real
 * `<table>`/`<thead>`/`<th scope="col">`/`<tbody>` semantics (not a CSS
 * grid): every row here is only ever clickable via its name-cell anchor
 * (never the full row), same as the pre-table markup, so a `<tr>`'s
 * inability to be wrapped in `<a>` costs nothing — "row-level click/
 * keyboard delegation to the name-cell anchor" is what this component
 * already did. Traits are gone from the row entirely (D29-79 — the drawer/
 * entity page keep them).
 *
 * P9 S1 (D29-83/-84) — windowed via `useWindowVirtualizer` (the DOCUMENT
 * scrolls, `.codex-listing-pane` carries no `overflow` of its own —
 * `globals.css`): `<tbody>` = a top spacer `<tr>` + the mounted window +
 * a bottom spacer `<tr>`, each spacer's height living on its OWN single
 * `<td colSpan style={{height, padding:0, border:"none"}}>` (never the
 * `<tr>` itself — cross-engine `<tr>` height + `border-collapse` is
 * unreliable, review N6) and `aria-hidden` (N7, compensated by
 * `aria-rowcount`/`aria-rowindex` below, R5). Spacer HEIGHT is plain
 * `index * ROW_PITCH_PX` arithmetic (never the virtualizer's own
 * `item.start`/`.end`, which bake in `scrollMargin` — a document-relative
 * offset that's meaningless as an IN-TABLE, row-relative spacer height); the
 * constant pitch (`estimateSize`, no `measureElement`) is exactly why this
 * arithmetic can stay this simple. `totalRowCount` (D29-89) is a SEPARATE
 * input from `rows.length`: while the SSR window is still the only data on
 * hand, `rows` may be shorter than the eventual full count, but the
 * virtualizer's own `count` — and therefore the bottom spacer, and the
 * total scroll height on arrival — already reflects the FULL count
 * (`ListingTable`'s own `rows[item.index]` guard below no-ops for any
 * index the caller hasn't populated yet, matching D29-89's own accepted
 * risk window). `getItemKey` returns each row's real slug id (never the
 * bare index) so react's own reconciliation survives the window sliding. */
function ListingTable({
  category,
  cols,
  rows,
  totalRowCount = rows.length,
  virtualRows,
  tableRef,
  collisions,
  superseded,
  selectedId,
  onRowClick,
  onRowBodyClick,
  sort,
  onSortClick,
}: {
  category: string;
  cols: readonly ColumnDef[];
  rows: readonly IndexRow[];
  /** D29-89 — the virtualizer's own `count` (may exceed `rows.length` while
   * only the SSR window has landed); defaults to `rows.length` for every
   * OTHER caller (SPA navigations, tests) where `rows` is already the full
   * array. */
  totalRowCount?: number;
  /** P9 S2 — the virtualizer itself now lives in `BrowseListing` (the D29-85/
   * -84 keyboard + deep-link mechanics need `scrollToIndex`/the rendered
   * range from there); `ListingTable` stays a plain renderer over the
   * already-computed rendered range + spacer arithmetic. */
  virtualRows: readonly VirtualItem[];
  tableRef: RefObject<HTMLTableElement | null>;
  collisions: ReadonlySet<string>;
  superseded: boolean;
  selectedId?: string;
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void;
  /** P9 S2 (D29-90) — the whole-row click target; see `BrowseListing`'s own
   * `handleRowBodyClick` for the full guard order. */
  onRowBodyClick: (e: MouseEvent<HTMLTableRowElement>, row: IndexRow) => void;
  sort: string;
  onSortClick: (key: string) => void;
}): ReactElement {
  const desc = sort.startsWith("-");
  const activeKey = desc ? sort.slice(1) : sort;
  const firstIndex = virtualRows[0]?.index ?? 0;
  const lastIndex = virtualRows[virtualRows.length - 1]?.index ?? -1;
  const topSpacerHeight = firstIndex * ROW_PITCH_PX;
  const bottomSpacerHeight = Math.max(0, totalRowCount - 1 - lastIndex) * ROW_PITCH_PX;
  const colSpan = cols.length + 1; // + the fixed edition-icon end column

  return (
    <table
      className="codex-listing-table"
      ref={tableRef}
      // R5 (stakeholder-resolved) — Tab now reaches only the MOUNTED window
      // (j/k is the sanctioned full traversal, D29-85); these compensate so
      // AT still announces true position ("row 4,200 of 8,485") even though
      // most rows aren't in the DOM at all. Valid without `role="grid"`,
      // matching this table's existing `aria-sort`/`scope="col"` bar.
      aria-rowcount={totalRowCount}
    >
      <thead>
        <tr>
          {cols.map((col) => (
            <ColumnHeaderCell
              key={col.key}
              col={col}
              active={col.key === activeKey}
              desc={desc}
              onSortClick={onSortClick}
            />
          ))}
          <th scope="col" aria-label="Edition" className="codex-listing-col-icon" />
        </tr>
      </thead>
      <tbody>
        {topSpacerHeight > 0 ? (
          <tr aria-hidden="true">
            <td
              aria-hidden="true"
              colSpan={colSpan}
              style={{ height: topSpacerHeight, padding: 0, border: "none" }}
            />
          </tr>
        ) : null}
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          // D29-89's own accepted risk window: the mounted range can
          // (briefly, only on a cold load) reach beyond `rows.length`
          // before the full array has landed — no-op for that index rather
          // than throwing; the row appears once the fetch resolves and
          // re-renders.
          if (!row) return null;
          return (
            <tr
              key={row.id}
              className={cx(
                "codex-listing-row",
                row.id === selectedId && "codex-listing-row-selected",
              )}
              aria-rowindex={virtualRow.index + 1}
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- D29-90: a pointer-target widening ONLY (no `role`/`tabindex` on the `<tr>` — the name anchor stays the row's single focusable element, R5/keyboard path untouched, see `BrowseListing`'s own `handleRowBodyClick` doc comment).
              onClick={(e) => onRowBodyClick(e, row)}
            >
              {cols.map((col) => (
                <td key={col.key} className={`codex-listing-col-${col.key}`}>
                  {col.key === "name"
                    ? displayName(row, category, collisions, superseded, onRowClick)
                    : col.render(row)}
                </td>
              ))}
              <td className="codex-listing-col-icon">
                <EditionIcon edition={row.edition} />
              </td>
            </tr>
          );
        })}
        {bottomSpacerHeight > 0 ? (
          <tr aria-hidden="true">
            <td
              aria-hidden="true"
              colSpan={colSpan}
              style={{ height: bottomSpacerHeight, padding: 0, border: "none" }}
            />
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/**
 * D29-78 — `aria-sort` lives on the header CELL, never the inner `<button>`
 * (undefined there per WAI-ARIA, adversarial M5); the button is the plain
 * click target, carrying a visible caret only once it's the active column
 * (an `aria-hidden` glyph — the cell's own `aria-sort` already carries the
 * meaning for AT).
 */
function ColumnHeaderCell({
  col,
  active,
  desc,
  onSortClick,
}: {
  col: ColumnDef;
  active: boolean;
  desc: boolean;
  onSortClick: (key: string) => void;
}): ReactElement {
  // P9 S1 (D29-86) — `table-layout: fixed` sizes each column off an
  // explicit width on a cell in the table's FIRST row (`<thead>`), so
  // `col.width` (the measured `ch` authority, `columnDefs.tsx`) lands here,
  // not on every `<tbody>` cell — `undefined` for `NAME_COLUMN` leaves the
  // header cell (and therefore the whole column) unconstrained, the
  // fixed-layout remainder rule.
  const style = col.width ? { width: col.width } : undefined;
  if (!col.sortable) {
    return (
      <th scope="col" className={`codex-listing-col-${col.key}`} style={style}>
        {col.label}
      </th>
    );
  }
  return (
    <th
      scope="col"
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
      className={`codex-listing-col-${col.key}`}
      style={style}
    >
      <button
        type="button"
        className="codex-listing-sort-button"
        onClick={() => onSortClick(col.key)}
      >
        {col.label}
        {active ? (
          <span aria-hidden="true" className="codex-listing-sort-caret">
            {desc ? "▾" : "▴"}
          </span>
        ) : null}
      </button>
    </th>
  );
}
