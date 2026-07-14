// P3 S4 (D29-36) — the `/search` results page island. The route file
// (`routes/search.tsx`) SSRs the shell + a `<noscript>` no-JS notice; this
// component is the client-only worker — mounted unconditionally (its own
// first render, both server and client, shows the same "loading the search
// index…" state, so there's no hydration mismatch to guard with a
// `<ClientOnly>` wrapper, unlike e.g. harrow's `Math.random` draw).
//
// Shares code with the Omnibar rather than duplicating it: `pagefindClient
// .loadPagefind`/`toDisplayResult` (the SAME memoized runtime import — a
// visit that already warmed the Omnibar's load doesn't re-fetch
// `pagefind.js`), `domain/browse/filterEngine.collidingNames` (M5, the same
// rule D29-35 defined for listings) and `domain/browse/EmptyState
// .BrowseEmptyState` (M6, the literal "same component serves `/search`" the
// spec calls for). The URL codec (`searchUrlState.ts`) and the legacy-toggle
// two-phase SSR/live read below are copied from `$category/index.tsx`'s own
// pattern (not imported — that route's version is typed against
// `BrowseSearch`, a different shape, D29-35 vs D29-36).

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import { BrowseEmptyState } from "@/domain/browse/EmptyState";
import { collidingNames } from "@/domain/browse/filterEngine";
import { useLegacyToggle } from "@/domain/browse/legacyToggle";
import { capitalize, humanizeSlug } from "@/domain/render/text";
import { recordSearch } from "@/server/telemetryFns";

import {
  loadPagefind,
  toDisplayResult,
  type PagefindApi,
  type PagefindSearchResultStub,
  type SearchDisplayResult,
} from "./pagefindClient";
import {
  filterStateToSearch,
  hasAnyCriteria,
  pagefindFilters,
  searchToFilterState,
  type SearchPageSearch,
} from "./searchUrlState";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 180;

export type SearchSearchUpdater = (updater: (prev: SearchPageSearch) => SearchPageSearch) => void;

interface ResultPage {
  stubs: PagefindSearchResultStub[];
  items: SearchDisplayResult[];
}

/** Numeric-sorts when every key parses as a finite number (level's own
 * shape, `-2`..`28`); falls back to a plain locale sort otherwise
 * (category/rarity/edition/traits — free strings). */
