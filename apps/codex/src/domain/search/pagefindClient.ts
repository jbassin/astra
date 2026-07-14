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
  search: (term: string, options?: PagefindSearchOptions) => Promise<PagefindSearchResponse>;
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
 * file's whole run (same convention as `legacyToggle.ts`'s own
 * `_resetLegacyToggleForTests`). */
export function _resetPagefindClientForTests(): void {
  pfPromise = null;
}

/** The site-wide legacy-toggle predicate (D29-35/-36 M4), translated to a
 * Pagefind filter value: omit the `superseded` filter key entirely when the
 * toggle is ON (both editions match, no filtering), else pin it to the
 * single value `"false"` — the exact string `build-search.ts` writes
 * (`filters.superseded = [String(row.superseded)]`). */
export function supersededFilter(legacy: boolean): string[] | undefined {
  return legacy ? undefined : ["false"];
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
