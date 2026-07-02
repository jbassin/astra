import { DocumentView } from "@astra/gothic";
import { parseDocument, type ThemeMode } from "@astra/vellum-lang";
import { useMemo } from "react";

import styles from "./editor.module.css";

/**
 * Live preview. Renders the same renderer library the export service will use
 * (@astra/gothic's DocumentView), inside the [data-vellum-export] boundary — so
 * "what you see" is "what the PNG will be" (R-15). No `resolveCrossref` is
 * passed: an authoring tool has no resolved edge graph, so `[[crossrefs]]`
 * render as gothic's styled placeholders (the intended standalone behavior).
 */
export function Preview({ source, mode }: { source: string; mode: ThemeMode }) {
  const document = useMemo(() => parseDocument(source, { mode }), [source, mode]);
  return (
    <div className={styles.previewSurface} data-mode={mode}>
      {document.nodes.length === 0 ? (
        <p className={styles.previewEmpty}>
          Nothing to render yet. Write some markdown, or open a <code>:::statblock</code> /{" "}
          <code>:::handout</code> block.
        </p>
      ) : (
        <DocumentView document={document} />
      )}
    </div>
  );
}
