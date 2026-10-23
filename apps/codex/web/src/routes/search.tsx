import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SearchPage } from "@/domain/search/SearchPage";
import { validateSearchPageSearch, type SearchPageSearch } from "@/domain/search/searchUrlState";

/**
 * D29-36 — `/search`: the results page. No loader (search is entirely
 * client-fetched off the built Pagefind index, D29-34 — there is nothing for
 * the server to read at request time); the route SSRs the shell + a
 * `<noscript>` no-JS notice (search genuinely cannot work without JS, so
 * this is an honest degrade, not a progressive-enhancement placeholder) and
 * mounts `SearchPage` unconditionally — its own first render is identical
 * server- and client-side (see that component's own header comment), so no
 * `<ClientOnly>` boundary is needed here.
 */
export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchPageSearch =>
    validateSearchPageSearch(search),
  head: ({ match }) => ({
    meta: [{ title: match.search.q ? `“${match.search.q}” · Search · codex` : "Search · codex" }],
  }),
  component: SearchRouteComponent,
});

function SearchRouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <main className="wrap-wide">
      <h1 className="codex-listing-title">Search</h1>
      <noscript>
        <p className="codex-search-status">
          Search requires JavaScript &mdash; the results are fetched client-side from the built
          search index.
        </p>
      </noscript>
      <SearchPage
        search={search}
        onSearchChange={(updater) => {
          const next = updater(search);
          void navigate({ search: next, replace: true });
        }}
      />
    </main>
  );
}
