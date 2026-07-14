import { describe, expect, it } from "vitest";

import type { License } from "../schema/entity";
import type { TreeNode } from "../schema/rulesTree";
import { buildRulesTree, type RulesDocInput } from "./rulesTree";

function doc(
  overrides: Partial<RulesDocInput> & Pick<RulesDocInput, "aonId" | "finalId" | "name" | "book">,
): RulesDocInput {
  return {
    edition: "remaster",
    breadcrumbs: [],
    superseded: false,
    ...overrides,
  };
}

function collector(): { reports: string[]; report: (cls: string, detail: string) => void } {
  const reports: string[] = [];
  return { reports, report: (cls, detail) => reports.push(`${cls}: ${detail}`) };
}

const NO_LICENSE = new Map<string, License>();

function findNode(nodes: readonly TreeNode[], name: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const hit = findNode(n.children, name);
    if (hit) return hit;
  }
  return undefined;
}

describe("buildRulesTree: book scoping — cross-book generic-title fixture", () => {
  it('"Chapter 1: Introduction" recurring verbatim across two books yields two SEPARATE subtrees', () => {
    const docs: RulesDocInput[] = [
      doc({
        aonId: "rules-1",
        finalId: "rules/intro-a",
        name: "Chapter 1: Introduction",
        book: "Book A",
      }),
      doc({
        aonId: "rules-2",
        finalId: "rules/welcome-a",
        name: "Welcome",
        book: "Book A",
        breadcrumbs: ["Chapter 1: Introduction"],
      }),
      doc({
        aonId: "rules-3",
        finalId: "rules/intro-b",
        name: "Chapter 1: Introduction",
        book: "Book B",
      }),
      doc({
        aonId: "rules-4",
        finalId: "rules/welcome-b",
        name: "Welcome",
        book: "Book B",
        breadcrumbs: ["Chapter 1: Introduction"],
      }),
    ];
    const { report } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books).toHaveLength(2);
    const bookA = file.books.find((b) => b.book === "Book A");
    const bookB = file.books.find((b) => b.book === "Book B");
    expect(bookA?.nodes).toHaveLength(1);
    expect(bookB?.nodes).toHaveLength(1);
    expect(bookA?.nodes[0]?.id).toBe("rules/intro-a");
    expect(bookA?.nodes[0]?.children[0]?.id).toBe("rules/welcome-a");
    expect(bookB?.nodes[0]?.id).toBe("rules/intro-b");
    expect(bookB?.nodes[0]?.children[0]?.id).toBe("rules/welcome-b");
    expect(stats.syntheticCount).toBe(0);
  });

  it("a normalized (already-CRLF-stripped) breadcrumb string groups both children under ONE parent, never forking", () => {
    // aonFacets.ts's normalizeBreadcrumbElement strips \r\n\t BEFORE this
    // builder ever sees the string — this proves the downstream behavior a
    // dirty, un-normalized string would break: two children whose OWN
    // breadcrumbs literally match (post-normalization) group under the same
    // real parent doc, not two different synthetic parents.
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-10", finalId: "rules/tools", name: "Chapter 2: Tools", book: "GMG" }),
      doc({
        aonId: "rules-11",
        finalId: "rules/child-a",
        name: "Building Creatures",
        book: "GMG",
        breadcrumbs: ["Chapter 2: Tools"],
      }),
      doc({
        aonId: "rules-12",
        finalId: "rules/child-b",
        name: "Building Hazards",
        book: "GMG",
        breadcrumbs: ["Chapter 2: Tools"],
      }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    const gmg = file.books.find((b) => b.book === "GMG");
    expect(gmg?.nodes).toHaveLength(1);
    expect(gmg?.nodes[0]?.id).toBe("rules/tools");
    expect(gmg?.nodes[0]?.children.map((c) => c.id).sort()).toEqual([
      "rules/child-a",
      "rules/child-b",
    ]);
  });
});

