import { describe, expect, it } from "vitest";

import type { SourceIndexEntry } from "@/schema/sourcesIndex";

import { groupSourcesByProductLine, OTHER_GROUP_LABEL } from "./sourcesModel";

function book(overrides: Partial<SourceIndexEntry> = {}): SourceIndexEntry {
  return {
    book: "Some Book",
    license: "unknown",
    edition: "remaster",
    entityCount: 1,
    categoryCounts: { spell: 1 },
    ...overrides,
  };
}

describe("groupSourcesByProductLine (D29-43)", () => {
  it("groups books with no productLine into the Other bucket", () => {
    const groups = groupSourcesByProductLine([book({ book: "X" }), book({ book: "Y" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.productLine).toBe(OTHER_GROUP_LABEL);
    expect(groups[0]?.bookCount).toBe(2);
  });

  it("orders pinned product lines in the pinned sequence, regardless of input order", () => {
    const groups = groupSourcesByProductLine([
      book({ book: "AP1", productLine: "Adventure Paths" }),
      book({ book: "R1", productLine: "Rulebooks" }),
      book({ book: "LO1", productLine: "Lost Omens" }),
    ]);
    expect(groups.map((g) => g.productLine)).toEqual([
      "Rulebooks",
      "Lost Omens",
      "Adventure Paths",
    ]);
  });

  it("'Other' always sorts LAST, even when it is the largest group by book count", () => {
    const groups = groupSourcesByProductLine([
      book({ book: "O1" }),
      book({ book: "O2" }),
      book({ book: "O3" }),
      book({ book: "R1", productLine: "Rulebooks" }),
    ]);
    expect(groups.at(-1)?.productLine).toBe(OTHER_GROUP_LABEL);
    expect(groups.at(-1)?.bookCount).toBe(3);
  });

  it("an unpinned real product line sorts alphabetically after the pinned lines and before Other", () => {
    const groups = groupSourcesByProductLine([
      book({ book: "Z1", productLine: "Zzyzx Line" }),
      book({ book: "R1", productLine: "Rulebooks" }),
      book({ book: "O1" }),
    ]);
    expect(groups.map((g) => g.productLine)).toEqual([
      "Rulebooks",
      "Zzyzx Line",
      OTHER_GROUP_LABEL,
    ]);
  });

  it("books within a group sort by name", () => {
    const groups = groupSourcesByProductLine([
      book({ book: "Bravo", productLine: "Rulebooks" }),
      book({ book: "Alpha", productLine: "Rulebooks" }),
    ]);
    expect(groups[0]?.books.map((b) => b.book)).toEqual(["Alpha", "Bravo"]);
  });

  it("entityCount sums every book's own entityCount within the group", () => {
    const groups = groupSourcesByProductLine([
      book({ book: "A", productLine: "Rulebooks", entityCount: 3 }),
      book({ book: "B", productLine: "Rulebooks", entityCount: 4 }),
    ]);
    expect(groups[0]?.entityCount).toBe(7);
  });

  it("an empty input yields no groups at all", () => {
    expect(groupSourcesByProductLine([])).toEqual([]);
  });
});
