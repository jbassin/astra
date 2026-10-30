/**
 * Pure tree logic for the SectionTree and PhoneMenu islands (lifted out so it's testable
 * without a router/DOM): which top-level subtree a page sits in, which node is the page on
 * screen, and the folder collapse state. Collapse mirrors the Quartz Explorer defaults:
 * folders start collapsed, folders that prefix the current slug open, saved state overrides
 * (the saved map stores `collapsed = !open`).
 */
import { type FullSlug, resolveRelative, simplifySlug } from "./slug";

/** The shape of the generated `EXPLORER_TREE` nodes. */
export interface TreeNode {
  slug: string;
  displayName: string;
  isFolder: boolean;
  children: TreeNode[];
  /** An explicit link (the chronicle nodes); other nodes link to their slug. */
  href?: string;
}

/**
 * The top-level node whose subtree holds the page (`Org` for `Org/Amber-Call/People/…`,
 * `chronicle` for an episode page), or null for pages outside the tree (home, tags).
 */
export function treeRootFor(tree: readonly TreeNode[], currentSlug: string): TreeNode | null {
  const top = currentSlug.split("/").find((p) => p.length > 0);
  if (top === undefined || top === "index") return null;
  return tree.find((n) => n.slug === top) ?? null;
}

/** A slug without leading or trailing slashes or a final `index`. */
function bareSlug(slug: string): string {
  return slug
    .replace(/^\/+/, "")
    .replace(/(^|\/)index$/, "")
    .replace(/\/+$/, "");
}

/** True when the node is the page on screen; a folder is current on its own index page. */
export function isCurrentNode(node: TreeNode, currentSlug: string): boolean {
  if (currentSlug === "") return false;
  return bareSlug(node.slug) === bareSlug(currentSlug);
}

/** A node's link, relative to the page on screen as the Quartz Explorer wrote it. */
export function treeHref(node: TreeNode, currentSlug: string): string {
  return node.href ?? resolveRelative(currentSlug as FullSlug, node.slug as FullSlug);
}

/** The path of nodes from a top-level list down to the current node, or [] when absent. */
export function pathToCurrent(nodes: readonly TreeNode[], currentSlug: string): TreeNode[] {
  for (const n of nodes) {
    if (isCurrentNode(n, currentSlug)) return [n];
    if (n.isFolder) {
      const below = pathToCurrent(n.children, currentSlug);
      if (below.length > 0) return [n, ...below];
    }
  }
  return [];
}

/**
 * The current node with up to `radius` siblings on each side, for the phone menu's short
 * excerpt of the section tree. Empty when the page is not in `nodes`.
 */
export function siblingWindow(
  nodes: readonly TreeNode[],
  currentSlug: string,
  radius = 1,
): TreeNode[] {
  const path = pathToCurrent(nodes, currentSlug);
  const current = path.at(-1);
  if (current === undefined) return [];
  const siblings = path.at(-2)?.children ?? nodes;
  const i = siblings.indexOf(current);
  return siblings.slice(Math.max(0, i - radius), i + radius + 1);
}

/** Segment-boundary prefix match (so "Foo" doesn't open for a sibling "Foo-Bar/baz"). */
export function isPrefixOfCurrent(folderSlug: string, currentSlug: string): boolean {
  const simple = simplifySlug(folderSlug as FullSlug);
  return currentSlug === simple || currentSlug.startsWith(`${simple}/`);
}

/** Every folder slug in the tree (depth-first). */
export function folderSlugs(nodes: TreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.isFolder) {
      out.push(n.slug);
      folderSlugs(n.children, out);
    }
  }
  return out;
}

/** Per-folder open state: default-open if prefix-of-current, overridden by saved. */
export function computeOpen(
  tree: TreeNode[],
  currentSlug: string,
  saved: Map<string, boolean>,
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const slug of folderSlugs(tree)) {
    const savedCollapsed = saved.get(slug);
    const base = savedCollapsed === undefined ? false : !savedCollapsed;
    m.set(slug, base || isPrefixOfCurrent(slug, currentSlug));
  }
  return m;
}
