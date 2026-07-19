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
// spec calls for). The URL codec is `searchUrlState.ts`'s own
// `SearchPageSearch`/`SearchFilterState` shape (not `BrowseSearch` —
// D29-35 vs D29-36).
//
// P4.5 D29-48 (adversarial M1)'s original R3 carve-out — search NEVER hides
// superseded content by default — is AMENDED by P6 R11 (D29-67): `/search`
// now hides superseded content by default too, matching every other
// surface (browse/rules/sidebars). The filter-area reveal control below
// (`SupersededSection`) mirrors `domain/browse/FacetPanel.tsx`'s own
// D29-48 idiom (explainer copy + "Include superseded content" checkbox),
// wired through `searchUrlState.ts`'s own `superseded` field/`?superseded=`
// param rather than a re-adaptation of the deleted site-wide toggle.
//
// P13 S3 (D29-130) — the hand-copied `FilterSection`/`SupersededSection`
// markup this file used to carry (their own ranges, pre-this-slice: roughly
// 425-460 and 469-491) DIES, replaced by the shared presentational
// primitives `domain/browse/facetControls.tsx` exports (`FacetSection`,
// `ToggleChipRow`/`EnumOptionList`, `editionOptionLabel`) — the SAME chip
// -vs-checkbox split (`CHIP_MAX_OPTIONS`) and rank-order sort
// (`filterEngine.ts`'s `sortOptionsFor`) `FacetPanel.tsx` uses. This file
// KEEPS everything the primitives don't own: `SearchFilterState`/
// `searchUrlState.ts`, its Pagefind-derived `filterCounts` (passed to the
// primitives AS DATA, never recomputed there), its inline 26rem-rail layout
// (no pane-swap, no dialog — `BrowseListing.tsx`'s own D29-123 container
// mechanism doesn't apply here, there's no preview pane), and its OWN
// ordering exceptions via `sortOptionsFor`'s comparator seam: `level` stays
// NUMERIC (-2..28, never the primitive's default label-sort) and `category`
// keeps its pre-existing raw-key locale order (never `sortOptionsFor`'s
// rarity-rank/label-sort defaults, which don't apply to a facet with no
// browse counterpart at all). Rarity and Edition, by contrast, DELIBERATELY
// pick up `sortOptionsFor`'s general behavior with no comparator override —
// Rarity now rank-orders common/uncommon/rare/unique (was a raw-key
// alphabetical sort: common/rare/uncommon/unique) and Edition gets the
// shared icon+VISIBLE-text treatment (was an icon-only glyph) — both
// DELIBERATE pin changes, not oversights (see the S3 build record's own
// enumerated pin list).

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import { BrowseEmptyState } from "@/domain/browse/EmptyState";
import {
  CHIP_MAX_OPTIONS,
  editionOptionLabel,
  EnumOptionList,
  FacetSection,
  ToggleChipRow,
} from "@/domain/browse/facetControls";
import { collidingNames, sortOptionsFor, type OptionCount } from "@/domain/browse/filterEngine";
import { displayCategoryName } from "@/domain/render/displayCategoryName";
import { capitalize } from "@/domain/render/text";
import { abbreviateBook } from "@/domain/sources/abbreviations";
import { recordSearch } from "@/server/telemetryFns";
import { EditionIcon } from "@/ui";

import {
  loadPagefind,
  NAME_BOOST_HYDRATE_WINDOW,
  NAME_MATCH_PIN_CAP,
  partitionNameMatches,
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
  /** [pinned name-matches..., naturally-ranked rest...] — a prefix of
   * length `pinnedCount` is the pinned "Name matches" group (D29-81). */
  items: SearchDisplayResult[];
  /** How many of `items`' leading entries are pinned. */
  pinnedCount: number;
  /** How many of `stubs` have been scanned/hydrated so far — the `loadMore`
   * cursor. Distinct from `items.length` because a pin can be found beyond
   * the display budget (`PAGE_SIZE`) inside the wider hydration window, in
   * which case more of `stubs` were consumed than got displayed; when
   * nothing was pinned this equals `items.length` (`PAGE_SIZE`) exactly,
   * matching the pre-D29-81 cursor so an un-boosted query's pagination is
   * byte-identical to before. */
  consumed: number;
}

/** `filterCounts`'s own shape (`Record<string, number>`, Pagefind's
 * `.filters()` result for one dimension) -> the shared primitives'
 * `OptionCount[]` — the primitives accept options/counts AS DATA
 * (`facetControls.tsx`'s own file-header contract), never recomputing them,
 * so this is the one adapter step between Pagefind's shape and theirs. */
