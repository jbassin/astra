// P4.5 S4 (D29-49, adversarial B2) — the `/{category}` split-view route's
// module-scoped, CATEGORY-KEYED client-side memo around `getCategoryListing`.
// Mirrors `pagefindClient.ts`'s memoized-module-promise idiom (this repo's
// existing pattern for exactly this "fetch once, share across the whole page
// load" shape) — without it, `loaderDeps` (required so the loader re-runs at
// all on a row click, B1) makes the naive loader re-fetch the ENTIRE
// 8,485-row `feat` payload over the network on every single row click, a
// silently-expensive regression the latency gates alone wouldn't catch.
//
// **The `typeof window` guard is load-bearing, not defensive boilerplate:**
// astra's SSR frontends run as ONE long-lived Node process behind Caddy
// (`restart: unless-stopped`, not a per-request/serverless runtime — see
// `deploy-artifacts-run-as-user` memory) — a bare module-scope `Map` would be
// shared across EVERY request that process ever serves, not just one page
// load. The route loader also runs on first-request SSR, so guarding the memo
// behind `typeof window !== "undefined"` keeps every server-side invocation
// fresh (never reads OR writes the map) while the CLIENT bundle (one map per
// real browser tab/page-load) gets the sharing this memo exists for.

import { getCategoryListing, getEntityPage } from "@/server/corpusFns";
import type { EntityPageData } from "@/server/entityPageData";
import type { CategoryListingData } from "@/server/listingData";

const listingCache = new Map<string, Promise<CategoryListingData | null>>();

/** Fetch `category`'s listing, memoized per-category for the lifetime of the
 * current page load (client only — see the file header). SSR always calls
 * `getCategoryListing` fresh, never touching this map. */
export function memoizedListing(category: string): Promise<CategoryListingData | null> {
  if (typeof window === "undefined") {
    return getCategoryListing({ data: { category } });
  }
  let promise = listingCache.get(category);
  if (!promise) {
    promise = getCategoryListing({ data: { category } });
    listingCache.set(category, promise);
  }
  return promise;
}

/** Test-only reset — same module-scope-reset convention `pagefindClient.ts`
 * already uses (otherwise the memo persists across a test file's whole run). */
export function _resetListingClientForTests(): void {
  listingCache.clear();
}

// ---------------------------------------------------------------------------
// P8 S3 (D29-82) — a parallel per-slug entity memo. `?entry=<slug>` split-view
// previews (row click AND, new here, j/k-focus-follow) and the standalone
// `/{category}/{slug}` full-page route both resolve through this ONE cache,
// so pressing Enter to open the full page after j/k-scanning past it is a
// cache hit, not a second network round-trip — same `typeof window` SSR
// guard as `memoizedListing` above (a bare module-scope Map would otherwise
// leak across every request this long-lived process ever serves).
// ---------------------------------------------------------------------------

/** Small LRU-ish cap (Map preserves insertion order; a re-touched key is
 * deleted+re-set to move it to the end, and the single oldest key is evicted
 * on overflow) — entities are small (creature pages average 43.5 KB, max
 * measured 361 KB) so this is a modest safety valve against unbounded growth
 * over a very long browsing session, not a real memory concern at this
 * size. */
const ENTITY_CACHE_MAX = 50;

const entityCache = new Map<string, Promise<EntityPageData | null>>();

/** Fetch `{category, slug}`'s entity page, memoized per-(category, slug) for
 * the lifetime of the current page load (client only — see the file
 * header). SSR always calls `getEntityPage` fresh, never touching this map. */
export function memoizedEntity(category: string, slug: string): Promise<EntityPageData | null> {
  if (typeof window === "undefined") {
    return getEntityPage({ data: { category, slug } });
  }
  const key = `${category}/${slug}`;
  const cached = entityCache.get(key);
  if (cached) {
    entityCache.delete(key);
    entityCache.set(key, cached); // touch: move to the most-recently-used end
    return cached;
  }
  const promise = getEntityPage({ data: { category, slug } });
  entityCache.set(key, promise);
  if (entityCache.size > ENTITY_CACHE_MAX) {
    const oldestKey = entityCache.keys().next().value;
    if (oldestKey !== undefined) entityCache.delete(oldestKey);
  }
  return promise;
}

/** Test-only reset — same convention as `_resetListingClientForTests`. */
export function _resetEntityClientForTests(): void {
  entityCache.clear();
}
