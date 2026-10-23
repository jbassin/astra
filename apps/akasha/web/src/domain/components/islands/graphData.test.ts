import { describe, expect, it } from "vitest";

import type { SimpleSlug } from "@/domain/lib/slug";

import { buildGraphData, type ContentDetails, type D3Config } from "./graphData";

const cfg = (over: Partial<D3Config> = {}): D3Config => ({
  drag: true,
  zoom: true,
  depth: 1,
  scale: 1,
  repelForce: 0.5,
  centerForce: 0.3,
  linkDistance: 30,
  fontSize: 0.6,
  opacityScale: 1,
  removeTags: [],
  showTags: true,
  ...over,
});

// A→B→C chain; A also links a dead page (not in the index) and carries tag "x".
const data = new Map<string, ContentDetails>([
  ["A", { title: "Alpha", links: ["B", "Dead"], tags: ["x"] }],
  ["B", { title: "Beta", links: ["C"], tags: [] }],
  ["C", { title: "Gamma", links: [], tags: [] }],
]);

describe("buildGraphData (faerrin Graph neighbourhood/link logic)", () => {
  it("depth 1 from A keeps A, direct neighbours + tag node; drops C (depth 2) and dead links", () => {
    const { nodes, links } = buildGraphData(data, "A" as SimpleSlug, cfg({ depth: 1 }));
    expect(nodes.map((n) => n.id).sort()).toEqual(["A", "B", "tags/x"]);
    expect(links.some((l) => l.source.id === "A" && l.target.id === "B")).toBe(true);
    expect(links.some((l) => l.target.id === "tags/x")).toBe(true);
    // "Dead" is not a valid page, so the edge is never created.
    expect(links.some((l) => l.target.id === "Dead")).toBe(false);
    // C is two hops out — excluded at depth 1, so its edge is filtered too.
    expect(nodes.some((n) => n.id === "C")).toBe(false);
  });

  it("labels tag nodes with a leading # and pages with their title", () => {
    const { nodes } = buildGraphData(data, "A" as SimpleSlug, cfg({ depth: -1 }));
    expect(nodes.find((n) => n.id === "tags/x")?.text).toBe("#x");
    expect(nodes.find((n) => n.id === "A")?.text).toBe("Alpha");
  });

  it("depth -1 (global) includes every valid page and tag", () => {
    const { nodes } = buildGraphData(data, "A" as SimpleSlug, cfg({ depth: -1 }));
    expect(nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C", "tags/x"]);
  });

  it("showTags=false drops all tag nodes and tag edges", () => {
    const { nodes, links } = buildGraphData(
      data,
      "A" as SimpleSlug,
      cfg({ depth: -1, showTags: false }),
    );
    expect(nodes.some((n) => n.id.startsWith("tags/"))).toBe(false);
    expect(links.some((l) => l.target.id.startsWith("tags/"))).toBe(false);
  });
});
