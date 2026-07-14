import { createFileRoute, notFound } from "@tanstack/react-router";

import { CategoryListing } from "@/domain/render/listing";
import { getCategoryListing } from "@/server/corpusFns";

/**
 * D29-27 — `/{category}`: one A–Z listing from `_index.json` rows (name -> link,
 * level, rarity, source book, edition pill), letter-anchored. Explicitly
 * THROWAWAY — no facet UI/pagination/sort (P3 replaces this page). Listing rows
 * navigate; they do NOT get a Popover mount (that's the sibling `$slug` entity
 * route only, D29-28 — hover on an 8k-row listing would thrash fetches).
 */
export const Route = createFileRoute("/$category/")({
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
  return (
    <main className="wrap">
      <CategoryListing data={data} />
    </main>
  );
}
