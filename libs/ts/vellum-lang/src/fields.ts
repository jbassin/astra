/**
 * Field-list parsing (full-vellum §3.3). A `:::fields` block's body is a run of
 * `Term :: value` lines; `term` is flattened to queryable text, `value` keeps its
 * inline mdast (links + `[[crossref]]`s). The ` :: ` split is scoped strictly here so
 * it can't collide with inline `:` directives (K5). Total: a line without `::` becomes
 * a term with an empty value (degrade, don't drop).
 */

import type { PhrasingContent, RootContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";
import { flattenInline, trimInline } from "./inline";
import type { VellumFields } from "./model";

/**
 * Break a directive body into logical lines of inline nodes: a soft break (`\n`
 * inside a text node) and a paragraph boundary both start a new line.
 */
function toLines(children: readonly RootContent[]): PhrasingContent[][] {
  const lines: PhrasingContent[][] = [];
  let current: PhrasingContent[] = [];
  const flush = () => {
    if (current.length > 0) lines.push(current);
    current = [];
  };
  for (const block of children) {
    if (block.type !== "paragraph") continue;
    for (const child of block.children) {
      if (child.type === "text" && child.value.includes("\n")) {
        const segments = child.value.split("\n");
        segments.forEach((seg, i) => {
          if (i > 0) flush();
          if (seg !== "") current.push({ type: "text", value: seg });
        });
      } else {
        current.push(child);
      }
    }
    flush();
  }
  flush();
  return lines;
}

/** Split one line of inline nodes at the first `::` into a `{term, value}` field. */
function splitField(line: PhrasingContent[]): { term: string; value: PhrasingContent[] } {
  for (let i = 0; i < line.length; i++) {
    const node = line[i];
    if (node?.type === "text" && node.value.includes("::")) {
      const at = node.value.indexOf("::");
      const before = node.value.slice(0, at);
      const after = node.value.slice(at + 2);
      const termNodes: PhrasingContent[] = [
        ...line.slice(0, i),
        ...(before ? [{ type: "text", value: before } as PhrasingContent] : []),
      ];
      const valueNodes: PhrasingContent[] = [
        ...(after ? [{ type: "text", value: after } as PhrasingContent] : []),
        ...line.slice(i + 1),
      ];
      return { term: flattenInline(termNodes).trim(), value: trimInline(valueNodes) };
    }
  }
  return { term: flattenInline(line).trim(), value: [] };
}

/** Parse a `:::fields` container directive into a `VellumFields` node. */
export function parseFields(directive: ContainerDirective): VellumFields {
  const items = toLines(directive.children)
    .map(splitField)
    .filter((item) => item.term !== "" || item.value.length > 0);
  return { type: "fields", items };
}
