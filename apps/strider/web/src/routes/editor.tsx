import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The editor writes layer files into the checkout, so it runs only under `vite dev`; a
// production container has no mount for content/layers and would lose every save. A
// production build replaces `import.meta.env.DEV` with false, so the dynamic import below is
// dead code: neither the editor nor its write server function reaches either bundle, and
// /editor renders the not-found page with a 404.
//
// In dev the route stays `ssr: false`: the editor is a client-only Pixi/WebGL canvas, and
// Selective SSR keeps it off the server render path.
const EditorPage = import.meta.env.DEV
  ? lazy(() => import("@/domain/components/Editor/EditorPage"))
  : null;

export const Route = createFileRoute("/editor")({
  ssr: !import.meta.env.DEV,
  beforeLoad: () => {
    if (!EditorPage) throw notFound();
  },
  component: EditorRoute,
});

function EditorRoute() {
  if (!EditorPage) return null;
  return (
    <Suspense>
      <EditorPage />
    </Suspense>
  );
}
