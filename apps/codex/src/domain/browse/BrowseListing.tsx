import { useMemo, useState, type ChangeEvent, type ReactElement } from "react";

import type { IndexRow } from "@/schema/entity";
import { Input } from "@/ui";

import { capitalize, humanizeSlug } from "../render/text";
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

/**
 * D29-35 — the faceted `/{category}` listing island. Purely a function of
 * `state`/`rows`/`onStateChange` (no router/URL/legacy-toggle awareness of
 * its own): the ROUTE FILE (`routes/$category/index.tsx`) owns the
 * URL<->state codec and the live legacy-toggle read, so this component
 * stays directly render-testable with a plain `BrowseFilterState` object —
 * same posture as `listing.tsx`'s presentational components over
 * already-fetched data.
 */
export function BrowseListing({
  category,
  rows,
  state,
  onStateChange,
}: {
  category: string;
  rows: readonly IndexRow[];
  state: BrowseFilterState;
  onStateChange: FilterStateUpdater;
}): ReactElement {
  // Local echo of the quick-filter text so typing feels instant; the actual
  // filter state (and therefore the URL) updates on every keystroke too —
  // no debounce needed, `applyFilters` over a few thousand rows is well
  // under a frame (measured — see the spec's §5 F perf gate).
  const [queryText, setQueryText] = useState(state.query);

  const visible = useMemo(() => sortRows(applyFilters(rows, state), state.sort), [rows, state]);
  const collisions = useMemo(() => collidingNames(visible), [visible]);
  const eligibleCount = useMemo(
    () => (state.legacy ? rows.length : rows.filter((r) => !r.superseded).length),
    [rows, state.legacy],
  );

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
        </div>
      </header>

      <div className="codex-browse-layout">
        <FacetPanel category={category} rows={rows} state={state} onChange={onStateChange} />
        <div className="codex-listing-results">
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
            <LevelOrderedList rows={visible} collisions={collisions} />
          ) : (
            <LetterGroupedList rows={visible} collisions={collisions} />
          )}
        </div>
      </div>
    </div>
  );
}

function displayName(row: IndexRow, collisions: ReadonlySet<string>): ReactElement {
  return (
    <a href={`/${row.id}`} className="codex-listing-name">
      {row.name}
      {collisions.has(row.name) ? (
        <span className="codex-listing-collision"> ({row.source.book})</span>
      ) : null}
    </a>
  );
}

function ListingRowView({
  row,
  collisions,
}: {
  row: IndexRow;
  collisions: ReadonlySet<string>;
}): ReactElement {
  return (
    <li className="codex-listing-row">
      {displayName(row, collisions)}
      {row.level !== undefined ? (
        <span className="codex-listing-level">Lvl {row.level}</span>
      ) : null}
      {row.rarity !== undefined ? (
        <span className="codex-listing-rarity">{capitalize(row.rarity)}</span>
      ) : null}
      <span className="codex-listing-source">{row.source.book}</span>
      <span className={`codex-edition-pill codex-edition-${row.edition}`}>
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

/** name sort: letter-anchored sections. `content-visibility: auto` (CSS,
 * `globals.css`) is the sanctioned perf guard for a long list (spec §D29-35
 * — "NO new virtualization dependency"); incremental reveal is the ESCALATION
 * fallback only if the measured interaction latency demands it (S3's perf
 * gate — see the session report for what was actually needed). */
function LetterGroupedList({
  rows,
  collisions,
}: {
  rows: readonly IndexRow[];
  collisions: ReadonlySet<string>;
}): ReactElement {
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
              <ListingRowView key={row.id} row={row} collisions={collisions} />
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
}: {
  rows: readonly IndexRow[];
  collisions: ReadonlySet<string>;
}): ReactElement {
  return (
    <ul className="codex-listing-rows codex-listing-rows-flat">
      {rows.map((row) => (
        <ListingRowView key={row.id} row={row} collisions={collisions} />
      ))}
    </ul>
  );
}
