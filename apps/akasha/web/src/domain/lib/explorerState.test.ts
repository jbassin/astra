import { describe, expect, it } from "vitest";

import {
  computeOpen,
  folderSlugs,
  isCurrentNode,
  isPrefixOfCurrent,
  pathToCurrent,
  siblingWindow,
  type TreeNode,
  treeRootFor,
} from "./explorerState";

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

  it("finds the top-level subtree that holds the page", () => {
    expect(treeRootFor(tree, "Divinity/Fiends/Sigzil")?.slug).toBe("Divinity");
    expect(treeRootFor(tree, "Geography/index")?.slug).toBe("Geography");
    expect(treeRootFor(tree, "index")).toBeNull();
    expect(treeRootFor(tree, "tags/Host")).toBeNull();
    expect(treeRootFor(tree, "")).toBeNull();
  });

  it("marks a leaf, or a folder on its own index page, as current", () => {
    const fiends = tree[0]?.children[0];
    const sigzil = fiends?.children[0];
    if (!fiends || !sigzil) throw new Error("fixture");
    expect(isCurrentNode(fiends, "Divinity/Fiends/index")).toBe(true);
    expect(isCurrentNode(fiends, "Divinity/Fiends/Sigzil")).toBe(false);
    expect(isCurrentNode(sigzil, "Divinity/Fiends/Sigzil")).toBe(true);
    expect(isCurrentNode(fiends, "")).toBe(false);
  });

  it("returns the current node with its neighbours", () => {
    const divinity = tree[0]?.children ?? [];
    expect(pathToCurrent(tree, "Divinity/Fiends/Sigzil").map((n) => n.slug)).toEqual([
      "Divinity",
      "Divinity/Fiends",
      "Divinity/Fiends/Sigzil",
    ]);
    expect(siblingWindow(divinity, "Divinity/Anzu").map((n) => n.slug)).toEqual([
      "Divinity/Fiends",
      "Divinity/Anzu",
    ]);
    expect(siblingWindow(divinity, "Divinity/Fiends/Sigzil").map((n) => n.slug)).toEqual([
      "Divinity/Fiends/Sigzil",
    ]);
    expect(siblingWindow(divinity, "Geography/X")).toEqual([]);
  });
});
