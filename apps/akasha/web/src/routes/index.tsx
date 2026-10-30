import { createFileRoute } from "@tanstack/react-router";

import { Home } from "@/domain/components/Home";
import { getHomePage } from "@/domain/lib/pageDataFns";
import { pageData } from "@/domain/lib/staleBuild";

// The home page: the hero, the latest session and the wiki's own front page (the content
// page with slug "index", faerrin's root index.vellum). The catch-all `$` route owns every
// other path; "/" is its own index route. The loader's data carries `slug: "index"`.
export const Route = createFileRoute("/")({
  loader: async () => pageData(await getHomePage()),
  component: HomePage,
});

function HomePage() {
  return <Home data={Route.useLoaderData()} />;
}
