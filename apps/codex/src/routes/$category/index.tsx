import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { BrowseListing } from "@/domain/browse/BrowseListing";
import { useLegacyToggle } from "@/domain/browse/legacyToggle";
import {
  filterStateToSearch,
  searchToFilterState,
  validateBrowseSearch,
  type BrowseSearch,
} from "@/domain/browse/urlState";
import { getCategoryListing } from "@/server/corpusFns";

/**
 * D29-35 — `/{category}`: the faceted listing that replaced P2's D29-27
 * throwaway A–Z page. The loader still ships every row (no server-side
 * filtering — D29-35's "filter locally" stakeholder call); everything below
 * `component` is state<->URL wiring, the actual filter/render logic lives in
 * `BrowseListing.tsx`/`filterEngine.ts`/`urlState.ts` (kept route-agnostic
 * and independently unit-tested there).
 */
export const Route = createFileRoute("/$category/")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => validateBrowseSearch(search),
  loader: async ({ params }) => {
    const data = await getCategoryListing({ data: { category: params.category } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `${loaderData.category} · codex` }] } : {},
  component: CategoryIndexComponent,
});

function CategoryIndexComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const liveLegacy = useLegacyToggle();

  // **The SSR/hydration seam (M4):** the FIRST render — server AND the
  // matching first client render, before any effect has run — must derive
  // `legacy` from `search.legacy` alone. `search` is isomorphic (the SAME
  // `validateSearch` output on both sides for a given URL), so this is
  // hydration-safe by construction; `useLegacyToggle()`'s live value is
  // NOT (its `getServerSnapshot` is always `false`, so trusting it for the
  // very first paint would silently ignore a shared `?legacy=1` link's
  // SSR'd HTML — verified: `ssr.fetch()` against a real `legacy=1` URL
  // rendered the non-legacy count until this two-phase read was added).
  // Only AFTER mount (`hasHydrated`) does the LIVE site-wide toggle take
  // over, per M4's "client-side navigation preserves the live toggle".
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => setHasHydrated(true), []);
  const effectiveLegacy = hasHydrated ? liveLegacy : search.legacy === true;

  const state = useMemo(
    () => ({ ...searchToFilterState(search), legacy: effectiveLegacy }),
    [search, effectiveLegacy],
  );

  // Reflect the live toggle into THIS route's own URL whenever it changes,
  // so the address bar stays copy-shareable (D29-35). Guarded to a no-op
  // when already in sync — safe to depend on `search` too since it can only
  // ever converge, never loop. Naturally inert until `hasHydrated` (before
  // that, `effectiveLegacy === search.legacy` by construction above).
  useEffect(() => {
    const currentlyHasLegacyParam = search.legacy === true;
    if (currentlyHasLegacyParam === effectiveLegacy) return;
    const next: BrowseSearch = { ...search };
    if (effectiveLegacy) next.legacy = true;
    else delete next.legacy;
    void navigate({ search: next, replace: true });
  }, [effectiveLegacy, search, navigate]);

  return (
    <main className="wrap-wide">
      <BrowseListing
        category={data.category}
        rows={data.rows}
        state={state}
        onStateChange={(updater) => {
          const next = updater(state);
          // Always resync `legacy` to the effective toggle regardless of what
          // the updater did to it (e.g. `clearAllFilters()` resets every
          // field, including `legacy` — "clear filters" must not silently
          // flip the site-wide legacy preference as a side effect).
          const nextSearch = filterStateToSearch({ ...next, legacy: effectiveLegacy });
          void navigate({ search: nextSearch, replace: true });
        }}
      />
    </main>
  );
}
