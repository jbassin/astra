import { createFileRoute } from "@tanstack/react-router";
import EditorView from "@/domain/components/Editor/EditorView";
import { FACTIONS } from "@/generated/factions";
import { CURRENT_REGIONS, CURRENT_SKEIN } from "@/generated/layers";

// ssr: false — the editor is a client-only authoring canvas (Pixi/WebGL); the
// deployment skill's Selective SSR keeps its tree off the server render path
// entirely, so it needs no in-component <ClientOnly> gate.
export const Route = createFileRoute("/editor")({
  ssr: false,
  component: EditorPage,
});

function EditorPage() {
  return (
    <main style={{ pointerEvents: "auto" }}>
      <EditorView factions={[...FACTIONS]} regions={[...CURRENT_REGIONS]} skein={CURRENT_SKEIN} />
    </main>
  );
}