function countsToOptions(counts: Record<string, number> | undefined): OptionCount[] {
  return Object.entries(counts ?? {}).map(([value, count]) => ({ value, count }));
}

export function SearchPage({
  search,
  onSearchChange,
}: {
  search: SearchPageSearch;
  onSearchChange: SearchSearchUpdater;
}): ReactElement {
  const state = useMemo(() => searchToFilterState(search), [search]);

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
      // D29-101c: pass `null` (not `""`) when the trimmed query is empty —
      // measured live, `pf.search("", {filters})` returns 0 results
      // regardless of filters, while `pf.search(null, {filters})` returns
      // the filter-only set (686-scale) — without this, filter-only
      // `/search` (incl. the D29-109c trait link) is dead.
      const trimmedQuery = state.query.trim();
      void pf
        .search(trimmedQuery.length > 0 ? state.query : null, { filters: pagefindFilters(state) })
        .catch(() => null)
        .then(async (res) => {
          if (token !== tokenRef.current) return;
          if (!res) {
            setResult({ stubs: [], items: [], pinnedCount: 0, consumed: 0 });
            setSearching(false);
            return;
          }
          // D29-81 — same widened-hydration-window boost as the Omnibar,
          // "ahead of page 1" only (`loadMore` below is untouched — the
          // widened window already covers well past a single page, so a
          // rank-10 hit like `fireball` is caught on this very first scan).
          const scanCount = Math.min(res.results.length, NAME_BOOST_HYDRATE_WINDOW);
          const scanStubs = res.results.slice(0, scanCount);
          const fragments = await Promise.all(scanStubs.map((r) => r.data().catch(() => null)));
          if (token !== tokenRef.current) return;
          const hydrated = fragments.filter((f) => f !== null).map(toDisplayResult);
          const { pinned, rest } = partitionNameMatches(hydrated, state.query, NAME_MATCH_PIN_CAP);
          const items =
            pinned.length > 0
              ? [...pinned, ...rest.slice(0, PAGE_SIZE - pinned.length)]
              : hydrated.slice(0, PAGE_SIZE);
          // No pin found: the cursor stays at `PAGE_SIZE` (byte-identical to
          // pre-D29-81 pagination — "non-name queries pass through
          // unchanged" extends to `loadMore` too). A pin found beyond
          // `PAGE_SIZE` inside the wider window: the cursor advances to
          // `scanCount` (everything already scanned), so `loadMore` doesn't
          // re-fetch/re-display the tail of that window.
          const consumed = pinned.length > 0 ? scanCount : PAGE_SIZE;
          setResult({ stubs: res.results, items, pinnedCount: pinned.length, consumed });
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
    // `state` is a fresh object each render (derived from `search` above) —
    // its own dependency already captures every field that can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pf]);

  async function loadMore() {
    if (!result || !pf) return;
    const token = tokenRef.current;
    // D29-81 — cursor is `consumed` (how much of `stubs` this page has
    // already scanned), not `items.length` (how much it DISPLAYED) — the
    // two only diverge when a pin was found beyond `PAGE_SIZE` inside the
    // wider hydration window; see `ResultPage.consumed`'s own comment.
    const nextStubs = result.stubs.slice(result.consumed, result.consumed + PAGE_SIZE);
    const fragments = await Promise.all(nextStubs.map((r) => r.data().catch(() => null)));
    if (token !== tokenRef.current) return;
    setResult((prev) =>
      prev
        ? {
            stubs: prev.stubs,
            items: [...prev.items, ...fragments.filter((f) => f !== null).map(toDisplayResult)],
            pinnedCount: prev.pinnedCount,
            consumed: prev.consumed + nextStubs.length,
          }
        : prev,
    );
  }

  function handleQueryChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQueryText(next);
    onSearchChange((prev) => filterStateToSearch({ ...searchToFilterState(prev), query: next }));
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
      return filterStateToSearch({ ...prevState, [dimension]: selected });
    });
  }

  // P6 R11 (D29-67) — the reveal control's own setter: `superseded` is a
  // plain boolean, not a multi-select dimension, so it gets its own tiny
  // updater rather than being forced through `toggleDimension`'s Set shape.
  function setSuperseded(next: boolean) {
    onSearchChange((prev) => {
      const prevState = searchToFilterState(prev);
      return filterStateToSearch({ ...prevState, superseded: next });
    });
  }

  function handleClear() {
    setQueryText("");
    onSearchChange(() => ({}));
  }

  const collisions = useMemo(() => collidingNames(result?.items ?? []), [result]);
  const hasMore = result !== null && result.consumed < result.stubs.length;

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
          {/* D29-130: Category keeps its PRE-EXISTING raw-key locale order
              (never sortOptionsFor's rarity-rank/label-sort defaults — this
              facet has no browse counterpart at all) — an explicit
              comparator, same as `level` below, is the seam that preserves
              it. `displayCategoryName` was ALREADY the labelOf here
              pre-slice (checked first, per the spec's own "ONLY if it
              doesn't already have it" instruction) — kept verbatim, not
              double-humanized. */}
          <SearchFacetSection
            title="Category"
            dimension="category"
            counts={filterCounts.category}
            selected={state.category}
            labelOf={displayCategoryName}
            comparator={(a, b) => a.value.localeCompare(b.value)}
            onToggle={(v) => toggleDimension("category", v)}
          />
          {/* D29-130/D29-126: level stays NUMERIC (-2..28) via an explicit
              comparator — sortOptionsFor's own default (label-sort) would
              otherwise scramble it string-lexically ("-2" < "1" < "10"...). */}
          <SearchFacetSection
            title="Level"
            dimension="level"
            counts={filterCounts.level}
            selected={state.level}
            comparator={(a, b) => Number(a.value) - Number(b.value)}
            onToggle={(v) => toggleDimension("level", v)}
          />
          {/* D29-130 pin change: NO comparator passed — Rarity now rank
              -orders common/uncommon/rare/unique via sortOptionsFor's own
              "rarity" dimension exception (`FacetPanel.tsx`'s same rule),
              replacing the old raw-key alphabetical order
              (common/rare/uncommon/unique). */}
          <SearchFacetSection
            title="Rarity"
            dimension="rarity"
            counts={filterCounts.rarity}
            selected={state.rarity}
            labelOf={capitalize}
            onToggle={(v) => toggleDimension("rarity", v)}
          />
          {/* D29-130/D29-126: Edition gets the shared icon+VISIBLE-text
              treatment (was an icon-only glyph) via the primitive imported
              from `facetControls.tsx`, the SAME reference `FacetPanel.tsx`
              now imports too. */}
          <SearchFacetSection
            title="Edition"
            dimension="edition"
            counts={filterCounts.edition}
            selected={state.edition}
            labelOf={editionOptionLabel}
            onToggle={(v) => toggleDimension("edition", v)}
          />
          <SearchFacetSection
            title="Traits"
            dimension="traits"
            counts={filterCounts.traits}
            selected={state.traits}
            onToggle={(v) => toggleDimension("traits", v)}
          />
          <SupersededSection checked={state.superseded} onToggle={setSuperseded} />
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
              {/* D29-81 — `result.items` is [pinned..., rest...]; the pinned
                  prefix (length `result.pinnedCount`) renders as its own
                  "Name matches" group ABOVE the plain results list, exact/
                  prefix name hits are never duplicated in the list below. */}
              {result.pinnedCount > 0 ? (
                <div className="codex-search-pinned">
                  <h2 className="codex-facet-title">Name matches</h2>
                  <ul className="codex-search-results">
                    {result.items.slice(0, result.pinnedCount).map((item) => (
                      <SearchResultRow key={item.id} item={item} collisions={collisions} />
                    ))}
                  </ul>
                </div>
              ) : null}
              <ul className="codex-search-results">
                {result.items.slice(result.pinnedCount).map((item) => (
                  <SearchResultRow key={item.id} item={item} collisions={collisions} />
                ))}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  className="codex-search-load-more"
                  onClick={() => void loadMore()}
                >
                  Load more ({result.stubs.length - result.consumed} remaining)
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// D29-81 — the single result-row renderer shared by the pinned "Name
// matches" group and the plain results list below it; module-scope (not
// nested inside `SearchPage`) since it's used as a JSX tag, matching this
// file's existing `SearchFacetSection`/`SupersededSection` convention.
function SearchResultRow({
  item,
  collisions,
}: {
  item: SearchDisplayResult;
  collisions: ReadonlySet<string>;
}): ReactElement {
  return (
    <li className="codex-search-result">
      <a href={item.url} className="codex-listing-name">
        {item.name}
        {collisions.has(item.name) ? (
          <span className="codex-listing-collision" title={item.book}>
            {" "}
            ({abbreviateBook(item.book) ?? item.book})
          </span>
        ) : null}
      </a>
      <span className="codex-listing-source">
        {displayCategoryName(item.category)}
        {item.level !== undefined ? ` · Lvl ${item.level}` : ""}
        {item.rarity !== undefined ? ` · ${capitalize(item.rarity)}` : ""}
        {/* D29-101c render half (P11 S5) — the owning-class label (S1's
            `meta.class`, class-feature entities), the one field `/search`
            rows were still missing (rarity/level/category already
            rendered). */}
        {item.class !== undefined ? ` · ${item.class}` : ""}
        <span title={item.book}> · {abbreviateBook(item.book) ?? item.book}</span>
      </span>
      <EditionIcon edition={item.edition === "remaster" ? "remaster" : "legacy"} />
      {item.excerpt !== undefined && item.excerpt !== "" ? (
        // Pagefind's own excerpt HTML (`<mark>` around matched terms) — the
        // one intentional `dangerouslySetInnerHTML` in this island, same
        // pattern akasha's Search.tsx uses.
        <p className="codex-search-excerpt" dangerouslySetInnerHTML={{ __html: item.excerpt }} />
      ) : null}
    </li>
  );
}

