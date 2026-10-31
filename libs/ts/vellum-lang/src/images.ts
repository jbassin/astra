/**
 * Inline images: the one rule for which Markdown image sources a page may use.
 *
 * A wiki page shows an image with plain Markdown, `![alt](path "optional caption")`, where
 * `path` names a file in the wiki's assets folder (`akasha/assets/` in astra-data), written
 * relative to that folder: `althane.png` or `maps/althane.png`. No leading slash, no `..`,
 * no scheme. The site ships those files from its own origin, so a page never makes the
 * reader's browser fetch from another origin (the renderer's same-origin rule).
 *
 * The validator (`scripts/validate-corpus.ts`) checks every image against this rule and the
 * folder's file list; gothic renders an `<img>` only when the app's resolver knows the path.
 */

import type { Image, Nodes } from "mdast";

import type { VellumDocument, VellumNode } from "./model";

/** The image types akasha serves. SVG is left out: it can carry script and links. */
export const IMAGE_EXTENSIONS: readonly string[] = ["png", "jpg", "jpeg", "webp", "gif"];

/** One path segment: starts with a letter or digit (so never `.`, `..` or a dotfile). */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** `scheme:` or a protocol-relative `//host`: anything that leaves the site. */
const EXTERNAL = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/;

/** The lower-case extension of a file name, or "" when it has none. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * True when `path` is in the asset path form: `/`-separated segments of letters, digits,
 * `.`, `_` and `-`, each starting with a letter or digit, ending in an image extension.
 */
export function isAssetPath(path: string): boolean {
  const segments = path.split("/");
  const last = segments.at(-1) ?? "";
  return segments.every((s) => SEGMENT.test(s)) && IMAGE_EXTENSIONS.includes(extensionOf(last));
}

/**
 * Why an image source can't be shown, or null when it names a shipped asset. `assets` is
 * the set of asset paths (relative to the assets folder, `/`-separated).
 */
export function imageSrcProblem(src: string, assets: ReadonlySet<string>): string | null {
  if (EXTERNAL.test(src)) {
    return `external image ${src}: put the file in akasha/assets/ and use its path there`;
  }
  if (src.startsWith("/")) {
    return `image ${src}: write the path relative to akasha/assets/, without a leading /`;
  }
  if (!isAssetPath(src)) {
    return `image ${src}: not an asset path (letters, digits, . _ - and /; one of ${IMAGE_EXTENSIONS.join(", ")})`;
  }
  if (!assets.has(src)) return `image ${src}: no such file in akasha/assets/`;
  return null;
}

function imagesIn(nodes: readonly Nodes[], acc: Image[]): void {
  for (const node of nodes) {
    if (node.type === "image") acc.push(node);
    if ("children" in node) imagesIn(node.children as Nodes[], acc);
  }
}

function imagesInNode(node: VellumNode, acc: Image[]): void {
  switch (node.type) {
    case "prose":
      imagesIn(node.children, acc);
      break;
    case "block":
      if (node.labelNodes) imagesIn(node.labelNodes, acc);
      imagesIn(node.children, acc);
      break;
    case "columns":
      for (const column of node.columns) for (const inner of column) imagesInNode(inner, acc);
      break;
    case "fields":
      for (const item of node.items) imagesIn(item.value, acc);
      break;
    case "timeline":
      for (const entry of node.entries) imagesIn(entry.children, acc);
      break;
  }
}

/** Every Markdown image in a document, in source order. */
export function collectImages(doc: VellumDocument): Image[] {
  const acc: Image[] = [];
  for (const node of doc.nodes) imagesInNode(node, acc);
  return acc;
}
