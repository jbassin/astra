import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { BrowseListing } from "@/domain/browse/BrowseListing";
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
 *
 * P4.5 D29-48: the M4 two-phase SSR/live-toggle read is GONE — `state` is
 * derived from `search` alone (isomorphic on both sides), no
 * `useState`/`useEffect`/hydration dance, since there's no second, live,
 * cross-page source of truth left to reconcile against (the site-wide
 * legacy toggle mechanism is deleted outright). Widening to superseded
 * content is just an ordinary facet write now (`FacetPanel.tsx`'s own
 * Edition-visibility section), so `onStateChange` needs no special
 * `superseded` resync either.
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

  const state = useMemo(() => searchToFilterState(search), [search]);

  return (
    <main className="wrap-wide">
      <BrowseListing
        category={data.category}
        rows={data.rows}
        state={state}
        onStateChange={(updater) => {
          const next = updater(state);
          void navigate({ search: filterStateToSearch(next), replace: true });
        }}
      />
    </main>
  );
}
