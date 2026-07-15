import { createFileRoute } from "@tanstack/react-router";

import { CategoryDirectory } from "@/domain/render/listing";
import { getCategoryDirectory } from "@/server/corpusFns";

/**
 * P4.5 S2 (D29-47) — the demoted "browse everything" category directory
 * (ex-`/`, P2 S3's D29-27 throwaway page). Same `getCategoryDirectory`
 * server fn + `CategoryDirectory` component, unchanged data shape — only the
 * route file and its surrounding page chrome moved here; the landing page
 * (`/`) now owns the R4 tiles + hero search instead. Still THROWAWAY (no
 * facet UI, no pagination, no sort options) — this is the "Everything"
 * nav dropdown's target and the landing page's own "browse all categories"
 * link.
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
      {/* P4 S4 (D29-43): a distinct entry beside the category groups (not
          inside them — the `source` category row below stays untouched,
          this links the SEPARATE `/sources` aggregate book index). */}
      <nav className="codex-directory-extra">
        <a href="/sources">Sources index →</a>
      </nav>
      <CategoryDirectory data={data} />
    </main>
  );
}
