/**
 * Pure collapse-state logic for the Explorer island (lifted out so it's testable
 * without a router/DOM). Mirrors Quartz Explorer defaults: folderDefaultState
 * "collapsed", auto-open folders that prefix the current slug, saved state overrides
 * (the saved map stores `collapsed = !open`).
 */
import { type FullSlug, simplifySlug } from "./slug";

export interface TreeNode {
  slug: string;
  displayName: string;
  isFolder: boolean;
  children: TreeNode[];
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
