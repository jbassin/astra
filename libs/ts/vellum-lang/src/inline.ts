/** Shared inline-node helpers for the field-list / timeline parsers. */
import type { PhrasingContent } from "mdast";
import type { CrossRef } from "./model";

/** Flatten phrasing nodes to plain text (a `[[crossref]]` reads as its alias/target). */
export function flattenInline(nodes: readonly PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") {
      out += node.value;
    } else if (node.type === "textDirective") {
    } else if ((node as unknown as CrossRef).type === "crossref") {
      const ref = node as unknown as CrossRef;
      out += ref.alias ?? ref.target;
    } else if ("children" in node) {
      out += flattenInline(node.children);
    }
  }
  return out;
}

/** Trim leading/trailing whitespace off the first/last text node; drop emptied ends. */
export function trimInline(nodes: PhrasingContent[]): PhrasingContent[] {
  const out = nodes.map((n) => ({ ...n }));
  const first = out[0];
  if (first?.type === "text") first.value = first.value.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.type === "text") last.value = last.value.replace(/\s+$/, "");
  return out.filter((n) => !(n.type === "text" && n.value === ""));
}
