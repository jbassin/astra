// P3 S4 (D29-34/-36) — the shared client-only Pagefind runtime loader +
// result types. Both the header Omnibar and the `/search` page island import
// this ONE module so the `/pagefind/pagefind.js` runtime (a build-time-only
// static asset, S2's `staticMounts` entry) is fetched at most once per page
// load regardless of which surface touches search first — a module-scope
// memoized PROMISE (not just the resolved value), so a second caller mid-
// flight awaits the SAME in-flight import rather than firing a second
// `@vite-ignore` dynamic import.
//
// Never statically resolvable (`/pagefind/pagefind.js` doesn't exist on disk
// until a real `just codex-search-index` run has happened, S2's own host-only
// build) — the `@vite-ignore` comment on the dynamic import is load-bearing
// (akasha-frontend's own precedent, `domain/components/islands/Search.tsx`):
// without it Vite tries to statically analyze/prebundle the path at build
// time and fails outright, not just at request time.
//
// Fail-soft (D29-34): a failed import (index not built, or a genuine 404)
// resolves this module's promise to `null` for the rest of THIS page load —
// both callers treat `null` as "render disabled / show the index-not-built
// notice", never retry mid-session (a fresh navigation re-evaluates the
// module from scratch and gets a fresh chance once a build has landed).

/** One Pagefind result fragment (`PagefindSearchResultStub.data()`'s
 * resolved shape) — only the fields codex's `build-search.ts` actually
 * writes (`meta`/`filters` keys, that script's own `meta`/`filters` object
 * literals) plus Pagefind's own `url`/`content`/`excerpt`. */
export interface PagefindSearchFragment {
  url: string;
  content: string;
  excerpt: string;
  meta: Record<string, string>;
  filters: Record<string, string[]>;
}

export interface PagefindSearchResultStub {
  id: string;
  data: () => Promise<PagefindSearchFragment>;
}

export interface PagefindSearchResponse {
  results: PagefindSearchResultStub[];
}

export interface PagefindSearchOptions {
  filters?: Record<string, string | string[]>;
}

/** The lazily-imported runtime's shape — only the methods this app calls. */
export interface PagefindApi {
  options?: (o: Record<string, unknown>) => Promise<void>;
  init?: () => void;
  /** `term` accepts `null` (P11 D29-101c) — Pagefind's own real API supports
   * a null query for filter-only search; measured live: an EMPTY STRING
   * query returns 0 results even with filters set (686-scale with `null`),
   * so filter-only `/search` (incl. the D29-109c trait link) is dead
   * without callers passing `null` for an empty/whitespace-only query. */
  search: (term: string | null, options?: PagefindSearchOptions) => Promise<PagefindSearchResponse>;
  /** Whole-index (unfiltered) per-dimension value->count map — `/search`'s
   * filter-panel option source (D29-36: "sourced from `pagefind.filters()`
   * counts"). Absent from the hand-rolled type in a couple of very old
   * Pagefind releases, hence optional; codex pins `^1.5.2` (S2), which has
   * it. */
  filters?: () => Promise<Record<string, Record<string, number>>>;
}

let pfPromise: Promise<PagefindApi | null> | null = null;

/** Lazily imports + initializes the built Pagefind runtime, memoized for the
 * whole page load (success OR failure — see the file header). Safe to call
 * from multiple surfaces concurrently (the Omnibar on first focus, `/search`
 * on mount) — they share the one in-flight/resolved promise. */
export function loadPagefind(): Promise<PagefindApi | null> {
  pfPromise ??= (async () => {
    try {
      const pagefindPath = "/pagefind/pagefind.js";
      const pf = (await import(/* @vite-ignore */ pagefindPath)) as PagefindApi;
      await pf.options?.({});
      pf.init?.();
      return pf;
    } catch {
      return null;
    }
  })();
  return pfPromise;
}

/** Test-only reset — the module promise otherwise persists across a test
 * file's whole run (a module-scope-reset convention shared across the app). */
export function _resetPagefindClientForTests(): void {
  pfPromise = null;
}

