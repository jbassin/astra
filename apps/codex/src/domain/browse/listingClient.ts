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

import { getCategoryListing } from "@/server/corpusFns";
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
