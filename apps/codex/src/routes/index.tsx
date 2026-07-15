import { createFileRoute } from "@tanstack/react-router";

import { CategoryDirectory } from "@/domain/render/listing";
import { getCategoryDirectory } from "@/server/corpusFns";

/**
 * D29-27 — the `/` category directory: every category + its corpus count,
 * grouped by `categoryGroupOf` (S1's own render-group taxonomy). Explicitly
 * THROWAWAY (spec: "no facet UI, no pagination, no sort options") — P3's
 * faceted browse replaces this page entirely; it exists only so every category
 * (and therefore every entity) is reachable by click at the P2 exit gate.
 */
export const Route = createFileRoute("/")({
  loader: () => getCategoryDirectory(),
  head: () => ({
    meta: [{ title: "codex — category directory" }],
  }),
  component: IndexComponent,
});

function IndexComponent() {
  const data = Route.useLoaderData();
  return (
    <main className="wrap">
      <h1 className="hero-title">codex</h1>
      <p className="hero-lede">
        A Pathfinder Second Edition rules &amp; compendium reference. Every entity lives at{" "}
        <code>
          /{"{category}"}/{"{slug}"}
        </code>{" "}
        — pick a category below, or jump straight to{" "}
        <a href="/creature/red-dragon-adult">/creature/red-dragon-adult</a> or{" "}
        <a href="/spell/heal">/spell/heal</a>.
      </p>
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
