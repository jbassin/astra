import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { BrowseListing } from "@/domain/browse/BrowseListing";
import { memoizedEntity, memoizedListing } from "@/domain/browse/listingClient";
import {
  searchToFilterState,
  validateBrowseSearch,
  withEntryPreserved,
  type BrowseSearch,
} from "@/domain/browse/urlState";

/**
 * D29-35 — the faceted `/{category}` listing that replaced P2's D29-27
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
 *
 * P4.5 S4 (D29-49) — split-column browse: `?entry=<slug>` selects a row for
 * the right pane. Three load-bearing pieces (adversarial B1/B2/B3, spec's
 * own "Loader mechanics"):
 *   - `loaderDeps` is REQUIRED — without it the matchId for `?entry=a` and
 *     `?entry=b` is identical and the loader never re-runs on a row click
 *     (verified against the pinned `@tanstack/router-core@1.171.14`).
 *   - `memoizedListing` (`listingClient.ts`) — a row click only ever fetches
 *     `getEntityPage`, never re-fetches the whole category's listing.
 *   - **P8 S3 (D29-82):** `?entry=` now also resolves through the sibling
 *     `memoizedEntity` (same file), not a bare `getEntityPage` call — j/k
 *     focus-scanning can commit several `?entry=` values per second, and a
 *     later Enter/click onto the FULL `/{category}/{slug}` page (that
 *     route's own loader, same memo) should hit cache rather than re-fetch.
 *   - `onStateChange` resyncs `entry` back into every facet-write's search
 *     object via `withEntryPreserved` (`urlState.ts`) — `entry` lives
 *     outside `BrowseFilterState` entirely, so a bare `filterStateToSearch`
 *     call here would silently strip the split-view selection on any facet
 *     change/clear-all.
 *
 * `rules` never reaches this route for the literal category "rules" — the
 * static top-level `/rules` route (`routes/rules.tsx`) always out-ranks a
 * dynamic `$category` segment for that exact path (proven by
 * `ssrSmoke.test.ts`'s own "out-ranks the $category/ route" case) — so no
 * runtime guard is needed here for D29-49's "except `rules`" exclusion.
 */
export const Route = createFileRoute("/$category/")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => validateBrowseSearch(search),
  loaderDeps: ({ search }) => ({ entry: search.entry }),
  loader: async ({ params, deps }) => {
    const [listing, entry] = await Promise.all([
      memoizedListing(params.category),
      deps.entry !== undefined
        ? memoizedEntity(params.category, deps.entry)
        : Promise.resolve(null),
    ]);
    if (!listing) throw notFound();
    return { ...listing, entry };
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
        entrySlug={search.entry}
        entryData={data.entry}
        onStateChange={(updater) => {
          const next = updater(state);
          void navigate({ search: withEntryPreserved(next, search), replace: true });
        }}
        onEntrySelect={(slug) => {
          // D29-49 — a plain, NON-replace push: back/forward steps
          // entry-to-entry through visited rows.
          void navigate({ search: { ...search, entry: slug } });
        }}
        onEntryPreview={(slug) => {
          // P8 S3 (D29-82) — REPLACE, never push: a j/k scan across many
          // rows must not create a history entry per row (gate E).
          void navigate({ search: { ...search, entry: slug }, replace: true });
        }}
      />
    </main>
  );
}
