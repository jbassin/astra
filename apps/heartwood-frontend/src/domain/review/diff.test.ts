import { describe, expect, it } from "vitest";

import { diffLines, diffStat } from "./diff";

describe("diffLines", () => {
  it("is purely additive for a preserve-and-append rewrite", () => {
    const before = "Iconoclasm runs an orphanage.\nIt is mercenary at heart.";
    const after = `${before}\n\nYou'll hear rumours it employs children.`;
    const rows = diffLines(before, after);
    expect(rows.some((r) => r.type === "del")).toBe(false);
    const { added, removed } = diffStat(rows);
    expect(removed).toBe(0);
    expect(added).toBeGreaterThan(0);
    // every original line survives as context
    expect(rows.filter((r) => r.type === "ctx").map((r) => r.text)).toEqual(before.split("\n"));
  });

  it("treats a create (empty before) as all-added", () => {
    const after = "A brand new page.\nWith two lines.";
    const rows = diffLines("", after);
    expect(rows.every((r) => r.type === "add")).toBe(true);
    expect(diffStat(rows).added).toBe(2);
  });

  it("marks a replaced line as del + add", () => {
    const rows = diffLines("one\ntwo\nthree", "one\nTWO\nthree");
    expect(rows.find((r) => r.type === "del")?.text).toBe("two");
    expect(rows.find((r) => r.type === "add")?.text).toBe("TWO");
    expect(rows.filter((r) => r.type === "ctx").map((r) => r.text)).toEqual(["one", "three"]);
  });
});
