import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "@/server/corpusFs";

import { NAV_ITEMS, allNavCategories, tailCategoriesFor } from "./navData";

/**
 * D29-47 conformance gate — mirrors `facetDefs.test.ts`'s own conformance-gate
 * idiom: `navData.ts`'s category union must equal the full corpus category
 * list exactly (every category assigned to exactly one nav item, none twice,
 * none dropped). The fixture manifest's `categoryCounts` keys mirror the real
 * corpus's 88 categories 1:1 (hermeticity convention — same source
 * `facetDefs.test.ts` itself reads), so this holds under both CI (fixture
 * only) and a real corpus checkout alike.
 */
describe("navData.ts: D29-47 nav IA conformance", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const expectedCategories = [...reader.categories()].sort();

  it("the full corpus category list is exactly 88 entries", () => {
    expect(expectedCategories.length).toBe(88);
  });

  it("every real corpus category is assigned to exactly one nav item (88/88, no dupes, no gaps)", () => {
    expect([...allNavCategories()].sort()).toEqual(expectedCategories);
  });

  it("no category is assigned twice across nav items", () => {
    const seen = new Set<string>();
    for (const item of NAV_ITEMS) {
      for (const category of item.categories ?? []) {
        expect(seen.has(category), `"${category}" assigned twice`).toBe(false);
        seen.add(category);
      }
    }
  });

  it("allNavCategories() totals exactly 88", () => {
    expect(allNavCategories().length).toBe(88);
  });

  it("every dropdown item carries at least one category; every plain-link item carries an href", () => {
    for (const item of NAV_ITEMS) {
      if (item.kind === "dropdown") {
        expect(item.categories?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(item.href).toBeTruthy();
      }
    }
  });

  it("the Rules split control's own category ('rules') is excluded from its dropdown tail", () => {
    const rules = NAV_ITEMS.find((item) => item.label === "Rules");
    expect(rules).toBeDefined();
    if (!rules) return;
    expect(rules.href).toBe("/rules");
    expect(rules.categories).toContain("rules");
    const tail = tailCategoriesFor(rules);
    expect(tail).not.toContain("rules");
    expect(tail.length).toBe(8);
  });

  it("Sources is a bare direct link with no categories of its own", () => {
    const sources = NAV_ITEMS.find((item) => item.label === "Sources");
    expect(sources).toBeDefined();
    if (!sources) return;
    expect(sources.href).toBe("/sources");
    expect(sources.categories ?? []).toHaveLength(0);
  });
});
