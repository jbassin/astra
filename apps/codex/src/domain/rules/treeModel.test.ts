import { describe, expect, it } from "vitest";

import type { TreeNode } from "@/schema/rulesTree";

import {
  computeOpen,
  dfsPreOrder,
  filterTreeByQuery,
  nodeKeyFor,
  pruneForSuperseded,
  sortBooksForDisplay,
} from "./treeModel";

function node(overrides: Partial<TreeNode> & Pick<TreeNode, "name">): TreeNode {
  return { children: [], ...overrides };
}

describe("nodeKeyFor (D29-40)", () => {
  it("a real (id-bearing) node keys on its CodexId alone, ignoring book/path", () => {
    const n = node({ name: "Counteracting", id: "rules/counteracting-2" });
    expect(nodeKeyFor("Player Core", ["Chapter 8", "Afflictions"], n)).toBe(
      "rules/counteracting-2",
    );
    expect(nodeKeyFor("Core Rulebook", [], n)).toBe("rules/counteracting-2");
  });

  it("a synthetic node keys on book + the full ancestor path (name included)", () => {
    const n = node({ name: "Archetypes" });
    const key = nodeKeyFor("Player Core 2", ["Chapter 3: Classes"], n);
    expect(key).toContain("Player Core 2");
    expect(key).toContain("Chapter 3: Classes");
    expect(key).toContain("Archetypes");
  });

  it("two synthetic nodes with the same name but different paths get different keys", () => {
    const n = node({ name: "General Rules" });
    const a = nodeKeyFor("Core Rulebook", ["Chapter 9"], n);
    const b = nodeKeyFor("Core Rulebook", ["Chapter 8"], n);
    expect(a).not.toBe(b);
  });
});

describe("computeOpen (the akasha computeOpen port)", () => {
  // Chapter (no id, synthetic) -> Section (no id) -> Leaf (id)
  const tree: TreeNode[] = [
    node({
      name: "Chapter",
      children: [
        node({
          name: "Section",
          children: [node({ name: "Leaf", id: "rules/leaf" })],
        }),
        node({ name: "OtherLeaf", id: "rules/other-leaf" }),
      ],
    }),
  ];

  it("default-closed with no current doc and no saved state", () => {
    const open = computeOpen("Book", tree, undefined, new Map());
    const chapterKey = nodeKeyFor("Book", [], tree[0] as TreeNode);
    const sectionKey = nodeKeyFor(
      "Book",
      ["Chapter"],
      (tree[0] as TreeNode).children[0] as TreeNode,
    );
    expect(open.get(chapterKey)).toBe(false);
    expect(open.get(sectionKey)).toBe(false);
    // the leaf itself has no children -> never gets an entry
    expect(open.has("rules/leaf")).toBe(false);
  });

  it("a node ancestor-of-current auto-opens, even with no saved state", () => {
    const open = computeOpen("Book", tree, "rules/leaf", new Map());
    const chapterKey = nodeKeyFor("Book", [], tree[0] as TreeNode);
    const sectionKey = nodeKeyFor(
      "Book",
      ["Chapter"],
      (tree[0] as TreeNode).children[0] as TreeNode,
    );
    expect(open.get(chapterKey)).toBe(true);
    expect(open.get(sectionKey)).toBe(true);
  });

  it("saved state opens a node even when it isn't ancestor-of-current", () => {
    const chapterKey = nodeKeyFor("Book", [], tree[0] as TreeNode);
    const saved = new Map([[chapterKey, true]]);
    const open = computeOpen("Book", tree, undefined, saved);
    expect(open.get(chapterKey)).toBe(true);
    // its child Section wasn't itself saved-open and isn't ancestor-of-current
    const sectionKey = nodeKeyFor(
      "Book",
      ["Chapter"],
      (tree[0] as TreeNode).children[0] as TreeNode,
    );
    expect(open.get(sectionKey)).toBe(false);
  });

  it("ancestor-of-current wins even over an explicit saved-closed entry", () => {
    const chapterKey = nodeKeyFor("Book", [], tree[0] as TreeNode);
    const saved = new Map([[chapterKey, false]]);
    const open = computeOpen("Book", tree, "rules/leaf", saved);
    expect(open.get(chapterKey)).toBe(true);
  });

  it("a leaf-only branch (OtherLeaf) never affects the Chapter's open state when current is elsewhere", () => {
    const open = computeOpen("Book", tree, "rules/other-leaf", new Map());
    const chapterKey = nodeKeyFor("Book", [], tree[0] as TreeNode);
    const sectionKey = nodeKeyFor(
      "Book",
      ["Chapter"],
      (tree[0] as TreeNode).children[0] as TreeNode,
    );
    expect(open.get(chapterKey)).toBe(true); // OtherLeaf's own ancestor
    expect(open.get(sectionKey)).toBe(false); // not on the path to OtherLeaf
  });
});

