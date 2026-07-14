import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";
import { resolveCategoryListing } from "./listingData";

/**
 * D29-27/D29-29 tier 3 — the `/{category}` A–Z listing's pure core, over the
 * fixture corpus.
 */
describe("resolveCategoryListing (D29-27)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("returns every row for a real category, A-Z sorted by name", () => {
    const data = resolveCategoryListing(reader, "spell");
    expect(data).not.toBeNull();
    expect(data?.category).toBe("spell");
    expect(data?.rows.length).toBe(reader.index("spell").length);
    const names = (data?.rows ?? []).map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("row count equals the category's file/index count (D acceptance)", () => {
    for (const category of reader.categories()) {
      const data = resolveCategoryListing(reader, category);
      expect(data?.rows.length).toBe(reader.index(category).length);
    }
  });

  it("M6: a listing row omits traits (the loader-payload trim) but keeps id/name/level/rarity/source/edition", () => {
    const data = resolveCategoryListing(reader, "spell");
    const row = data?.rows.find((r) => r.id === "spell/heal");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("traits");
    expect(row?.name).toBe("Heal");
    expect(row?.source).toBeDefined();
    expect(row?.edition).toBeDefined();
  });

  it("omits optional level/rarity when absent on the source row (fail-soft, never undefined-valued keys)", () => {
    const data = resolveCategoryListing(reader, "spell");
    const withoutLevel = data?.rows.find((r) => r.level === undefined);
    if (withoutLevel) expect("level" in withoutLevel).toBe(false);
  });

  it("returns null for an unknown category (loader 404 input)", () => {
    expect(resolveCategoryListing(reader, "not-a-real-category")).toBeNull();
  });
});
