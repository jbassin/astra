import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactElement,
} from "react";

import { EntityRenderPane } from "@/domain/render/EntityRenderPane";
import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { IndexRow } from "@/schema/entity";
import type { EntityPageData } from "@/server/entityPageData";
import { Button, EditionIcon, Input } from "@/ui";
import { cx } from "@/ui/cx";

import { humanizeSlug } from "../render/text";
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
import { INITIAL_VIEWPORT_PX, OVERSCAN, ROW_PITCH_PX } from "./virtualization";

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

/** Row-anchor selector shared by the j/k scan and the focus-follow listener
 * — every row's name cell renders exactly one such anchor
 * (`displayName()` below), tagged with `data-entry-slug` for the
 * focus-follow handler to read without re-deriving `rowSlug` from the DOM. */
const ROW_ANCHOR_SELECTOR = ".codex-listing-name";

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
  state,
  onStateChange,
  entrySlug,
  entryData,
  onEntrySelect,
  onEntryPreview,
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
  // D29-87 (R3) — "N of N shown" counts the ARRAY, not the mounted DOM;
  // `totalCount`/`eligibleCountOverride` (set by the route ONLY during the
  // D29-89 pending window) keep that count line reading the eventual TRUE
  // total immediately, instead of the transient `rows.length` the SSR
  // window alone would give.
  const displayTotalCount = totalCount ?? visible.length;
  const displayEligibleCount = eligibleCountOverride ?? localEligibleCount;
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

  // P8 S3 (D29-82) — preview-follows-focus: whenever DOM focus lands on a
  // row anchor (j/k below, or a plain Tab), commit `?entry=` after a settle
  // window via REPLACE navigation (never the click path's push). Delegated
  // on the listing pane container (one listener, not one per row) via the
  // native `focusin` event (bubbles, unlike `focus`).
  const previewTimerRef = useRef<number | undefined>(undefined);
  const scheduleEntryPreview = useCallback(
    (slug: string) => {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        // Re-check against the LATEST `entrySlug` at fire time, not at
        // schedule time: a click on this same row already pushed this exact
        // slug (and also focuses the anchor, so it ALSO fires this
        // listener) — without this guard the settle timer would still fire
        // a redundant same-slug replace 180ms later.
        if (slug !== entrySlugRef.current) onEntryPreview(slug);
      }, FOCUS_SETTLE_MS);
    },
    [onEntryPreview],
  );

  useEffect(() => {
    const container = listingPaneRef.current;
    if (!container) return;
    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const slug = target.dataset.entrySlug;
      if (slug === undefined) return;
      scheduleEntryPreview(slug);
    }
    container.addEventListener("focusin", onFocusIn);
    return () => {
      container.removeEventListener("focusin", onFocusIn);
      window.clearTimeout(previewTimerRef.current);
    };
  }, [scheduleEntryPreview]);

  // P8 S3 (D29-82) — j/k move REAL DOM focus to the next/prev row's name
  // anchor (native scroll-into-view, `block: "nearest"`); Enter needs no
  // handler here (native link activation, `handleRowClick`'s own
  // `e.detail === 0` early-return above). Guard: inert while
  // `document.activeElement` is a form control (covers the Omnibar's own
  // `<input>` too — typing "j"/"k" there must never hijack focus) or sits
  // inside an open `<dialog>` (the filter drawer), and inert on narrow
  // containers (S1's own `narrow` tier state — no preview pane to browse
  // into there; matches split view's own container-driven posture, D29-78).
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
      const container = listingPaneRef.current;
      if (!container) return;
      const anchors = Array.from(
        container.querySelectorAll<HTMLAnchorElement>(ROW_ANCHOR_SELECTOR),
      );
      if (anchors.length === 0) return;
      const currentIndex: number =
        active instanceof HTMLElement ? anchors.indexOf(active as HTMLAnchorElement) : -1;
      e.preventDefault();
      const nextIndex =
        currentIndex === -1
          ? 0
          : e.key === "j"
            ? Math.min(currentIndex + 1, anchors.length - 1)
            : Math.max(currentIndex - 1, 0);
      const next = anchors[nextIndex];
      next?.focus();
      // `?.()` twice over: jsdom (this repo's unit-test environment) has no
      // `scrollIntoView` at all — real Chromium (the S4 Playwright gate's
      // actual target) does, so this is a genuine environment gap, not a
      // production concern.
      next?.scrollIntoView?.({ block: "nearest" });
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [narrow]);

  return (
    <div className="codex-listing">
      <header className="codex-listing-header">
        <h1 className="codex-listing-title">{humanizeSlug(category)}</h1>
        <div className="codex-listing-count-row">
          <p className="codex-listing-count">
            {displayTotalCount.toLocaleString()} of {displayEligibleCount.toLocaleString()} shown
          </p>
          {/* P8 S3 (D29-82) — desktop-only hint, right of the count line;
              hidden under the same narrow-container condition that drops
              the split view/compact columns (S1's own `narrow` tier state):
              plain text, no dismiss state, AT-readable as ordinary content
              (not an ARIA live region — it never changes). */}
          {!narrow ? (
            <p className="codex-listing-hint">Ctrl+K search · j/k browse · enter open</p>
          ) : null}
        </div>
        <div className="codex-listing-controls">
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
            displayEligibleCount === 0 ? (
              <p className="codex-listing-empty-category">Nothing in this category yet.</p>
            ) : (
              <BrowseEmptyState
                onClearFilters={handleClear}
                noun={humanizeSlug(category).toLowerCase()}
              />
            )
          ) : (
            <ListingTable
              category={category}
              cols={visibleCols}
              rows={visible}
              totalRowCount={displayTotalCount}
              collisions={collisions}
              superseded={state.superseded}
              selectedId={entryRow?.id}
              onRowClick={handleRowClick}
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
              &ldquo;{entrySlug}&rdquo; wasn&rsquo;t found in {humanizeSlug(category).toLowerCase()}
              .
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
  collisions,
  superseded,
  selectedId,
  onRowClick,
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
  collisions: ReadonlySet<string>;
  superseded: boolean;
  selectedId?: string;
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void;
  sort: string;
  onSortClick: (key: string) => void;
}): ReactElement {
  const desc = sort.startsWith("-");
  const activeKey = desc ? sort.slice(1) : sort;
  const tableRef = useRef<HTMLTableElement>(null);
  // D29-83 (review M3) — `scrollMargin` = the table's own document-top
  // offset, ref-measured in a POST-hydration effect only: both the server
  // pass and the client's FIRST pass render with 0 (so the hydration ranges
  // agree byte-for-byte), and this effect's `setState` re-renders with the
  // true margin afterward — a client-only correction, never part of the
  // hydration comparison itself.
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: totalRowCount,
    estimateSize: () => ROW_PITCH_PX,
    overscan: OVERSCAN,
    // D29-84 — identical on the server pass and the client's first pass;
    // only `scrollMargin` (above) ever differs, and only post-hydration.
    initialRect: { width: 0, height: INITIAL_VIEWPORT_PX },
    initialOffset: 0,
    scrollMargin,
    getItemKey: (index) => rows[index]?.id ?? index,
  });
  const virtualRows = virtualizer.getVirtualItems();
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