describe("buildRulesTree: parent resolution — path-prefix, fallback, tie-break", () => {
  it("path-prefix rule: exact (name, path) match resolves the direct parent", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/chapter", name: "Chapter", book: "B" }),
      doc({
        aonId: "rules-2",
        finalId: "rules/section",
        name: "Section",
        book: "B",
        breadcrumbs: ["Chapter"],
      }),
      doc({
        aonId: "rules-3",
        finalId: "rules/leaf",
        name: "Leaf",
        book: "B",
        breadcrumbs: ["Chapter", "Section"],
      }),
    ];
    const { report } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    const b = file.books[0];
    expect(b?.nodes[0]?.id).toBe("rules/chapter");
    expect(b?.nodes[0]?.children[0]?.id).toBe("rules/section");
    expect(b?.nodes[0]?.children[0]?.children[0]?.id).toBe("rules/leaf");
    expect(stats.syntheticCount).toBe(0);
    expect(stats.fallbackHits).toHaveLength(0);
  });

  it("the Rules-Elements shape: path-prefix fails (child's path doesn't match the real root's own EMPTY path), fallback to name-only preferring the root doc rescues it", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-100", finalId: "rules/elements", name: "Rules Elements", book: "DM" }),
      doc({
        aonId: "rules-101",
        finalId: "rules/domains",
        name: "Alternate Domains",
        book: "DM",
        breadcrumbs: ["Gods & Magic", "Rules Elements"],
      }),
    ];
    const { report, reports } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    const dm = file.books[0];
    // "Rules Elements" resolves via fallback and stays a book ROOT (its own
    // breadcrumbs are empty) — the child attaches under it, "Gods & Magic"
    // never materializes as a node of its own (nobody's real immediate
    // parent, only path context for the fallback lookup).
    expect(dm?.nodes).toHaveLength(1);
    expect(dm?.nodes[0]?.id).toBe("rules/elements");
    expect(dm?.nodes[0]?.children[0]?.id).toBe("rules/domains");
    expect(stats.syntheticCount).toBe(0);
    expect(stats.fallbackHits).toHaveLength(1);
    expect(stats.fallbackHits[0]).toMatchObject({ parentName: "Rules Elements", book: "DM" });
    expect(reports.some((r) => r.startsWith("rulesTreeParentFallback:"))).toBe(true);
  });

  it("lowest-aonId tie-break: two docs share the same (book, name, path) — the lower aonId wins as parent", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/root", name: "Root", book: "APG" }),
      doc({
        aonId: "rules-20",
        finalId: "rules/dup-high",
        name: "Dup",
        book: "APG",
        breadcrumbs: ["Root"],
      }),
      doc({
        aonId: "rules-10",
        finalId: "rules/dup-low",
        name: "Dup",
        book: "APG",
        breadcrumbs: ["Root"],
      }),
      doc({
        aonId: "rules-30",
        finalId: "rules/child",
        name: "Child",
        book: "APG",
        breadcrumbs: ["Root", "Dup"],
      }),
    ];
    const { report } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    const child = findNode(file.books[0]?.nodes ?? [], "Child");
    const dupLow = findNode(file.books[0]?.nodes ?? [], "Dup");
    expect(dupLow?.id).toBe("rules/dup-low"); // lowest aonId ("rules-10" < "rules-20")
    expect(dupLow?.children.map((c) => c.id)).toEqual(["rules/child"]);
    expect(child).toBeDefined();
    expect(stats.parentTieBreakCount).toBeGreaterThanOrEqual(1);
  });
});

