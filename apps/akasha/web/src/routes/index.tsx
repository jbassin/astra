import { createFileRoute } from "@tanstack/react-router";

import { ContentArticle } from "@/domain/components/ContentArticle";
import { getHomePage } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// The wiki home is the content page with slug "index" (faerrin's root index.vellum).
// The catch-all `$` route owns every other path; "/" is its own index route.
export const Route = createFileRoute("/")({
  loader: async () => {
    const view = pageData(await getHomePage());
    return { slug: view.slug, view };
  },
  component: HomePage,
});

function HomePage() {
  const { view } = Route.useLoaderData();
  return <ContentArticle view={view} />;
}
