import type { CrossRef } from "@astra/vellum-lang";
import { describe, expect, it } from "vitest";

import { buildResolvers } from "./crossref";
import { readingMinutes, renderBody } from "./renderBody";
import type { Snapshot } from "./snapshot";

const fm = { title: null, tags: [], aliases: [], img: null, extra: {} };
const snapshot: Snapshot = {
  pages: [
    { path: "A", date: null, frontmatter: fm, crossrefs: [] },
    { path: "Sub/B", date: null, frontmatter: fm, crossrefs: [] },
  ],
  edges: [
    { source: "A", target: "B", resolved: "Sub/B", heading: null, alias: null },
    { source: "A", target: "Ghost", resolved: null, heading: null, alias: null },
  ],
  unresolved: [],
};
const xref = (target: string, heading?: string): CrossRef => ({
  type: "crossref",
  target,
  heading,
});

describe("buildResolvers (N3 crossref → href)", () => {
  const resolve = buildResolvers(snapshot).get("A");

  it("resolves a snapshot edge to a relative href", () => {
    expect(resolve).toBeDefined();
    const r = resolve?.(xref("B"));
    expect(r?.href).toBeTruthy();
    expect(r?.href).toContain("Sub/B");
  });

  it("returns null for a dangling (resolved=null) edge → placeholder", () => {
    expect(resolve?.(xref("Ghost"))).toBeNull();
  });

  it("returns null for a target with no edge at all", () => {
    expect(resolve?.(xref("Nonexistent"))).toBeNull();
  });
});

describe("renderBody (gothic DocumentView + resolver, build-time)", () => {
  it("renders a resolved crossref as a real <a href> carrying data-crossref", () => {
    const resolve = buildResolvers(snapshot).get("A");
    if (!resolve) throw new Error("no resolver");
    const html = renderBody("---\n---\nSee [[B]] now.", resolve);
    expect(html).toContain("data-vellum-export");
    expect(html).toMatch(/<a [^>]*data-crossref-target="B"/);
    expect(html).toContain("See");
  });

  it("leaves a dangling crossref as a placeholder span (no href)", () => {
    const resolve = buildResolvers(snapshot).get("A");
    if (!resolve) throw new Error("no resolver");
    const html = renderBody("---\n---\nThe [[Ghost]] fades.", resolve);
    expect(html).toMatch(/<span [^>]*data-crossref-target="Ghost"/);
  });

  it("counts reading minutes (≥1)", () => {
    expect(readingMinutes("---\n---\n")).toBe(1);
    expect(readingMinutes(`---\n---\n${"word ".repeat(450)}`)).toBeGreaterThanOrEqual(2);
  });
});
