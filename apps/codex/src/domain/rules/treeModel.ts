// P4 S2 (D29-40) — the rules tree's pure client-side logic: a book-scoped
// stable node key, the akasha `computeOpen` collapse-state port, the legacy
// (superseded) predicate applied AS A TREE PRUNE, the name quick-filter, and
// a DFS pre-order walk. Everything here is a plain function over `TreeNode[]`
// — no React, no router, no localStorage — so it's directly unit-testable
// with zero DOM/Start-runtime machinery (mirrors akasha-frontend's
// `explorerState.ts` split: the ISLAND, `RulesTree.tsx`, owns
// localStorage/router/React state, this module owns the algorithm).
//
// **`dfsPreOrder` is built here, in S2, even though the PAGER that consumes
// it is S3 territory (D29-41)** — the spec's own §3 "Deliverables" lists
// `treeModel.ts`'s scope as "build/filter/computeOpen port/DFS walk" as ONE
// S2 file, and S1's build record explicitly flagged the DFS helper as
// deliberately deferred past S1 into "frontend slice territory". S3's
// `ReadingOrderPager` should import `dfsPreOrder` from here rather than
// re-deriving it — the spec's own DFS pager semantics ("next from a
// chaptered node descends INTO its subtree, symmetric by construction,
// one-sided at book ends") fall directly out of pre-order array adjacency:
// `arr[i-1]`/`arr[i+1]` around the current node's index, scoped to one
// book's `dfsPreOrder(book.nodes)` (never merge across books — D29-41 "never
// crosses a book boundary").

import type { TreeNode } from "@/schema/rulesTree";

/**
 * A stable, book-scoped key for a tree node — the collapse-state map's/React
 * `key`'s identity. Real (`id`-bearing) nodes use their `CodexId` verbatim
 * (globally unique already, no book prefix needed). Synthetic nodes (no
 * `id` — pinned at exactly 2 in the real corpus, D29-39) key on
 * `book + the full ancestor-name path down to and including this node` —
 * the SAME `(name, path)` identity `rulesTree.ts`'s own `nodeKey` uses to
 * resolve/memoize a synthetic placeholder at transform time, so two
 * synthetic nodes can only ever collide here if the transform itself would
 * have collapsed them into one node already.
 */
export function nodeKeyFor(book: string, path: readonly string[], node: TreeNode): string {
  if (node.id !== undefined) return node.id;
  return `${book}\u0000${[...path, node.name].join("\u0000")}`;
}

/** Every node (at any depth) that HAS children — the "folder" set akasha's
 * `folderSlugs` computes, scoped to one book's root list. Only these keys
 * ever need a collapse-state entry (a leaf has nothing to expand). */
function nodesWithChildren(
  book: string,
  nodes: readonly TreeNode[],
  path: readonly string[],
  out: string[],
): void {
  for (const n of nodes) {
    if (n.children.length > 0) {
      out.push(nodeKeyFor(book, path, n));
      nodesWithChildren(book, n.children, [...path, n.name], out);
    }
  }
}

/**
 * The akasha `computeOpen` port (`explorerState.ts`): per-node open state,
 * default CLOSED (Quartz's `folderDefaultState: "collapsed"`), overridden by
 * `saved` (the caller's localStorage-derived map — pass an EMPTY map for the
 * SSR-safe first-render seed, D29-40's own "initial render from an empty
 * saved-map" text), force-OPEN when the node is an ancestor of (or is
 * itself) `currentId` — akasha's `isPrefixOfCurrent` re-expressed as tree
 * ancestry (id-containment) instead of a slug-string prefix, since this tree
 * has no flat slug namespace to prefix-match against. `currentId` is
 * `undefined` on the plain `/rules` browse page (S2 — no "current doc") and
 * a real entity id on the S3 sidebar (scoped to the book the current doc
 * lives in, path auto-expanded to it).
 */
export function computeOpen(
  book: string,
  nodes: readonly TreeNode[],
  currentId: string | undefined,
  saved: ReadonlyMap<string, boolean>,
): Map<string, boolean> {
  const open = new Map<string, boolean>();

  function walk(node: TreeNode, path: readonly string[]): boolean {
    const key = nodeKeyFor(book, path, node);
    let containsCurrent = currentId !== undefined && node.id === currentId;
    const nextPath = [...path, node.name];
    for (const child of node.children) {
      if (walk(child, nextPath)) containsCurrent = true;
    }
    if (node.children.length > 0) {
      const savedOpen = saved.get(key) ?? false;
      open.set(key, savedOpen || containsCurrent);
    }
    return containsCurrent;
  }

  for (const root of nodes) walk(root, []);
  return open;
}