describe("buildRulesTree: synthetic-node emission", () => {
  it("a missing parent (no real doc, name-only fallback also fails) becomes a synthetic node — no `id`", () => {
    const docs: RulesDocInput[] = [
      doc({
        aonId: "rules-1",
        finalId: "rules/orphan",
        name: "Orphan",
        book: "B",
        breadcrumbs: ["Nonexistent Chapter"],
      }),
    ];
    const { report } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    expect(stats.syntheticCount).toBe(1);
    const b = file.books[0];
    expect(b?.nodes).toHaveLength(1);
    expect(b?.nodes[0]?.name).toBe("Nonexistent Chapter");
    expect(b?.nodes[0]?.id).toBeUndefined();
    expect(b?.nodes[0]?.children[0]?.id).toBe("rules/orphan");
  });

  it("the Player Core 2 shape: a two-level missing chain mints TWO nested synthetic nodes, not one flat one", () => {
    const docs: RulesDocInput[] = [
      doc({
        aonId: "rules-1",
        finalId: "rules/alchemical-archetypes",
        name: "Alchemical Archetypes",
        book: "PC2",
        breadcrumbs: ["Chapter 3: Classes", "Archetypes"],
      }),
    ];
    const { report } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    expect(stats.syntheticCount).toBe(2);
    const chapter = file.books[0]?.nodes[0];
    expect(chapter?.name).toBe("Chapter 3: Classes");
    expect(chapter?.id).toBeUndefined();
    const archetypes = chapter?.children[0];
    expect(archetypes?.name).toBe("Archetypes");
    expect(archetypes?.id).toBeUndefined();
    expect(archetypes?.children[0]?.id).toBe("rules/alchemical-archetypes");
  });
});

describe("buildRulesTree: sibling-group chain ordering (adversarial B1)", () => {
  it("orders a root-level chain by next-links restricted to the group", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-3", finalId: "rules/c", name: "C", book: "B", nextAonId: undefined }),
      doc({ aonId: "rules-1", finalId: "rules/a", name: "A", book: "B", nextAonId: "rules-2" }),
      doc({ aonId: "rules-2", finalId: "rules/b", name: "B", book: "B", nextAonId: "rules-3" }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books[0]?.nodes.map((n) => n.id)).toEqual(["rules/a", "rules/b", "rules/c"]);
  });

  it("orders an INTERIOR-level sibling group (not just the book root)", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/parent", name: "Parent", book: "B" }),
      doc({
        aonId: "rules-12",
        finalId: "rules/second",
        name: "Second",
        book: "B",
        breadcrumbs: ["Parent"],
      }),
      doc({
        aonId: "rules-11",
        finalId: "rules/first",
        name: "First",
        book: "B",
        breadcrumbs: ["Parent"],
        nextAonId: "rules-12",
      }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    const parent = file.books[0]?.nodes[0];
    expect(parent?.children.map((c) => c.id)).toEqual(["rules/first", "rules/second"]);
  });

  it("an unchained member (no in-group edge) sorts alphabetically AFTER the chained members", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/a", name: "A", book: "B", nextAonId: "rules-2" }),
      doc({ aonId: "rules-2", finalId: "rules/b", name: "B", book: "B" }),
      doc({ aonId: "rules-9", finalId: "rules/zeta", name: "Zeta", book: "B" }), // isolated, no links at all
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books[0]?.nodes.map((n) => n.id)).toEqual(["rules/a", "rules/b", "rules/zeta"]);
  });

  it("a fork/asymmetry fixture: cross-group next-links (pointing OUTSIDE the sibling group, e.g. at a doc in a different level) are IGNORED, not followed", () => {
    // "Outer" (root) next-points at "Inner" (a CHILD of "Outer", a different
    // level entirely) — exactly the real B1 shape (0/3,642 hops descend).
    // The root group must not treat this as a valid edge.
    const docs: RulesDocInput[] = [
      doc({
        aonId: "rules-1",
        finalId: "rules/outer",
        name: "Outer",
        book: "B",
        nextAonId: "rules-2", // points at its own child — cross-level, must be ignored at the root group
      }),
      doc({
        aonId: "rules-3",
        finalId: "rules/sibling",
        name: "Sibling",
        book: "B",
      }),
      doc({
        aonId: "rules-2",
        finalId: "rules/inner",
        name: "Inner",
        book: "B",
        breadcrumbs: ["Outer"],
      }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    // root group = [Outer, Sibling]; "Outer"'s next targets "Inner", which is
    // NOT a member of the root group — so within the root group neither is
    // chained; both fall to the alphabetical-unchained bucket.
    expect(file.books[0]?.nodes.map((n) => n.id)).toEqual(["rules/outer", "rules/sibling"]);
    // "Inner" is still correctly nested under "Outer" via breadcrumbs (the
    // fork's cross-level link plays no role in PARENT resolution, only
    // sibling ORDER).
    expect(file.books[0]?.nodes[0]?.children[0]?.id).toBe("rules/inner");
  });
});

