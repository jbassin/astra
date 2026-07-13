/**
 * Pure AoN Elasticsearch query-shape + pagination logic (D29-5). Kept free of any HTTP
 * concerns (that's `aonClient.ts`) so it's testable with a synthetic `search`/`agg`
 * function — no network, no git, no real endpoint required.
 */

export interface EsHit {
  _id: string;
  _source: unknown;
  sort: unknown[];
}

export interface EsSearchResponse {
  hits: { hits: EsHit[] };
}

export interface EsCategoryBucket {
  key: string;
  doc_count: number;
}

export interface EsAggResponse {
  aggregations: { categories: { buckets: EsCategoryBucket[] } };
}

export type SearchFn = (body: unknown) => Promise<EsSearchResponse>;
export type AggFn = (body: unknown) => Promise<EsAggResponse>;

export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_CATEGORY_AGG_SIZE = 200;

/** Category discovery: a `size:0` terms aggregation on `category` (D29-5 step 1;
 * live-verified — 93 buckets, `equipment` 8,642 / `feat` 8,460 at the top). */
export function buildCategoryAggQuery(
  size: number = DEFAULT_CATEGORY_AGG_SIZE,
): Record<string, unknown> {
  return { size: 0, aggs: { categories: { terms: { field: "category", size } } } };
}

export interface CategoryCount {
  category: string;
  docCount: number;
}

export function parseCategoryBuckets(res: EsAggResponse): CategoryCount[] {
  return res.aggregations.categories.buckets.map((b) => ({
    category: b.key,
    docCount: b.doc_count,
  }));
}

export async function discoverCategories(
  agg: AggFn,
  size: number = DEFAULT_CATEGORY_AGG_SIZE,
): Promise<CategoryCount[]> {
  const res = await agg(buildCategoryAggQuery(size));
  return parseCategoryBuckets(res);
}

/**
 * One page's request body for a category `term` query. Sort is FIXED to
 * `name.keyword` + `url` tiebreaker — live-verified against the AoN cluster. A `_id`
 * sort is REJECTED by that cluster (`illegal_argument_exception: Fielddata access on
 * the _id field is disallowed`) — never add it back here.
 */
export function buildCategoryPageQuery(
  category: string,
  pageSize: number,
  searchAfter?: unknown[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    size: pageSize,
    query: { term: { category } },
    sort: [{ "name.keyword": "asc" }, { url: "asc" }],
  };
  if (searchAfter !== undefined) body.search_after = searchAfter;
  return body;
}

export interface FetchAllOptions {
  pageSize?: number;
  throttle?: () => Promise<void>;
}

/**
 * Pages an entire category via `search_after` — handles categories above the 10k
 * `size`/`from` depth limit (search_after has no such cap; `equipment` 8,642 and
 * `feat` 8,460 sit close to it today). `throttle`, if given, is awaited before every
 * request including the first, so the AoN etiquette ceiling (D29-5) covers the whole
 * run, not just steady-state pages.
 */
export async function fetchAllForCategory(
  category: string,
  search: SearchFn,
  opts: FetchAllOptions = {},
): Promise<EsHit[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const hits: EsHit[] = [];
  let searchAfter: unknown[] | undefined;

  for (;;) {
    if (opts.throttle) await opts.throttle();
    const res = await search(buildCategoryPageQuery(category, pageSize, searchAfter));
    const page = res.hits.hits;
    if (page.length === 0) break;
    hits.push(...page);
    const lastHit = page[page.length - 1];
    if (lastHit === undefined) break; // unreachable given the length check above
    searchAfter = lastHit.sort;
    if (page.length < pageSize) break;
  }

  return hits;
}
