import { FACTIONS } from "@/generated/factions";
import { CURRENT_BANNERS, CURRENT_REGIONS, CURRENT_SKEIN } from "@/generated/layers";

import EditorView from "./EditorView";

/** The /editor page. Only `vite dev` loads it (`src/routes/editor.tsx`). */
export default function EditorPage() {
  return (
    <main style={{ pointerEvents: "auto" }}>
      <EditorView
        factions={[...FACTIONS]}
        regions={[...CURRENT_REGIONS]}
        skein={CURRENT_SKEIN}
        banners={[...CURRENT_BANNERS]}
      />
    </main>
  );
}
