/**
 * Graph data-shaping — the pure, DOM-free core lifted out of faerrin's Graph
 * island `renderGraph()` so it can be unit-tested without pixi/WebGL/jsdom (the
 * same split slice 5 used for Explorer's `explorerState.ts`). The imperative
 * pixi/d3 rendering stays verbatim in `Graph.tsx`; this module owns only the
 * link/tag extraction + depth-limited neighbourhood BFS + node/link assembly.
 *
 * Logic is byte-faithful to faerrin `aether/src/components/islands/Graph.tsx`
 * (the `links`/`tags`/`neighbourhood`/`nodes`/`graphData` block) — do not
 * "improve" it; the graph must match the current site.
 */
import { type FullSlug, type SimpleSlug, simplifySlug } from "@/domain/lib/slug";

export interface D3Config {
  drag: boolean;
  zoom: boolean;
  depth: number;
  scale: number;
  repelForce: number;
  centerForce: number;
  linkDistance: number;
  fontSize: number;
  opacityScale: number;
  removeTags: string[];
  showTags: boolean;
  focusOnHover?: boolean;
  enableRadial?: boolean;
}

export type ContentDetails = { title: string; links: string[]; tags: string[] };

export interface GraphNode {
  id: string;
  text: string;
  tags: string[];
}
export interface GraphLink {
  source: GraphNode;
  target: GraphNode;
}

export function buildGraphData(
  data: Map<string, ContentDetails>,
  slug: SimpleSlug,
  cfg: D3Config,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const { depth, removeTags, showTags } = cfg;

  const links: { source: string; target: string }[] = [];
  const tags: string[] = [];
  const validLinks = new Set(data.keys());

  for (const [source, details] of data.entries()) {
    for (const dest of details.links ?? []) {
      if (validLinks.has(dest)) links.push({ source, target: dest });
    }
    if (showTags) {
      const localTags = (details.tags ?? [])
        .filter((tag) => !removeTags.includes(tag))
        .map((tag) => simplifySlug(`tags/${tag}` as FullSlug));
      tags.push(...localTags.filter((tag) => !tags.includes(tag)));
      for (const tag of localTags) links.push({ source, target: tag });
    }
  }

  const neighbourhood = new Set<string>();
  const wl: string[] = [slug, "__SENTINEL"];
  let d = depth;
  if (d >= 0) {
    while (d >= 0 && wl.length > 0) {
      const cur = wl.shift()!;
      if (cur === "__SENTINEL") {
        d--;
        wl.push("__SENTINEL");
      } else {
        neighbourhood.add(cur);
        const outgoing = links.filter((l) => l.source === cur);
        const incoming = links.filter((l) => l.target === cur);
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source));
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id));
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag));
  }

  const nodes: GraphNode[] = [...neighbourhood].map((url) => ({
    id: url,
    text: url.startsWith("tags/") ? `#${url.substring(5)}` : (data.get(url)?.title ?? url),
    tags: data.get(url)?.tags ?? [],
  }));
  const graphLinks: GraphLink[] = links
    .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
    .map((l) => ({
      source: nodes.find((n) => n.id === l.source)!,
      target: nodes.find((n) => n.id === l.target)!,
    }));

  return { nodes, links: graphLinks };
}
