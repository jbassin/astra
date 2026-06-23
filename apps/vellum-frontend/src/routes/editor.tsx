import { createFileRoute } from "@tanstack/react-router";

// ssr: false — the editor is a client-only authoring surface (CodeMirror + a
// localStorage document store; all browser APIs). TanStack Start's Selective SSR
// keeps its tree off the server render path entirely, so it needs no in-component
// <ClientOnly> gate. Slice 1 ships a placeholder; slice 2 ports faerrin's editor
// (CodeMirror host + live preview + doc manager + slash palette + share links) here.
export const Route = createFileRoute("/editor")({
  ssr: false,
  component: EditorPage,
});

function EditorPage() {
  return (
    <main className="editor-shell">
      <p className="editor-placeholder">The editor lands in slice 2.</p>
    </main>
  );
}