describe("pruneForSuperseded (D29-40 superseded-visibility semantics)", () => {
  it("legacyOn=true is a no-op (returns every node)", () => {
    const tree: TreeNode[] = [node({ name: "A", id: "rules/a", superseded: true, children: [] })];
    expect(pruneForSuperseded(tree, true)).toEqual(tree);
  });

  it("a superseded leaf with no visible descendants is dropped entirely", () => {
    const tree: TreeNode[] = [node({ name: "A", id: "rules/a", superseded: true })];
    expect(pruneForSuperseded(tree, false)).toEqual([]);
  });

  it("a non-superseded node always survives, regardless of children", () => {
    const tree: TreeNode[] = [node({ name: "A", id: "rules/a" })];
    expect(pruneForSuperseded(tree, false)).toHaveLength(1);
  });

  it(
    "the real-corpus GMG 'Chapter 2: Tools' shape: a 100%-superseded parent chain " +
      "survives as a wrapper down to one never-remastered child",
    () => {
      const tree: TreeNode[] = [
        node({
          name: "Chapter 2: Tools",
          id: "rules/chapter-2-tools",
          superseded: true,
          children: [
            node({
              name: "Building Creatures",
              id: "rules/building-creatures@legacy",
              superseded: true,
            }),
            node({ name: "Item Quirks", id: "rules/item-quirks" }), // never remastered -> visible
          ],
        }),
      ];
      const pruned = pruneForSuperseded(tree, false);
      expect(pruned).toHaveLength(1);
      expect(pruned[0]?.id).toBe("rules/chapter-2-tools"); // the wrapper survives
      expect(pruned[0]?.children).toHaveLength(1);
      expect(pruned[0]?.children[0]?.id).toBe("rules/item-quirks");
    },
  );

  it("a fully-superseded book (Dark Archive/Guns & Gears shape) prunes to an empty root list", () => {
    const tree: TreeNode[] = [
      node({
        name: "Root A",
        id: "rules/root-a",
        superseded: true,
        children: [node({ name: "Child A", id: "rules/child-a", superseded: true })],
      }),
      node({ name: "Root B", id: "rules/root-b", superseded: true }),
    ];
    expect(pruneForSuperseded(tree, false)).toEqual([]);
  });

  it("a synthetic (no-id) node with no visible descendants is dropped even though it has no `superseded` field of its own", () => {
    const tree: TreeNode[] = [
      node({
        name: "Synthetic Chapter",
        children: [node({ name: "Superseded Child", id: "rules/sc", superseded: true })],
      }),
    ];
    expect(pruneForSuperseded(tree, false)).toEqual([]);
  });

  describe("currentId (S3 — the sidebar 'you are here' guard)", () => {
    it("a superseded childless node matching currentId survives, unlike the plain (no currentId) call", () => {
      const tree: TreeNode[] = [node({ name: "A", id: "rules/a", superseded: true })];
      expect(pruneForSuperseded(tree, false)).toEqual([]); // the S2 baseline: still drops
      const withCurrent = pruneForSuperseded(tree, false, "rules/a");
      expect(withCurrent).toHaveLength(1);
      expect(withCurrent[0]?.id).toBe("rules/a");
    });

    it("currentId only rescues the matching node — an unrelated superseded sibling still drops", () => {
      const tree: TreeNode[] = [
        node({ name: "A", id: "rules/a", superseded: true }),
        node({ name: "B", id: "rules/b", superseded: true }),
      ];
      const pruned = pruneForSuperseded(tree, false, "rules/a");
      expect(pruned.map((n) => n.id)).toEqual(["rules/a"]);
    });

    it("currentId rescues a deeply-nested superseded node, keeping its ancestor wrapper chain too", () => {
      const tree: TreeNode[] = [
        node({
          name: "Chapter 2: Tools",
          id: "rules/chapter-2-tools",
          superseded: true,
          children: [
            node({
              name: "Building Creatures",
              id: "rules/building-creatures@legacy",
              superseded: true,
              children: [
                node({
                  name: "Ability Modifiers",
                  id: "rules/ability-modifiers-2",
                  superseded: true,
                }),
              ],
            }),
          ],
        }),
      ];
      const pruned = pruneForSuperseded(tree, false, "rules/ability-modifiers-2");
      expect(pruned[0]?.id).toBe("rules/chapter-2-tools");
      expect(pruned[0]?.children[0]?.id).toBe("rules/building-creatures@legacy");
      expect(pruned[0]?.children[0]?.children[0]?.id).toBe("rules/ability-modifiers-2");
    });
  });
});

