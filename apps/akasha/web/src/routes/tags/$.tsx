import { createFileRoute, notFound } from "@tanstack/react-router";

import { TagPage } from "@/domain/components/TagListing";
import { getTagPage } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// /tags/<tag> — pages carrying a tag (hierarchical tags allowed, e.g.
// /tags/Divinity/Fiends). Ports faerrin tags/[...tag].astro's specific-tag branch.
export const Route = createFileRoute("/tags/$")({
  loader: async ({ params }) => {
    const tag = params._splat ?? "";
    const view = pageData(await getTagPage({ data: tag }));
    if (!view) throw notFound();
    return { slug: view.slug, tag, view };
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `Tag: ${loaderData.tag} — Akasha` }] } : {},
  component: TagRoutePage,
});

function TagRoutePage() {
  const { view } = Route.useLoaderData();
  return <TagPage view={view} />;
}
