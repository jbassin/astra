import { createFileRoute, notFound } from "@tanstack/react-router";

import { TagPage } from "@/domain/components/TagListing";
import { tagExists, tagView } from "@/domain/lib/runtimeSite";

// /tags/<tag> — pages carrying a tag (hierarchical tags allowed, e.g.
// /tags/Divinity/Fiends). Ports faerrin tags/[...tag].astro's specific-tag branch.
export const Route = createFileRoute("/tags/$")({
  loader: ({ params }) => {
    const tag = params._splat ?? "";
    if (!tagExists(tag)) throw notFound();
    const view = tagView(tag);
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
