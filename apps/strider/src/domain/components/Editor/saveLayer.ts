import {
  type EditableChange,
  layerFilename,
  serializeLayer,
  slugify,
} from "@/domain/lib/editorHelpers";

import { writeLayerFn } from "./writeLayerFn";

interface SaveArgs {
  draftChange: EditableChange;
  logMessage: string;
  timestamp: string;
}

export async function saveLayer({ draftChange, logMessage, timestamp }: SaveArgs): Promise<void> {
  const fileSlug =
    draftChange.op === "skein-connect"
      ? slugify(logMessage) || `${draftChange.from}-${draftChange.to}`
      : draftChange.op === "claim"
        ? slugify(logMessage) ||
          `claim-${draftChange.faction ?? "none"}-${draftChange.hexes.length}`
        : draftChange.op === "tithe"
          ? slugify(logMessage) || "tithe"
          : draftChange.op === "update"
            ? slugify(logMessage) || draftChange.slug
            : draftChange.slug;
  const filename = layerFilename(timestamp, fileSlug);
  const content = serializeLayer({
    timestamp,
    message: logMessage,
    changes: [draftChange],
  });

  // The server fn handler throws on validation/write failure.
  await writeLayerFn({ data: { filename, content } });
}
