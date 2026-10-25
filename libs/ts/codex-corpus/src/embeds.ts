import type { CodexNode } from "./schema/nodes";

// collectEmbedTargetIds — the loader-side companion to the site renderer's embed
// inlining (`renderEmbed` in `apps/codex/web/src/domain/render/nodes.tsx`). Walks a node
// list the same way `renderNodes` structurally would and collects every RESOLVED embed's
// target id, without recursing into another embed's own (not-yet-fetched) body: exactly
// the depth-0 target set the inlining pass needs prefetched. Pure, with no fs or React
// dependency, so the server loaders use it without importing the render layer.

function walkEmbedTargets(node: CodexNode, into: Set<string>): void {
  switch (node.kind) {
    case "embed":
      if (node.resolved) into.add(node.target);
      return;
    case "paragraph":
    case "heading":
      for (const c of node.children) walkEmbedTargets(c, into);
      return;
    case "list":
      for (const item of node.items) for (const c of item) walkEmbedTargets(c, into);
      return;
    case "table":
      for (const row of node.rows) {
        for (const cell of row.cells) for (const c of cell) walkEmbedTargets(c, into);
      }
      if (node.caption) for (const c of node.caption) walkEmbedTargets(c, into);
      return;
    case "blockquote":
    case "aside":
      for (const c of node.children) walkEmbedTargets(c, into);
      return;
    case "localizedBoilerplate":
      for (const c of node.children) walkEmbedTargets(c, into);
      return;
    case "statRow":
      // Cells are InlineNode[][] — embed prefetch must still see
      // them (a resolved embed inside a cell needs the same depth-0 prefetch
      // as one inside a paragraph).
      for (const cell of node.cells) for (const c of cell) walkEmbedTargets(c, into);
      return;
    default:
      return; // divider + every other leaf inline kind carries no embeds
  }
}

/** Every distinct RESOLVED embed target id reachable at depth 0 in `nodes`
 * (an entity's own `body`/`loreBody`, or one `EmbeddedItem.body`) — the set the
 * loader prefetches via the corpus reader before rendering. */
export function collectEmbedTargetIds(nodes: readonly CodexNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) walkEmbedTargets(node, ids);
  return ids;
}