/**
 * P13 S3 (D29-130) — `/search`'s own facet section: `FacetSection` +
 * `ToggleChipRow`/`EnumOptionList` (the SAME `CHIP_MAX_OPTIONS` split
 * `FacetPanel.tsx`'s `CoreEnumSection` uses), fed Pagefind's OWN counts as
 * data. No `activeCount`/`onClear` passed to `FacetSection` (D29-124's
 * badge/per-section-clear treatment is a `FacetPanel`/browse-pane concept —
 * `/search` never had a per-section clear before this slice and nothing
 * here asks for one now, so this stays a plain titled section exactly like
 * the old `FilterSection` was). `comparator`, when supplied, wins outright
 * over `sortOptionsFor`'s own dimension-name rank tables — `level`
 * (NUMERIC, -2..28) and `category` (this facet's pre-existing raw-key
 * locale order) are the two callers below that need one; Rarity and
 * Edition deliberately pass none, so they now pick up `sortOptionsFor`'s
 * general rarity-rank / label-sort behavior instead of the old raw-key
 * alphabetical order — a DELIBERATE pin change, not an oversight (see the
 * S3 build record).
 */
function SearchFacetSection({
  title,
  dimension,
  counts,
  selected,
  onToggle,
  labelOf,
  labelTextOf,
  comparator,
}: {
  title: string;
  dimension: string;
  counts: Record<string, number> | undefined;
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  labelOf?: (value: string) => ReactElement | string;
  labelTextOf?: (value: string) => string;
  comparator?: (a: OptionCount, b: OptionCount) => number;
}): ReactElement | null {
  const rawOptions = countsToOptions(counts);
  if (rawOptions.length === 0) return null;
  const textOf = labelTextOf ?? ((v: string) => v);
  const sorted = sortOptionsFor(dimension, rawOptions, { labelOf: textOf, comparator });
  const resolvedLabelOf = labelOf ?? textOf;
  return (
    <FacetSection title={title}>
      {sorted.length <= CHIP_MAX_OPTIONS ? (
        <ToggleChipRow
          options={sorted}
          selected={selected}
          labelOf={resolvedLabelOf}
          onToggle={onToggle}
        />
      ) : (
        <EnumOptionList
          options={sorted}
          selected={selected}
          missing={0}
          labelOf={resolvedLabelOf}
          onToggle={onToggle}
        />
      )}
    </FacetSection>
  );
}