describe("buildRulesTree: structural shapes", () => {
  it("a childless root renders as a single-node tree", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/lonely", name: "Lonely", book: "B" }),
    ];
    const { report } = collector();
    const { file, stats } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books[0]?.nodes).toEqual([{ name: "Lonely", id: "rules/lonely", children: [] }]);
    expect(stats.childlessRootCount).toBe(1);
  });

  it("a leaf-that-is-also-parent: a doc is both a child of one node and the parent of another", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/root", name: "Root", book: "B" }),
      doc({
        aonId: "rules-2",
        finalId: "rules/mid",
        name: "Mid",
        book: "B",
        breadcrumbs: ["Root"],
      }),
      doc({
        aonId: "rules-3",
        finalId: "rules/leaf",
        name: "Leaf",
        book: "B",
        breadcrumbs: ["Root", "Mid"],
      }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    const root = file.books[0]?.nodes[0];
    expect(root?.id).toBe("rules/root");
    expect(root?.children[0]?.id).toBe("rules/mid");
    expect(root?.children[0]?.children[0]?.id).toBe("rules/leaf");
  });

  it("superseded propagates onto the TreeNode; a book's hiddenWhenLegacyOff counts real superseded nodes", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/old", name: "Old", book: "B", superseded: true }),
      doc({ aonId: "rules-2", finalId: "rules/new", name: "New", book: "B" }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    const b = file.books[0];
    expect(b?.hiddenWhenLegacyOff).toBe(1);
    const old = b?.nodes.find((n) => n.id === "rules/old");
    expect(old?.superseded).toBe(true);
    const fresh = b?.nodes.find((n) => n.id === "rules/new");
    expect(fresh?.superseded).toBeUndefined();
  });
});

describe("buildRulesTree: book-level edition/license + ordering", () => {
  it('a "(Remastered)"-titled book is ALWAYS remaster, even with a legacy-majority membership', () => {
    const docs: RulesDocInput[] = [
      doc({
        aonId: "rules-1",
        finalId: "rules/a",
        name: "A",
        book: "X (Remastered)",
        edition: "legacy",
      }),
      doc({
        aonId: "rules-2",
        finalId: "rules/b",
        name: "B",
        book: "X (Remastered)",
        edition: "legacy",
      }),
      doc({
        aonId: "rules-3",
        finalId: "rules/c",
        name: "C",
        book: "X (Remastered)",
        edition: "remaster",
      }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books[0]?.edition).toBe("remaster");
  });

  it("books order remaster-first, then alphabetical within edition", () => {
    const docs: RulesDocInput[] = [
      doc({
        aonId: "rules-1",
        finalId: "rules/a",
        name: "A",
        book: "Zeta Book",
        edition: "legacy",
      }),
      doc({
        aonId: "rules-2",
        finalId: "rules/b",
        name: "B",
        book: "Alpha Book",
        edition: "legacy",
      }),
      doc({
        aonId: "rules-3",
        finalId: "rules/c",
        name: "C",
        book: "Mid Book",
        edition: "remaster",
      }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books.map((b) => b.book)).toEqual(["Mid Book", "Alpha Book", "Zeta Book"]);
  });

  it("license falls back to the caller's source-entity lookup when the licenseMap table has no entry", () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/a", name: "A", book: "Some Unlisted Book" }),
    ];
    const bookSourceLicense = new Map<string, License>([["Some Unlisted Book", "ORC"]]);
    const { report } = collector();
    const { file } = buildRulesTree(docs, bookSourceLicense, report);
    expect(file.books[0]?.license).toBe("ORC");
  });

  it('license is "unknown" (never guessed) when neither the table nor a source entity has an answer', () => {
    const docs: RulesDocInput[] = [
      doc({ aonId: "rules-1", finalId: "rules/a", name: "A", book: "Totally Unknown Book" }),
    ];
    const { report } = collector();
    const { file } = buildRulesTree(docs, NO_LICENSE, report);
    expect(file.books[0]?.license).toBe("unknown");
  });
});
