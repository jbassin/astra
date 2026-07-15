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
import { Button, Input, TraitPill } from "@/ui";
import { cx } from "@/ui/cx";

import { capitalize, humanizeSlug } from "../render/text";
import { activeFilterPills } from "./activeFilterPills";
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
  type SortMode,
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

  const visible = useMemo(() => sortRows(applyFilters(rows, state), state.sort), [rows, state]);
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

  function handleSortChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SortMode;
    onStateChange((prev) => setSort(prev, next));
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
          <label className="codex-sort-control">
            Sort
            <select value={state.sort} onChange={handleSortChange}>
              <option value="name">Name (A–Z)</option>
              <option value="level">Level</option>
            </select>
          </label>
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
        <div className="codex-listing-pane">
          {visible.length === 0 ? (
            eligibleCount === 0 ? (
              <p className="codex-listing-empty-category">Nothing in this category yet.</p>
            ) : (
              <BrowseEmptyState
                onClearFilters={handleClear}
                noun={humanizeSlug(category).toLowerCase()}
              />
            )
          ) : state.sort === "level" ? (
            <LevelOrderedList
              rows={visible}
              collisions={collisions}
              superseded={state.superseded}
              selectedId={entryRow?.id}
              onRowClick={handleRowClick}
            />
          ) : (
            <LetterGroupedList
              rows={visible}
              collisions={collisions}
              superseded={state.superseded}
              selectedId={entryRow?.id}
              onRowClick={handleRowClick}
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

/** P4.5 S5 (D29-50) — style doc §4's per-row trait pill treatment, at
 * reduced scale (`.codex-listing-traits`, globals.css). GATED on the S4
 * perf baseline (124-148ms filter-interaction, feat's 8,485-row category):
 * kept — an A/B production-build measurement on `/feat` (keystroke-to-
 * `.codex-listing-count`-DOM-update latency, 5 runs each via a MutationObserver,
 * 1400px viewport / split-view active) showed NO measurable regression from
 * adding them: avg 11.2ms without row pills vs 11.7ms with them (both
 * comfortably inside the ~2x/296ms budget; the S4 baseline's own 124-148ms
 * figure likely measured a different, heavier metric — paint-complete, not
 * DOM-mutation — so treat the ~11ms numbers as a same-methodology A/B ratio,
 * not a like-for-like replacement of the S4 figure). Capped at 3 pills/row +
 * a "+N" overflow marker so a heavily-tagged creature entry never balloons a
 * row's height or the per-keystroke re-render cost unboundedly. Unlinked
 * (plain `TraitPill`, not `CodexTraitPills`) — a dense list row has no
 * `knownTraitIds` context threaded to it (loader logic is out of scope for
 * this restyle slice) and a crossref link per pill per row would be pure
 * additional cost with no reader benefit here (the full trait-pill-with-link
 * treatment already exists on the entity page/right pane one click away). */
const ROW_TRAIT_CAP = 3;

function RowTraitPills({ traits }: { traits: readonly string[] }): ReactElement | null {
  if (traits.length === 0) return null;
  const shown = traits.slice(0, ROW_TRAIT_CAP);
  const overflow = traits.length - shown.length;
  return (
    <span className="codex-listing-traits">
      {shown.map((t) => (
        <TraitPill key={t} name={humanizeSlug(t)} />
      ))}
      {overflow > 0 ? <span className="codex-listing-traits-more">+{overflow}</span> : null}
    </span>
  );
}

function ListingRowView({
  row,
  collisions,
  superseded,
  selected,
  onRowClick,
}: {
  row: IndexRow;
  collisions: ReadonlySet<string>;
  superseded: boolean;
  selected: boolean;
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void;
}): ReactElement {
  return (
    <li className={cx("codex-listing-row", selected && "codex-listing-row-selected")}>
      {displayName(row, collisions, superseded, onRowClick)}
      <RowTraitPills traits={row.traits} />
      <span className="codex-listing-typelevel">
        {row.level !== undefined ? (
          <span className="codex-listing-level">Lvl {row.level}</span>
        ) : null}
        {row.rarity !== undefined ? (
          <span className="codex-listing-rarity">{capitalize(row.rarity)}</span>
        ) : null}
      </span>
      <span className="codex-listing-source" title={row.source.book}>
        {abbreviateBook(row.source.book) ?? row.source.book}
      </span>
      <span className={`codex-edition-pill codex-edition-pill-sm codex-edition-${row.edition}`}>
        {row.edition === "remaster" ? "Remaster" : "Legacy"}
      </span>
    </li>
  );
}

function letterOf(name: string): string {
  const first = name.charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

function groupByLetter(rows: readonly IndexRow[]): Array<[string, IndexRow[]]> {
  const groups = new Map<string, IndexRow[]>();
  for (const row of rows) {
    const letter = letterOf(row.name);
    const bucket = groups.get(letter);
    if (bucket) bucket.push(row);
    else groups.set(letter, [row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

interface RowListProps {
  rows: readonly IndexRow[];
  collisions: ReadonlySet<string>;
  superseded: boolean;
  selectedId?: string;
  onRowClick: (e: MouseEvent<HTMLAnchorElement>, row: IndexRow) => void;
}

/** name sort: letter-anchored sections. `content-visibility: auto` (CSS,
 * `globals.css`) is the sanctioned perf guard for a long list (spec §D29-35
 * — "NO new virtualization dependency"); incremental reveal is the ESCALATION
 * fallback only if the measured interaction latency demands it (S3's perf
 * gate — see the session report for what was actually needed). */
function LetterGroupedList({
  rows,
  collisions,
  superseded,
  selectedId,
  onRowClick,
}: RowListProps): ReactElement {
  const letterGroups = groupByLetter(rows);
  return (
    <div className="codex-listing-lettered">
      {letterGroups.length > 1 ? (
        <nav className="codex-listing-alpha" aria-label="Jump to letter">
          {letterGroups.map(([letter]) => (
            <a key={letter} href={`#letter-${letter}`}>
              {letter}
            </a>
          ))}
        </nav>
      ) : null}
      {letterGroups.map(([letter, letterRows]) => (
        <section key={letter} id={`letter-${letter}`} className="codex-listing-letter">
          <h2 className="codex-heading">{letter}</h2>
          <ul className="codex-listing-rows">
            {letterRows.map((row) => (
              <ListingRowView
                key={row.id}
                row={row}
                collisions={collisions}
                superseded={superseded}
                selected={row.id === selectedId}
                onRowClick={onRowClick}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** level sort: one flat list, ascending, anchors hidden (D29-35 explicit —
 * "level (anchors hidden, ascending w/ '—' bucket last)"). */
function LevelOrderedList({
  rows,
  collisions,
  superseded,
  selectedId,
  onRowClick,
}: RowListProps): ReactElement {
  return (
    <ul className="codex-listing-rows codex-listing-rows-flat">
      {rows.map((row) => (
        <ListingRowView
          key={row.id}
          row={row}
          collisions={collisions}
          superseded={superseded}
          selected={row.id === selectedId}
          onRowClick={onRowClick}
        />
      ))}
    </ul>
  );
}