// P6 R11 (D29-67), restyled P13 S3 (D29-130) — the `/search` reveal control:
// now wrapped in the SAME shared `FacetSection` (title-row chrome only, no
// badge/clear — matches `SearchFacetSection` above) and the SAME muted
// one-line caption `FacetPanel.tsx`'s own `SupersededSection` uses in place
// of the old loud blue callout (`.codex-callout-blue`/
// `.codex-facet-superseded-explainer` — dead now, nothing else on `/search`
// renders them; `FacetPanel.tsx`'s D29-129 consolidation made the same call
// for browse). Still a separate, search-owned component rather than an
// import from `FacetPanel.tsx`: that file's version is wired to
// `BrowseFilterState`/`StateUpdater` + the `onSupersededReveal`
// resetScroll-divergence plumbing (D29-129) — `/search` has no such
// divergence (no pane-swap, no scroll-preserving navigate split) to route
// around, just a plain boolean setter.
function SupersededSection({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
}): ReactElement {
  return (
    <FacetSection title={checked ? "Including superseded" : "Current edition"}>
      <div className="codex-facet-superseded">
        <label className="codex-facet-option">
          <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
          <span className="codex-facet-option-label">Include superseded content</span>
        </label>
        <p className="codex-facet-superseded-caption">
          Previous-edition content that was never remastered still shows either way.
        </p>
      </div>
    </FacetSection>
  );
}