describe("filterTreeByQuery (D29-40 name quick-filter)", () => {
  const tree: TreeNode[] = [
    node({
      name: "Chapter 2: Tools",
      id: "rules/chapter-2-tools",
      children: [
        node({ name: "Building Creatures", id: "rules/building-creatures" }),
        node({ name: "Item Quirks", id: "rules/item-quirks" }),
      ],
    }),
    node({ name: "Battlecry", id: "rules/battlecry" }),
  ];

  it("a blank query is inactive (null) — the caller renders the tree unfiltered", () => {
    expect(filterTreeByQuery(tree, "")).toBeNull();
    expect(filterTreeByQuery(tree, "   ")).toBeNull();
  });

  it("a match deep in the tree keeps its full ancestor chain, prunes siblings", () => {
    const result = filterTreeByQuery(tree, "item quirks");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1); // Battlecry pruned (no match, no matching descendant)
    expect(result?.[0]?.id).toBe("rules/chapter-2-tools"); // ancestor kept
    expect(result?.[0]?.children).toHaveLength(1); // sibling "Building Creatures" pruned
    expect(result?.[0]?.children[0]?.id).toBe("rules/item-quirks");
  });

  it("case-insensitive substring match", () => {
    const result = filterTreeByQuery(tree, "BATTLE");
    expect(result?.some((n) => n.id === "rules/battlecry")).toBe(true);
  });

  it("a match on an ANCESTOR node keeps the whole subtree below it", () => {
    const result = filterTreeByQuery(tree, "chapter 2");
    expect(result?.[0]?.children).toHaveLength(2); // both children survive
  });

  it("no match anywhere returns an empty (non-null) array", () => {
    const result = filterTreeByQuery(tree, "not-a-real-name-anywhere");
    expect(result).toEqual([]);
  });
});

describe("dfsPreOrder (S3 pager reuse)", () => {
  it("flattens root, then children depth-first, left to right — the page-turn order", () => {
    const tree: TreeNode[] = [
      node({
        name: "Chapter",
        id: "rules/chapter",
        children: [
          node({
            name: "Section A",
            id: "rules/section-a",
            children: [node({ name: "Sub A1", id: "rules/sub-a1" })],
          }),
          node({ name: "Section B", id: "rules/section-b" }),
        ],
      }),
      node({ name: "Next Chapter", id: "rules/next-chapter" }),
    ];
    const order = dfsPreOrder(tree).map((n) => n.id);
    expect(order).toEqual([
      "rules/chapter",
      "rules/section-a",
      "rules/sub-a1",
      "rules/section-b",
      "rules/next-chapter",
    ]);
  });

  it("includes synthetic (no-id) nodes in their DFS position", () => {
    const tree: TreeNode[] = [
      node({ name: "Synthetic Root", children: [node({ name: "Leaf", id: "rules/leaf" })] }),
    ];
    const order = dfsPreOrder(tree).map((n) => n.name);
    expect(order).toEqual(["Synthetic Root", "Leaf"]);
  });

  it("a childless root is a single-element result", () => {
    const tree: TreeNode[] = [node({ name: "Whetstones", id: "rules/whetstones" })];
    expect(dfsPreOrder(tree)).toHaveLength(1);
  });
});

describe("sortBooksForDisplay (D29-108b — the /rules book display order)", () => {
  it("the four remaster cores sort first, in their fixed reading order, regardless of input order", () => {
    const books = [
      { book: "Monster Core" },
      { book: "GM Core" },
      { book: "Player Core 2" },
      { book: "Player Core" },
    ];
    expect(sortBooksForDisplay(books).map((b) => b.book)).toEqual([
      "Player Core",
      "Player Core 2",
      "GM Core",
      "Monster Core",
    ]);
  });

  it("every other book falls through to alphabetical-by-full-title, after the cores", () => {
    const books = [{ book: "Zoo of Zeals" }, { book: "Ancestry Guide" }, { book: "GM Core" }];
    expect(sortBooksForDisplay(books).map((b) => b.book)).toEqual([
      "GM Core",
      "Ancestry Guide",
      "Zoo of Zeals",
    ]);
  });

  it("no cores present -> pure alphabetical, unaffected", () => {
    const books = [{ book: "Secrets of Magic" }, { book: "Battlecry!" }, { book: "Dark Archive" }];
    expect(sortBooksForDisplay(books).map((b) => b.book)).toEqual([
      "Battlecry!",
      "Dark Archive",
      "Secrets of Magic",
    ]);
  });

  it("input array is not mutated", () => {
    const books = [{ book: "Monster Core" }, { book: "GM Core" }];
    const copy = [...books];
    sortBooksForDisplay(books);
    expect(books).toEqual(copy);
  });
});
