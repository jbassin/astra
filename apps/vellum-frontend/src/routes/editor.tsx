import { createFileRoute } from "@tanstack/react-router";
import { VellumEditor } from "@/domain/editor/VellumEditor";

// ssr: false — the editor is a client-only authoring surface (CodeMirror + a
// localStorage document store; all browser APIs). TanStack Start's Selective SSR
// keeps its tree off the server render path entirely, so it needs no in-component
// <ClientOnly> gate (CodeMirror + the live preview only run in the browser).
export const Route = createFileRoute("/editor")({
  ssr: false,
  component: VellumEditor,
});
