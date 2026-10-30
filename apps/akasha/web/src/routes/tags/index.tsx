import { createFileRoute } from "@tanstack/react-router";

import { TagIndex } from "@/domain/components/TagListing";
import { getTagIndex } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// /tags — the tag index (every tag with its first pages). Ports faerrin
// tags/[...tag].astro's tag="index" branch.
export const Route = createFileRoute("/tags/")({
  loader: async () => {
    const view = pageData(await getTagIndex());
    return { slug: view.slug, view };
  },
  head: () => ({ meta: [{ title: "Tags — Akasha" }] }),
  component: TagIndexPage,
});

function TagIndexPage() {
  const { view } = Route.useLoaderData();
  return <TagIndex view={view} />;
}
