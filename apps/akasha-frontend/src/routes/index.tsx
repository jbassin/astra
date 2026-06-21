import { createFileRoute } from "@tanstack/react-router";
import { PAGES, SITE } from "@/generated/site";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// Slice 2 home — proves the snapshot-derived generated modules flow to the runtime.
// Slice 3 replaces this with the real content/folder/tags routes + loaders.
function HomePage() {
  return (
    <main className="page-shell">
      <h1>{SITE.title}</h1>
      <p>{SITE.description}</p>
      <p>{PAGES.length} pages indexed.</p>
    </main>
  );
}
