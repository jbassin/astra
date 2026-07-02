/**
 * Cross-reference parsing (full-vellum §3.2). `[[target#heading|alias]]` is split out
 * of mdast `text` nodes into custom `crossref` nodes by a post-parse unist transform
 * (K1) — pure + total, and it naturally skips code spans (separate node types). It
 * does NOT resolve targets; that is akasha-backend's job (0007). The same grammar is
 * mirrored by the Python regex scan (K2); the shared `.meta.json` is the parity gate.
 */
import type { Nodes, PhrasingContent, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

import type { CrossRef, VellumDocument, VellumNode } from "./model";

/** `[[target]]`, `[[target#heading]]`, `[[target|alias]]`, `[[target#heading|alias]]`. */
export const CROSSREF_RE = /\[\[([^[\]|#]+)(?:#([^[\]|]+))?(?:\|([^[\]]+))?\]\]/g;

/** Split a text value into alternating text + crossref nodes (no match → one text node). */
export function splitCrossRefs(value: string): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  const re = new RegExp(CROSSREF_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null = re.exec(value);
  while (m !== null) {
    if (m.index > last) parts.push({ type: "text", value: value.slice(last, m.index) });
    const ref: CrossRef = { type: "crossref", target: (m[1] ?? "").trim() };
    if (m[2] != null) ref.heading = m[2].trim();
    if (m[3] != null) ref.alias = m[3].trim();
    parts.push(ref as unknown as PhrasingContent);
    last = re.lastIndex;
    m = re.exec(value);
  }
  if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
  return parts;
}

/** Mutate an mdast tree in place: replace `[[…]]` runs in text nodes with crossref nodes. */
export function transformCrossRefs(tree: Root): void {
  visit(tree, "text", (node: Text, index, parent) => {
    if (parent == null || index == null || !node.value.includes("[[")) return;
    const parts = splitCrossRefs(node.value);
    if (parts.length === 1 && parts[0]?.type === "text") return; // no crossref matched
    (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
    return index + parts.length; // continue past the inserted nodes
  });
}

function walkMdast(node: unknown, out: CrossRef[]): void {
  if (node == null || typeof node !== "object") return;
  const n = node as { type?: string; children?: unknown[] };
  if (n.type === "crossref") {
    const ref = node as CrossRef;
    out.push({
      type: "crossref",
      target: ref.target,
      ...(ref.heading != null ? { heading: ref.heading } : {}),
      ...(ref.alias != null ? { alias: ref.alias } : {}),
    });
    return;
  }
  if (Array.isArray(n.children)) for (const child of n.children) walkMdast(child, out);
}

/** All crossrefs in a parsed document, in document order — the metadata-parity input. */
export function collectCrossRefs(doc: VellumDocument): CrossRef[] {
  const out: CrossRef[] = [];
  const walkAll = (nodes: readonly unknown[]): void => {
    for (const c of nodes) walkMdast(c as Nodes, out);
  };
  const walkVellum = (vn: VellumNode): void => {
    switch (vn.type) {
      case "prose":
        walkAll(vn.children);
        break;
      case "block":
        if (vn.labelNodes) walkAll(vn.labelNodes);
        walkAll(vn.children);
        break;
      case "columns":
        for (const col of vn.columns) for (const inner of col) walkVellum(inner);
        break;
      case "fields":
        for (const it of vn.items) walkAll(it.value);
        break;
      case "timeline":
        for (const e of vn.entries) walkAll(e.children);
        break;
    }
  };
  for (const node of doc.nodes) walkVellum(node);
  return out;
}
