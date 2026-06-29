import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";

// The schema-conformance gate: parse the real committed Phase-3 change-set and assert
// its shape. vitest runs with cwd = the app dir, so the proposals/ sibling is ../.
const MANIFEST = path.resolve(
  process.cwd(),
  "../heartwood-backend/proposals/2025-8-28/manifest.kdl",
);

describe("parseManifest (2025-8-28 fixture)", () => {
  const m = parseManifest(readFileSync(MANIFEST, "utf8"));

  it("reads the head", () => {
    expect(m.date).toBe("2025-8-28");
    expect(m.show).toBe("through-a-song-darkly");
    expect(m.world).toBe("faerrin");
  });

  it("reads every node kind at the right count", () => {
    expect(m.proposals).toHaveLength(50);
    expect(m.proposals.filter((p) => p.op === "create")).toHaveLength(39);
    expect(m.proposals.filter((p) => p.op === "rewrite")).toHaveLength(11);
    expect(m.unplaced).toHaveLength(5);
    expect(m.skipped).toHaveLength(8);
    expect(m.registryAdditions).toHaveLength(17);
    expect(m.proposals.flatMap((p) => p.lints)).toHaveLength(4);
  });

  it("maps kebab-case props to camelCase fields", () => {
    const icon = m.proposals.find((p) => p.id === "org-iconoclasm-index");
    expect(icon).toBeDefined();
    expect(icon?.op).toBe("rewrite");
    expect(icon?.kind).toBe("org");
    expect(icon?.status).toBe("resolved");
    expect(icon?.pageType).toBe("lore"); // page-type → pageType
    expect(icon?.bodyFile).toBe("org-iconoclasm-index.vellum");
    expect(icon?.facts.length).toBeGreaterThan(0);

    // a needs-placement create carries a placement-note → placementNote
    const placed = m.proposals.find((p) => p.targetPath.startsWith("needs-placement/"));
    expect(placed?.placementNote).toBeTruthy();
  });

  it("reads unplaced candidates as [name, score] tuples", () => {
    const u = m.unplaced[0];
    expect(u).toBeDefined();
    expect(u?.candidates.length).toBeGreaterThan(0);
    const [name, score] = u?.candidates[0] ?? ["", Number.NaN];
    expect(typeof name).toBe("string");
    expect(Number.isFinite(score)).toBe(true);
  });

  it("reads a broken_wikilink lint with its hit", () => {
    const lints = m.proposals.flatMap((p) => p.lints);
    const broken = lints.find((l) => l.type === "broken_wikilink");
    expect(broken).toBeDefined();
    expect(broken?.hit).toBeTruthy();
  });

  it("reads registry additions with suggested-path → suggestedPath", () => {
    const add = m.registryAdditions.find((r) => r.canonical === "Threshold Authority");
    expect(add).toBeDefined();
    expect(add?.kind).toBe("org");
    expect(add?.suggestedPath).toBe("Org/Threshold Authority/index");
  });
});
