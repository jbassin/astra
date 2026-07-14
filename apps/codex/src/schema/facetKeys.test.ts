import { describe, expect, it } from "vitest";

import { CodexEntitySchema, FacetsSchema } from "./entity";
import { FACET_KEYS, SPILLOVER_FACET_KEYS, facetKeysFor } from "./facetKeys";

describe("facetKeys.ts: D29-32/-33 conformance", () => {
  it("every SPILLOVER_FACET_KEYS entry is absent from every FACET_KEYS allowlist", () => {
    for (const [category, keys] of Object.entries(FACET_KEYS)) {
      for (const spillover of SPILLOVER_FACET_KEYS) {
        expect(keys, `${category} should not allowlist spillover key "${spillover}"`).not.toContain(
          spillover,
        );
      }
    }
  });

  it("every allowlisted key is a real named field on FacetsSchema (not a catchall-only key)", () => {
    const namedKeys = new Set(Object.keys(FacetsSchema.shape));
    for (const [category, keys] of Object.entries(FACET_KEYS)) {
      for (const key of keys) {
        expect(namedKeys.has(key), `${category}'s "${key}" is not a named FacetsSchema field`).toBe(
          true,
        );
      }
    }
  });

  it("no category allowlists the same key twice", () => {
    for (const [category, keys] of Object.entries(FACET_KEYS)) {
      const distinct = new Set(keys);
      expect(distinct.size, `${category} has a duplicate facet key`).toBe(keys.length);
    }
  });

  it("`prerequisites` (feat, free prose) is never allowlisted anywhere", () => {
    for (const keys of Object.values(FACET_KEYS)) {
      expect(keys).not.toContain("prerequisites");
    }
  });

  it("facetKeysFor returns [] for a category with no entry (the 73-category long tail)", () => {
    expect(facetKeysFor("trait")).toEqual([]);
    expect(facetKeysFor("rules")).toEqual([]);
    expect(facetKeysFor("item-bonus")).toEqual([]);
    expect(facetKeysFor("a-category-that-does-not-exist")).toEqual([]);
  });

  it("the pinned big-12 sets match the spec's D29-32 measured facts exactly", () => {
    expect(facetKeysFor("feat")).toEqual(["actionCost", "itemCategory"]);
    expect(facetKeysFor("creature")).toEqual([
      "size",
      "family",
      "hp",
      "ac",
      "fortitudeSave",
      "reflexSave",
      "willSave",
      "perception",
    ]);
    expect(facetKeysFor("equipment")).toEqual(["bulk", "price", "usage"]);
    expect(facetKeysFor("spell")).toEqual(["traditions", "castTime", "range"]);
    expect(facetKeysFor("hazard")).toEqual([
      "size",
      "hp",
      "ac",
      "fortitudeSave",
      "reflexSave",
      "willSave",
    ]);
    expect(facetKeysFor("weapon")).toEqual(["itemCategory", "usage", "bulk", "price"]);
    expect(facetKeysFor("class-feature")).toEqual([]);
    expect(facetKeysFor("action")).toEqual([]);
    expect(facetKeysFor("rules")).toEqual([]);
    expect(facetKeysFor("item-bonus")).toEqual([]);
    expect(facetKeysFor("trait")).toEqual([]);
    expect(facetKeysFor("deity")).toEqual(["itemCategory"]);
  });

  it("the 5 extractor-gap categories all cleared the classifier (D29-33a)", () => {
    expect(facetKeysFor("ancestry")).toEqual(["hp", "size", "speed"]);
    expect(facetKeysFor("class")).toEqual(["hp", "keyAbility"]);
    expect(facetKeysFor("background")).toEqual(["trainedSkills"]);
    expect(facetKeysFor("condition")).toEqual(["valued"]);
    expect(facetKeysFor("heritage")).toEqual(["ancestrySlug"]);
  });

  it("a minimal entity carrying every allowlisted key for its category parses (schema-level sanity)", () => {
    for (const [category, keys] of Object.entries(FACET_KEYS)) {
      const facets: Record<string, unknown> = {};
      for (const key of keys) {
        // Every named FacetsSchema field is a scalar or a flat scalar array —
        // a plausible per-key placeholder value is enough to prove the key
        // parses through CodexEntitySchema for this category.
        facets[key] =
          key === "traditions" || key === "keyAbility" || key === "trainedSkills"
            ? ["x"]
            : key === "valued"
              ? true
              : typeof key === "string" && /^(hp|ac|.*Save|perception|bulk|speed)$/.test(key)
                ? 1
                : "x";
      }
      const entity = {
        id: `${category}/synthetic`,
        slug: "synthetic",
        category,
        name: "Synthetic",
        edition: "remaster" as const,
        source: { book: "Test", license: "unknown" as const },
        traits: [],
        body: [],
        facets,
      };
      expect(() => CodexEntitySchema.parse(entity), `category "${category}"`).not.toThrow();
    }
  });
});
