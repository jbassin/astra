import { describe, expect, it } from "vitest";
import { computeOpen, folderSlugs, isPrefixOfCurrent, type TreeNode } from "./explorerState";

const tree: TreeNode[] = [
  {
    slug: "Divinity",
    displayName: "Divinity",
    isFolder: true,
    children: [
      {
        slug: "Divinity/Fiends",
        displayName: "Fiends",
        isFolder: true,
        children: [
          { slug: "Divinity/Fiends/Sigzil", displayName: "Sigzil", isFolder: false, children: [] },
        ],
      },
      { slug: "Divinity/Anzu", displayName: "Anzu", isFolder: false, children: [] },
    ],
  },
  { slug: "Geography", displayName: "Geography", isFolder: true, children: [] },
];

describe("explorerState", () => {
  it("collects every folder slug depth-first", () => {
    expect(folderSlugs(tree)).toEqual(["Divinity", "Divinity/Fiends", "Geography"]);
  });

  it("matches a folder prefix on segment boundaries only", () => {
    expect(isPrefixOfCurrent("Divinity", "Divinity/Anzu")).toBe(true);
    expect(isPrefixOfCurrent("Divinity", "Divinity")).toBe(true);
    expect(isPrefixOfCurrent("Divinity", "Geography/X")).toBe(false);
    // "Geo" must NOT open for "Geography/X" (sibling-prefix guard)
    expect(isPrefixOfCurrent("Geo", "Geography/X")).toBe(false);
  });

  it("auto-opens folders prefixing the current slug (no saved state)", () => {
    const open = computeOpen(tree, "Divinity/Fiends/Sigzil", new Map());
    expect(open.get("Divinity")).toBe(true);
    expect(open.get("Divinity/Fiends")).toBe(true);
    expect(open.get("Geography")).toBe(false);
  });

  it("applies saved collapse state, but a prefix folder stays open", () => {
    const saved = new Map([
      ["Geography", false], // collapsed=false → open
      ["Divinity", true], // collapsed=true … but Divinity prefixes current → stays open
    ]);
    const open = computeOpen(tree, "Divinity/Anzu", saved);
    expect(open.get("Geography")).toBe(true);
    expect(open.get("Divinity")).toBe(true);
  });
});
