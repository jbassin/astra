import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";
import { resolveCategoryDirectory } from "./directoryData";

/**
 * D29-27/D29-29 tier 3 — the `/` category directory's pure core, over the
 * fixture corpus (same "plain function, no Start-runtime" pattern as
 * `entityPageData.test.ts`).
 */
describe("resolveCategoryDirectory (D29-27)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const data = resolveCategoryDirectory(reader);

  it("lists every fixture category exactly once, across all groups", () => {
    const allCategories = data.groups.flatMap((g) => g.categories.map((c) => c.category));
    expect(allCategories.length).toBe(reader.categories().length);
    expect(new Set(allCategories).size).toBe(allCategories.length);
    expect(allCategories.sort()).toEqual([...reader.categories()].sort());
  });

  // D29-110 (P11 S4): the header nav curates down to 28 categories
  // (`navData.test.ts`) — `/categories` (this data layer) is what now
  // surfaces the FULL census, so it gets its own explicit "exactly 88" pin
  // rather than relying solely on "matches whatever the fixture carries"
  // above (that assert would still pass if the fixture itself regressed to
  // fewer categories; this one is independent of the fixture's own count).
  it("D29-110: /categories still surfaces all 88 real corpus categories, unaffected by the nav's curation", () => {
    const allCategories = data.groups.flatMap((g) => g.categories.map((c) => c.category));
    expect(allCategories.length).toBe(88);
  });

  it("groups creature/hazard/spell/feat categories into their own named group", () => {
    const groupOf = (cat: string) =>
      data.groups.find((g) => g.categories.some((c) => c.category === cat))?.group;
    expect(groupOf("creature")).toBe("creature");
    expect(groupOf("hazard")).toBe("hazard");
    expect(groupOf("spell")).toBe("spell");
    expect(groupOf("feat")).toBe("feat");
    expect(groupOf("weapon")).toBe("equipment");
    expect(groupOf("rules")).toBe("generic");
  });

  it("each category's count matches categoryCounts()", () => {
    const counts = reader.categoryCounts();
    for (const group of data.groups) {
      for (const row of group.categories) {
        expect(row.count).toBe(counts[row.category]);
      }
    }
  });

  it("categories within a group are sorted A-Z", () => {
    for (const group of data.groups) {
      const names = group.categories.map((c) => c.category);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("totalEntities sums every category's count", () => {
    const counts = reader.categoryCounts();
    const expected = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(data.totalEntities).toBe(expected);
  });
});
