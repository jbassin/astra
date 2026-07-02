/**
 * Timeline parsing (full-vellum §3.4), the structured replacement for the wiki's raw
 * `<ul><li>` HTML. A `:::timeline` block's body is a markdown list; each item carries an
 * optional leading `{marker}` (era/date) and its content as mdast nodes. Total: a
 * non-list body becomes one marker-less entry (degrade, don't drop).
 */

import type { List, RootContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";

import type { VellumTimeline } from "./model";

const MARKER_RE = /^\s*\{([^}]*)\}\s*/;

/** Pull a leading `{marker}` off an entry's first paragraph; strip it from the text. */
function extractMarker(children: RootContent[]): { marker?: string; children: RootContent[] } {
  const first = children[0];
  if (first?.type === "paragraph") {
    const lead = first.children[0];
    if (lead?.type === "text") {
      const m = MARKER_RE.exec(lead.value);
      if (m) {
        const stripped = lead.value.slice(m[0].length);
        const newInline = stripped
          ? [{ type: "text" as const, value: stripped }, ...first.children.slice(1)]
          : first.children.slice(1);
        const newChildren = [{ ...first, children: newInline }, ...children.slice(1)];
        const marker = (m[1] ?? "").trim();
        return { marker: marker || undefined, children: newChildren };
      }
    }
  }
  return { children };
}

/** Parse a `:::timeline` container directive into a `VellumTimeline` node. */
export function parseTimeline(directive: ContainerDirective): VellumTimeline {
  const list = directive.children.find((c): c is List => c.type === "list");
  if (!list) {
    const entries = directive.children.length > 0 ? [{ children: directive.children }] : [];
    return { type: "timeline", entries };
  }
  const entries = list.children.map((item) => extractMarker(item.children));
  return { type: "timeline", entries };
}
