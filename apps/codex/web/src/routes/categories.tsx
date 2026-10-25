import { createFileRoute } from "@tanstack/react-router";

import { CategoryDirectory } from "@/domain/render/listing";
import { getCategoryDirectory } from "@/server/corpusFns";

/**
 * The "browse everything" category directory: the `getCategoryDirectory`
 * server fn + `CategoryDirectory` component; the landing page (`/`) owns
 * the tiles + hero search instead. Deliberately plain (no facet UI, no
 * pagination, no sort options) — this is the header nav's "All categories"
 * link target (the full 88-category directory, though the nav itself is
 * curated) and the landing page's own "browse all categories" link.
 */
export const Route = createFileRoute("/categories")({
  loader: () => getCategoryDirectory(),
  head: () => ({
    meta: [{ title: "codex — all categories" }],
  }),
  component: CategoriesComponent,
});

function CategoriesComponent() {
  const data = Route.useLoaderData();
  return (
    <main className="wrap">
      <h1 className="hero-title">All categories</h1>
      <p className="hero-lede">Every category in the codex, grouped and counted.</p>
      {/* A distinct entry beside the category groups (not
          inside them — the `source` category row below stays untouched,
          this links the SEPARATE `/sources` aggregate book index). */}
      <nav className="codex-directory-extra">
        <a href="/sources">Sources index →</a>
      </nav>
      <CategoryDirectory data={data} />
    </main>
  );
}
