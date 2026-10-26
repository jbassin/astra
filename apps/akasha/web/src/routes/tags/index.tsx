import { createFileRoute } from "@tanstack/react-router";

import { TagIndex } from "@/domain/components/TagListing";
import { getTagIndex } from "@/domain/lib/pageDataFns";

// /tags — the tag index (every tag + its first 10 pages). Ports faerrin
// tags/[...tag].astro's tag="index" branch.
export const Route = createFileRoute("/tags/")({
  loader: async () => {
    const view = await getTagIndex();
    return { slug: view.slug, view };
  },
  head: () => ({ meta: [{ title: "Tag Index — Akasha" }] }),
  component: TagIndexPage,
});

function TagIndexPage() {
  const { view } = Route.useLoaderData();
  return <TagIndex view={view} />;
}
