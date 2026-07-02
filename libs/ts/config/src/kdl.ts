/**
 * Thin KDL → JS adapter (`@bgotink/kdl`) — the TS twin of `libs/py/config/kdl.py`.
 * Keeps KDL at the edge: parse here, return plain objects/scalars + `SecretRef`,
 * never thread raw KDL nodes onward. The ontology accessor reuses these helpers.
 */

import { readFileSync } from "node:fs";

import { type Document, type Node, parse } from "@bgotink/kdl";

import { SecretRef } from "./secrets";

export type LeafValue = string | number | boolean | bigint | null | SecretRef | unknown[];

export function loadDocument(path: string): Document {
  return parse(readFileSync(path, "utf8"));
}

/** A node's `key=value` properties as a plain object. */
export function nodeProps(node: Node): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, entry] of node.getPropertyEntryMap()) props[key] = entry.getValue();
  return props;
}

/** KDL kebab-case node name → JS camelCase key. */
export function camel(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

function args(node: Node): unknown[] {
  return node.getArgumentEntries().map((e) => e.getValue());
}

function childNodes(node: Node): Node[] {
  return node.children?.nodes ?? [];
}

/** Resolve a leaf KDL node to a scalar, a `SecretRef`, an array, or null. */
export function leafValue(node: Node, secretsFile?: string): LeafValue {
  const props = nodeProps(node);
  if ("ref" in props) return new SecretRef(String(props.ref), secretsFile);
  const a = args(node);
  if (a.length === 1) return a[0] as LeafValue;
  if (a.length === 0) return null;
  return a;
}

/** A node's children as `{ camelName: leafValue | nested object }`. */
export function childrenAsObject(node: Node, secretsFile?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const child of childNodes(node)) {
    const key = camel(child.name.name);
    const hasChildren = childNodes(child).length > 0;
    const hasArgs = child.getArgumentEntries().length > 0;
    if (hasChildren && !hasArgs && !("ref" in nodeProps(child))) {
      out[key] = childrenAsObject(child, secretsFile);
    } else {
      out[key] = leafValue(child, secretsFile);
    }
  }
  return out;
}

/** Each top-level node → its children object (the config-namespace shape). */
export function topLevelNamespaces(
  doc: Document,
  secretsFile?: string,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const node of doc.nodes) out[camel(node.name.name)] = childrenAsObject(node, secretsFile);
  return out;
}