/** Every collapsible node's key, book-scoped — exported for a caller that
 * wants to e.g. "expand all" without walking the tree itself. */
export function collapsibleKeys(book: string, nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  nodesWithChildren(book, nodes, [], out);
  return out;
}

/**
 * The superseded-visibility predicate, applied as a TREE PRUNE (D29-40's "a
 * branch whose descendants are all hidden collapses to nothing; parents with
 * `id` stay if their own doc is visible"). P4.5 D29-48 renamed this from
 * `pruneForLegacy` (a plain per-page URL read now, no site-wide toggle) —
 * same signature shape, same semantics. `supersededOn === true` is a no-op
 * (returns `nodes` unchanged — everything is visible). `supersededOn ===
 * false`: a node's OWN doc is visible iff it has an `id` and is NOT
 * `superseded`; a node survives iff its own doc is visible OR at least one
 * descendant survives (recursively) — so a `superseded` PARENT whose only
 * never-remastered child is still current (the real corpus's Gamemastery
 * Guide "Chapter 2: Tools" → "Item Quirks" shape: the chapter root is 100%
 * superseded except that one child) still renders as a wrapper down to the
 * visible child, never silently swallowing it. A book whose ENTIRE tree is
 * superseded (Dark Archive, Guns & Gears) prunes to `[]` — the caller
 * (`RulesTree.tsx`) renders that as the "all N hidden" collapsed header,
 * D29-40's own pinned behavior.
 *
 * `currentId` (S3, D29-41's tree sidebar) — when given, the node bearing
 * this id is treated as ALWAYS self-visible, regardless of its own
 * `superseded` flag. Without this, a sidebar rendered while standing on a
 * superseded rules page could prune the very node the reader is looking
 * at out of its own sidebar (the entity page itself always renders
 * regardless of the superseded-visibility param — only listings/sidebars
 * hide superseded content — so the sidebar must never lose track of "you
 * are here"). Omitted (the `/rules` browse page's own call, S2) is exactly
 * the old behavior — this parameter is purely additive.
 */
export function pruneForSuperseded(
  nodes: readonly TreeNode[],
  supersededOn: boolean,
  currentId?: string,
): TreeNode[] {
  if (supersededOn) return [...nodes];
  const out: TreeNode[] = [];
  for (const n of nodes) {
    const children = pruneForSuperseded(n.children, false, currentId);
    const selfVisible =
      n.id !== undefined &&
      (n.superseded !== true || (currentId !== undefined && n.id === currentId));
    if (selfVisible || children.length > 0) out.push({ ...n, children });
  }
  return out;
}

/**
 * The name quick-filter (D29-40: "matching nodes shown with their ancestor
 * chain force-open"). `null` when `query` is blank (no filter active — the
 * caller renders `nodes` as-is, governed by the normal collapse-state map).
 * A non-null result is a NEW, pruned tree containing only matches and the
 * ancestor path down to each match — the caller renders every node in it
 * force-expanded (no collapse-state lookups needed while a filter is
 * active), which is what "force-open" means operationally: the pruned tree
 * IS the force-open view. Case-insensitive substring match on `name`,
 * matching `BrowseListing`'s own quick-filter posture (no fuzzy/typo
 * tolerance — D29-40 has no facet panel, this is the one text control).
 */
export function filterTreeByQuery(nodes: readonly TreeNode[], query: string): TreeNode[] | null {
  const q = query.trim().toLowerCase();
  if (q === "") return null;

  function walk(list: readonly TreeNode[]): TreeNode[] {
    const out: TreeNode[] = [];
    for (const n of list) {
      const selfMatch = n.name.toLowerCase().includes(q);
      // A match keeps its ORIGINAL, unfiltered subtree (the point of matching
      // "Chapter 2: Tools" is to show that node AND let the user explore
      // into it — narrowing its children to sub-matches too would silently
      // amputate real content it never claimed to hide). A non-match keeps
      // only the sub-matches beneath it (the ancestor-chain-only case).
      if (selfMatch) {
        out.push(n);
        continue;
      }
      const children = walk(n.children);
      if (children.length > 0) out.push({ ...n, children });
    }
    return out;
  }

  return walk(nodes);
}

/**
 * A flat DFS pre-order walk of a book's tree (root, then its children
 * depth-first, left to right — the array order the builder already emits
 * `children` in, D29-39's "Node arrays … emitted in FINAL order (DFS-ready)"
 * — this is a straight flatten, no re-sort). See this file's header comment
 * for why it's built here (S2) for S3's pager to reuse.
 */
export function dfsPreOrder(nodes: readonly TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  function walk(n: TreeNode): void {
    out.push(n);
    for (const child of n.children) walk(child);
  }
  for (const n of nodes) walk(n);
  return out;
}
