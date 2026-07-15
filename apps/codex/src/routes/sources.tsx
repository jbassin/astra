import { createFileRoute } from "@tanstack/react-router";

import { SourcesIndexView } from "@/domain/sources/SourcesIndexView";
import { getSourcesIndex } from "@/server/corpusFns";

/**
 * D29-43 — `/sources`: the aggregate book index (ALL ~496 normalized book
 * strings, incl. the Foundry-only "Other" bucket), grouped by product line,
 * distinct from `/source`'s own P3 faceted listing of the 245 `source`-
 * category book ENTITIES (both remain — spec's own "relationship to the
 * existing `/source` category listing" note). A FLAT top-level route file,
 * matching `rules.tsx`/`search.tsx`'s own pattern (a static path segment
 * out-ranks any dynamic `$category` match for the literal `/sources`
 * segment, the same verified-safe precedence `/rules` already relies on).
 *
 * No `validateSearch`/state at all (D29-43: "a plain server-rendered page —
 * NO island") — the "Other" bucket's collapse state is a native `<details>`
 * (zero JS), and there is no facet/filter UI on this page.
 */
export const Route = createFileRoute("/sources")({
  loader: () => getSourcesIndex(),
  head: () => ({
    meta: [{ title: "Sources · codex" }],
  }),
  component: SourcesRouteComponent,
});

function SourcesRouteComponent() {
  const data = Route.useLoaderData();
  return (
    <main className="wrap-wide">
      <header className="codex-listing-header">
        <h1 className="codex-listing-title">Sources</h1>
        <p className="codex-listing-count">{data.books.length} books</p>
      </header>
      <SourcesIndexView books={data.books} />
    </main>
  );
}
