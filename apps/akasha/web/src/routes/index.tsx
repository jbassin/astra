import { createFileRoute } from "@tanstack/react-router";

import { ContentArticle } from "@/domain/components/ContentArticle";
import { contentView } from "@/domain/lib/runtimeSite";
import type { FullSlug } from "@/domain/lib/slug";

// The wiki home is the content page with slug "index" (faerrin's root index.vellum).
// The catch-all `$` route owns every other path; "/" is its own index route.
export const Route = createFileRoute("/")({
  loader: () => {
    const view = contentView("index" as FullSlug);
    return { slug: view.slug, view };
  },
  component: HomePage,
});

function HomePage() {
  const { view } = Route.useLoaderData();
  return <ContentArticle view={view} />;
}
