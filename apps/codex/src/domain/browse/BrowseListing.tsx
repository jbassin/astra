import {
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

export type FilterStateUpdater = (updater: (prev: BrowseFilterState) => BrowseFilterState) => void;

/** P4.5 S4 (D29-49) — the split view is only live at/above this width; below
 * it row taps fully navigate instead (the CSS breakpoint, `globals.css`'s
 * `.codex-browse-layout`, uses the mirrored `max-width: 56rem` — a hair
 * below this so the two never disagree at exactly 56rem). Read at CLICK
 * time (never at render time), so the row markup itself never differs
 * between desktop/mobile — "one component, one breakpoint-gated behavior
 * branch, not two components" (spec's own text). */
const SPLIT_VIEW_MEDIA = "(min-width: 56.0625rem)";

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
  state,
  onStateChange,
  entrySlug,
  entryData,
  onEntrySelect,
}: {
  category: string;
  rows: readonly IndexRow[];
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

  const visible = useMemo(
    () => sortRows(applyFilters(rows, state), state.sort, sortComparator),
    [rows, state, sortComparator],
  );
  const collisions = useMemo(() => collidingNames(visible), [visible]);
  const eligibleCount = useMemo(
    () => (state.superseded ? rows.length : rows.filter((r) => !r.superseded).length),
    [rows, state.superseded],
  );
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
  const entryVisible = entryRow !== undefined && visibleIds.has(entryRow.id);

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
    if (typeof window === "undefined" || !window.matchMedia(SPLIT_VIEW_MEDIA).matches) return; // mobile: full nav
    e.preventDefault();
    onEntrySelect(rowSlug(row, category));
  }

  return (
    <div className="codex-listing">
      <header className="codex-listing-header">
        <h1 className="codex-listing-title">{humanizeSlug(category)}</h1>
        <p className="codex-listing-count">
          {visible.length.toLocaleString()} of {eligibleCount.toLocaleString()} shown
        </p>
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
            eligibleCount === 0 ? (
              <p className="codex-listing-empty-category">Nothing in this category yet.</p>
            ) : (
              <BrowseEmptyState
                onClearFilters={handleClear}
                noun={humanizeSlug(category).toLowerCase()}
              />
            )
          ) : (
            <ListingTable
              cols={visibleCols}
              rows={visible}
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
  collisions: ReadonlySet<string>,
  superseded: boolean,
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void,
): ReactElement {
  return (
    <a
      href={rowHref(row, superseded)}
      className="codex-listing-name"
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
 * entity page keep them). `content-visibility: auto` lives on
 * `.codex-listing-row` in `globals.css` (the letter `<section>` was the
 * only prior chunking boundary — deleted along with it here). */
function ListingTable({
  cols,
  rows,
  collisions,
  superseded,
  selectedId,
  onRowClick,
  sort,
  onSortClick,
}: {
  cols: readonly ColumnDef[];
  rows: readonly IndexRow[];
  collisions: ReadonlySet<string>;
  superseded: boolean;
  selectedId?: string;
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void;
  sort: string;
  onSortClick: (key: string) => void;
}): ReactElement {
  const desc = sort.startsWith("-");
  const activeKey = desc ? sort.slice(1) : sort;
  return (
    <table className="codex-listing-table">
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
        {rows.map((row) => (
          <tr
            key={row.id}
            className={cx(
              "codex-listing-row",
              row.id === selectedId && "codex-listing-row-selected",
            )}
          >
            {cols.map((col) => (
              <td key={col.key} className={`codex-listing-col-${col.key}`}>
                {col.key === "name"
                  ? displayName(row, collisions, superseded, onRowClick)
                  : col.render(row)}
              </td>
            ))}
            <td className="codex-listing-col-icon">
              <EditionIcon edition={row.edition} />
            </td>
          </tr>
        ))}
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
  if (!col.sortable) {
    return (
      <th scope="col" className={`codex-listing-col-${col.key}`}>
        {col.label}
      </th>
    );
  }
  return (
    <th
      scope="col"
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
      className={`codex-listing-col-${col.key}`}
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