/** A pure Pagefind-filter-value helper, translating a superseded-visibility
 * boolean: omit the `superseded` filter key entirely when `true` (both
 * editions match, no filtering), else pin it to the single value `"false"`
 * — the exact string `build-search.ts` writes (`filters.superseded =
 * [String(row.superseded)]`). Originally shipped as a standalone pure
 * helper (P4.5 D29-48) even though neither search surface called it by
 * default at the time. P6 R11 (D29-67) AMENDS that carve-out — search now
 * hides superseded content by default too, matching every other surface —
 * so both the Omnibar (`Omnibar.tsx`, always-hidden, no reveal control of
 * its own) and `/search` (`searchUrlState.ts`'s `pagefindFilters`, honoring
 * the page's own `superseded` state/reveal control) call this helper now. */
export function supersededFilter(superseded: boolean): string[] | undefined {
  return superseded ? undefined : ["false"];
}

// ---------------------------------------------------------------------------
// shared fragment -> display-row projection + the Omnibar's category
// grouping — pure, framework-free, so both are directly unit-testable
// without mounting a component or mocking the dynamic import.
// ---------------------------------------------------------------------------

/** A search result, projected for display. `excerpt` is only populated by
 * `/search` (the Omnibar's dropdown never shows excerpts — D29-36 lists
 * name/category/level/edition/book only for the type-ahead). `book`/`name`
 * are always present (falls back to the url when a fragment is genuinely
 * meta-less, matching `build-search.ts`'s own "index the name at minimum"
 * fallback posture). */
export interface SearchDisplayResult {
  id: string;
  url: string;
  name: string;
  category: string;
  edition: string;
  book: string;
  level?: string;
  rarity?: string;
  /** D29-101a/c (P11 S1) — the owning-class label (`meta.class`,
   * class-feature entities only). */
  class?: string;
  excerpt?: string;
}

export function toDisplayResult(fragment: PagefindSearchFragment): SearchDisplayResult {
  return {
    id: fragment.url,
    url: fragment.url,
    name: fragment.meta.title ?? fragment.url,
    category: fragment.meta.category ?? "",
    edition: fragment.meta.edition ?? "",
    book: fragment.meta.book ?? "",
    level: fragment.meta.level,
    rarity: fragment.meta.rarity,
    class: fragment.meta.class,
    excerpt: fragment.excerpt,
  };
}

export interface CategoryGroup {
  category: string;
  items: SearchDisplayResult[];
}

/** Groups an already-ranked result list by `category`, preserving BOTH each
 * item's relative rank within its group and each group's own first-seen
 * order (the Omnibar dropdown's "top ~8, grouped by category" — D29-36 —
 * must not re-sort Pagefind's own relevance ranking). */
export function groupByCategory(results: readonly SearchDisplayResult[]): CategoryGroup[] {
  const order: string[] = [];
  const byCategory = new Map<string, SearchDisplayResult[]>();
  for (const r of results) {
    let bucket = byCategory.get(r.category);
    if (!bucket) {
      bucket = [];
      byCategory.set(r.category, bucket);
      order.push(r.category);
    }
    bucket.push(r);
  }
  return order.map((category) => ({ category, items: byCategory.get(category) ?? [] }));
}

// ---------------------------------------------------------------------------
// P8 S3 (D29-81) — exact-name search boost. `Omnibar.tsx` previously hydrated
// only the first `MAX_RESULTS` (8) stubs, so an exact-name hit Pagefind ranks
// below that (the measured `fireball` case, rank 10) was never even fetched —
// a post-hydration partition over 8 stubs can't see it. Both callers now
// hydrate a wider window (`NAME_BOOST_HYDRATE_WINDOW`) before calling
// `partitionNameMatches`, then clamp the DISPLAYED total back down to their
// own pre-existing budget (8 omnibar / `PAGE_SIZE` search-page) — this
// module only does the pure partition, callers own the hydrate-then-clamp
// wiring (kept here rather than in each surface only so both stay provably
// in sync on the window/cap constants).
// ---------------------------------------------------------------------------

