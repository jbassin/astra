import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "@/server/corpusFs";

import { allNavCategories, NAV_ITEMS } from "./navData";

/**
 * D29-47/D29-110 conformance gate — mirrors `facetDefs.test.ts`'s own
 * conformance-gate idiom. Originally (D29-47) `navData.ts`'s category union
 * had to equal the full corpus category list exactly; D29-110 (P11 S4)
 * curates the nav down to 28 categories, so that union-equality assert is
 * GONE (deliberately — the whole point of curation is that most of the 88
 * are no longer nav-assigned) and replaced by a subset check: every curated
 * category must still be a REAL corpus category (no typo'd/stale slug), and
 * the curated count is pinned at exactly 28. The corpus-census "exactly 88"
 * assert STAYS — it anchors the subset check (curated categories are
 * checked against this same 88-entry list) and is independently re-pinned
 * by `directoryData.test.ts` for `/categories`, which is what now surfaces
 * the full census. The fixture manifest's `categoryCounts` keys mirror the
 * real corpus's 88 categories 1:1 (hermeticity convention — same source
 * `facetDefs.test.ts` itself reads), so this holds under both CI (fixture
 * only) and a real corpus checkout alike.
 */
describe("navData.ts: D29-110 curated nav IA conformance", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const expectedCategories = [...reader.categories()].sort();

  it("the full corpus category list is exactly 88 entries", () => {
    expect(expectedCategories.length).toBe(88);
  });

  it("every curated nav category is a real corpus category (curated ⊆ 88)", () => {
    const corpusSet = new Set(expectedCategories);
    for (const category of allNavCategories()) {
      expect(corpusSet.has(category), `"${category}" is not a real corpus category`).toBe(true);
    }
  });

  it("allNavCategories() totals exactly 28 (D29-110's curated set)", () => {
    expect(allNavCategories().length).toBe(28);
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

  it("every dropdown item carries at least one category; every plain-link item carries an href and no categories", () => {
    for (const item of NAV_ITEMS) {
      if (item.kind === "dropdown") {
        expect(item.categories?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(item.href).toBeTruthy();
        // D29-110: the old Rules split control (a link ALSO carrying a
        // dropdown tail) is gone — every link item today is bare.
        expect(item.categories ?? []).toHaveLength(0);
      }
    }
  });

  it("Rules is a bare direct link to /rules, no dropdown tail (D29-110: the split control is gone)", () => {
    const rules = NAV_ITEMS.find((item) => item.label === "Rules");
    expect(rules).toBeDefined();
    expect(rules?.kind).toBe("link");
    expect(rules?.href).toBe("/rules");
    expect(rules?.categories ?? []).toHaveLength(0);
  });

  it("Sources is a bare direct link with no categories of its own", () => {
    const sources = NAV_ITEMS.find((item) => item.label === "Sources");
    expect(sources).toBeDefined();
    if (!sources) return;
    expect(sources.href).toBe("/sources");
    expect(sources.categories ?? []).toHaveLength(0);
  });

  it("All categories is a bare direct link to /categories (replaces the old Everything dropdown)", () => {
    const allCategories = NAV_ITEMS.find((item) => item.label === "All categories");
    expect(allCategories).toBeDefined();
    expect(allCategories?.kind).toBe("link");
    expect(allCategories?.href).toBe("/categories");
    expect(allCategories?.categories ?? []).toHaveLength(0);
  });
});