function sortedEntries(counts: Record<string, number> | undefined): [string, number][] {
  const entries = Object.entries(counts ?? {});
  const allNumeric = entries.length > 0 && entries.every(([k]) => Number.isFinite(Number(k)));
  if (allNumeric) return entries.sort((a, b) => Number(a[0]) - Number(b[0]));
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

export function SearchPage({
  search,
  onSearchChange,
}: {
  search: SearchPageSearch;
  onSearchChange: SearchSearchUpdater;
}): ReactElement {
  const liveLegacy = useLegacyToggle();

  // Same M4 two-phase SSR/live read `$category/index.tsx` uses: the FIRST
  // render (server + matching first client render) must derive `legacy`
  // from the isomorphic `search.legacy` alone; only after mount does the
  // live site-wide toggle take over.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => setHasHydrated(true), []);
  const effectiveLegacy = hasHydrated ? liveLegacy : search.legacy === true;

  const state = useMemo(
    () => ({ ...searchToFilterState(search), legacy: effectiveLegacy }),
    [search, effectiveLegacy],
  );

  // Reflect the live toggle into THIS route's own URL whenever it changes.
  useEffect(() => {
    const currentlyHasLegacyParam = search.legacy === true;
    if (currentlyHasLegacyParam === effectiveLegacy) return;
    onSearchChange((prev) => {
      const next = { ...prev };
      if (effectiveLegacy) next.legacy = true;
      else delete next.legacy;
      return next;
    });
  }, [effectiveLegacy, search, onSearchChange]);

  const [queryText, setQueryText] = useState(state.query);

  const [pf, setPf] = useState<PagefindApi | null | undefined>(undefined); // undefined = still loading the runtime
  const [filterCounts, setFilterCounts] = useState<Record<string, Record<string, number>>>({});
  const [result, setResult] = useState<ResultPage | null>(null);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const tokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadPagefind().then((api) => {
      if (cancelled) return;
      setPf(api);
      if (api) {
        void api
          .filters?.()
          .then((f) => {
            if (!cancelled) setFilterCounts(f);
          })
          .catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced search execution — depends on `state` (URL-derived) + `pf`
  // (runtime readiness), NOT on `queryText` directly (the input's `onChange`
  // writes straight into the URL/state on every keystroke, same as
  // `BrowseListing`'s own "no separate debounce for the state update, only
  // for the expensive downstream work" convention — here the expensive work
  // is the network round-trip, not `applyFilters`).
  useEffect(() => {
    if (pf === undefined) return; // runtime still loading
    if (!pf) return; // fail-soft: never search
    if (!hasAnyCriteria(state)) {
      setResult(null);
      return;
    }
    window.clearTimeout(timerRef.current);
    const token = ++tokenRef.current;
    setSearching(true);
    timerRef.current = window.setTimeout(() => {
      void recordSearch({ data: { surface: "page" } }).catch(() => undefined);
      void pf
        .search(state.query, { filters: pagefindFilters(state) })
        .catch(() => null)
        .then(async (res) => {
          if (token !== tokenRef.current) return;
          if (!res) {
            setResult({ stubs: [], items: [] });
            setSearching(false);
            return;
          }
          const firstPage = res.results.slice(0, PAGE_SIZE);
          const fragments = await Promise.all(firstPage.map((r) => r.data().catch(() => null)));
          if (token !== tokenRef.current) return;
          setResult({
            stubs: res.results,
            items: fragments.filter((f) => f !== null).map(toDisplayResult),
          });
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
    // `state` is a fresh object each render (derived from `search` +
    // `effectiveLegacy` above) — its own dependency already captures every
    // field that can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pf]);

  async function loadMore() {
    if (!result || !pf) return;
    const token = tokenRef.current;
    const nextStubs = result.stubs.slice(result.items.length, result.items.length + PAGE_SIZE);
    const fragments = await Promise.all(nextStubs.map((r) => r.data().catch(() => null)));
    if (token !== tokenRef.current) return;
    setResult((prev) =>
      prev
        ? {
            stubs: prev.stubs,
            items: [...prev.items, ...fragments.filter((f) => f !== null).map(toDisplayResult)],
          }
        : prev,
    );
  }

  function handleQueryChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQueryText(next);
    onSearchChange((prev) =>
      filterStateToSearch({ ...searchToFilterState(prev), query: next, legacy: effectiveLegacy }),
    );
  }

  function toggleDimension(
    dimension: "category" | "rarity" | "edition" | "level" | "traits",
    value: string,
  ) {
    onSearchChange((prev) => {
      const prevState = searchToFilterState(prev);
      const selected = new Set(prevState[dimension]);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return filterStateToSearch({ ...prevState, [dimension]: selected, legacy: effectiveLegacy });
    });
  }

  function handleClear() {
    setQueryText("");
    onSearchChange(() => ({}));
  }

  const collisions = useMemo(() => collidingNames(result?.items ?? []), [result]);
  const hasMore = result !== null && result.items.length < result.stubs.length;

  if (pf === undefined) {
    return (
      <div className="codex-search-shell">
        <p className="codex-search-status">Loading the search index…</p>
      </div>
    );
  }

  if (pf === null) {
    return (
      <div className="codex-search-shell">
        <p className="codex-search-status">
          Search isn&rsquo;t available right now &mdash; the search index hasn&rsquo;t been built.
        </p>
      </div>
    );
  }

  return (
    <div className="codex-search-shell">
      <label className="codex-search-query">
        <span className="codex-search-query-label">Search</span>
        <input
          type="search"
          autoComplete="off"
          placeholder="Search the codex…"
          value={queryText}
          onChange={handleQueryChange}
        />
      </label>

      <div className="codex-browse-layout">
        <aside className="codex-facet-panel" aria-label="Filters">
          <FilterSection
            title="Category"
            counts={filterCounts.category}
            selected={state.category}
            labelOf={humanizeSlug}
            onToggle={(v) => toggleDimension("category", v)}
          />
          <FilterSection
            title="Level"
            counts={filterCounts.level}
            selected={state.level}
            labelOf={(v) => v}
            onToggle={(v) => toggleDimension("level", v)}
          />
          <FilterSection
            title="Rarity"
            counts={filterCounts.rarity}
            selected={state.rarity}
            labelOf={capitalize}
            onToggle={(v) => toggleDimension("rarity", v)}
          />
          <FilterSection
            title="Edition"
            counts={filterCounts.edition}
            selected={state.edition}
            labelOf={(v) => (v === "remaster" ? "Remaster" : "Legacy")}
            onToggle={(v) => toggleDimension("edition", v)}
          />
          <FilterSection
            title="Traits"
            counts={filterCounts.traits}
            selected={state.traits}
            labelOf={(v) => v}
            onToggle={(v) => toggleDimension("traits", v)}
          />
        </aside>

        <div className="codex-listing-results">
          {!hasAnyCriteria(state) ? (
            <p className="codex-listing-empty-category">
              Type a query or choose a filter to search the codex.
            </p>
          ) : result === null || searching ? (
            <p className="codex-search-status">Searching…</p>
          ) : result.items.length === 0 ? (
            <BrowseEmptyState onClearFilters={handleClear} noun="results" />
          ) : (
            <>
              <ul className="codex-search-results">
                {result.items.map((item) => (
                  <li key={item.id} className="codex-search-result">
                    <a href={item.url} className="codex-listing-name">
                      {item.name}
                      {collisions.has(item.name) ? (
                        <span className="codex-listing-collision"> ({item.book})</span>
                      ) : null}
                    </a>
                    <span className="codex-listing-source">
                      {humanizeSlug(item.category)}
                      {item.level !== undefined ? ` · Lvl ${item.level}` : ""}
                      {item.rarity !== undefined ? ` · ${capitalize(item.rarity)}` : ""}
                      {` · ${item.book}`}
                    </span>
                    <span className={`codex-edition-pill codex-edition-${item.edition}`}>
                      {item.edition === "remaster" ? "Remaster" : "Legacy"}
                    </span>
                    {item.excerpt !== undefined && item.excerpt !== "" ? (
                      // Pagefind's own excerpt HTML (`<mark>` around matched
                      // terms) — the one intentional `dangerouslySetInnerHTML`
                      // in this island, same pattern akasha's Search.tsx uses.
                      <p
                        className="codex-search-excerpt"
                        dangerouslySetInnerHTML={{ __html: item.excerpt }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  className="codex-search-load-more"
                  onClick={() => void loadMore()}
                >
                  Load more ({result.stubs.length - result.items.length} remaining)
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  counts,
  selected,
  labelOf,
  onToggle,
}: {
  title: string;
  counts: Record<string, number> | undefined;
  selected: ReadonlySet<string>;
  labelOf: (value: string) => string;
  onToggle: (value: string) => void;
}): ReactElement | null {
  const entries = sortedEntries(counts);
  if (entries.length === 0) return null;
  return (
    <section className="codex-facet-section">
      <h3 className="codex-facet-title">{title}</h3>
      <ul className="codex-facet-options">
        {entries.map(([value, count]) => (
          <li key={value}>
            <label className="codex-facet-option">
              <input
                type="checkbox"
                checked={selected.has(value)}
                onChange={() => onToggle(value)}
              />
              <span className="codex-facet-option-label">{labelOf(value)}</span>
              <span className="codex-facet-option-count">{count}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