/** How many rank-ordered stubs to hydrate (fetch `.data()` for) before
 * partitioning into name-matches vs the rest — stub `.data()` is the only
 * way to learn a result's name (stubs carry no metadata of their own), and
 * fragments are small enough that widening the scan is cheap (spec's own
 * "fragments are small" call).
 *
 * **PIN CORRECTION (P8 S3 build, measured against the real corpus/index):**
 * the spec text pins this at 40, sized off the one measured case it names
 * (`fireball`, rank 10). The OTHER acceptance query it names in the same
 * breath — `heal` — measures at Pagefind rank 43 (`spell/heal` is index 42
 * of `pf.search("heal")`'s own results; a live Chromium run against the
 * real `data/search/pagefind` index proved this, via
 * `res.results[42].data().meta.title === "Heal"`), past a 40-stub window —
 * so 40 alone would still leave gate D's own `heal` case unfixed. Widened to
 * 60 (comfortable headroom past the measured 43rd rank, still a small
 * per-query fragment-fetch cost) — ship the mechanism, amend the pin. */
export const NAME_BOOST_HYDRATE_WINDOW = 60;

/** Max size of the pinned "Name matches" group, both surfaces. */
export const NAME_MATCH_PIN_CAP = 8;

export interface PartitionedNameMatches {
  /** Exact/prefix name matches, ranked exact-before-prefix then
   * level-then-name, capped at `cap`. */
  pinned: SearchDisplayResult[];
  /** Everything else, in original relative rank order — any matches beyond
   * `cap` (no real corpus case at spec time) fall back in here rather than
   * vanishing outright, appended after the naturally-ranked remainder. */
  rest: SearchDisplayResult[];
}

/** NFD-strip diacritics + casefold + collapse whitespace — the corpus has
 * names like `ixamè`, and a query may carry incidental leading/trailing or
 * doubled internal spaces. */
function normalizeForMatch(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function nameMatchKind(name: string, normalizedQuery: string): "exact" | "prefix" | undefined {
  const normalizedName = normalizeForMatch(name);
  if (normalizedName === normalizedQuery) return "exact";
  if (normalizedName.startsWith(normalizedQuery)) return "prefix";
  return undefined;
}

/** Numeric-ascending, missing-last — mirrors the site-wide "missing sorts
 * last" rule (D29-78's own comparator convention) for the pinned group's
 * level tie-break. `level` is a free-form string field on
 * `SearchDisplayResult` (not every category numbers it), so a non-numeric
 * value is treated the same as absent. */
function compareLevel(a: string | undefined, b: string | undefined): number {
  const an = a === undefined ? Number.NaN : Number(a);
  const bn = b === undefined ? Number.NaN : Number(b);
  const aValid = Number.isFinite(an);
  const bValid = Number.isFinite(bn);
  if (aValid && bValid) return an - bn;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

interface NameMatch {
  result: SearchDisplayResult;
  kind: "exact" | "prefix";
}

function compareNameMatch(a: NameMatch, b: NameMatch): number {
  if (a.kind !== b.kind) return a.kind === "exact" ? -1 : 1;
  const levelCmp = compareLevel(a.result.level, b.result.level);
  if (levelCmp !== 0) return levelCmp;
  return a.result.name.localeCompare(b.result.name);
}

/**
 * Partitions an already rank-ordered, already-hydrated result list into
 * exact/prefix NAME matches (pinned) vs the remainder. Matched against the
 * DISPLAYED name (`SearchDisplayResult.name`, i.e. `meta.title`), case/
 * diacritic-insensitive. A blank query (after trim) is a deliberate no-op —
 * `{ pinned: [], rest: [...results] }` verbatim — the "non-name queries
 * pass through unchanged" gate; a query that matches nothing behaves the
 * same way for the same reason (empty `pinned`).
 */
export function partitionNameMatches(
  results: readonly SearchDisplayResult[],
  query: string,
  cap: number,
): PartitionedNameMatches {
  const normalizedQuery = normalizeForMatch(query);
  if (normalizedQuery === "") return { pinned: [], rest: [...results] };

  const matches: NameMatch[] = [];
  const rest: SearchDisplayResult[] = [];
  for (const r of results) {
    const kind = nameMatchKind(r.name, normalizedQuery);
    if (kind !== undefined) matches.push({ result: r, kind });
    else rest.push(r);
  }
  if (matches.length === 0) return { pinned: [], rest };

  matches.sort(compareNameMatch);
  const pinned = matches.slice(0, cap).map((m) => m.result);
  const overflow = matches.slice(cap).map((m) => m.result);
  return { pinned, rest: [...rest, ...overflow] };
}
