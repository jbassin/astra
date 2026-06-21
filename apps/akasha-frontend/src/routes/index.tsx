import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/generated/site";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// Slice 1 placeholder home. Slice 2+ replaces this with the akasha content routes
// (content/folder/tags) reading the snapshot-derived generated modules.
function HomePage() {
  return (
    <main className="page-shell">
      <h1>{SITE.title}</h1>
      <p>{SITE.description}</p>
    </main>
  );
}
