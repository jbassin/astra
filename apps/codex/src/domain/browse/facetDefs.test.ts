import { describe, expect, it } from "vitest";

import { FacetsSchema } from "@/schema/entity";
import { FACET_KEYS, SPILLOVER_FACET_KEYS, facetKeysFor } from "@/schema/facetKeys";
import { createCorpusReader, fixtureCorpusRoot } from "@/server/corpusFs";

import {
  FACET_DEFS,
  type RawFacetValue,
  allFacetKeys,
  enumTagsFor,
  numericValueFor,
  parsePriceToCopper,
} from "./facetDefs";

describe("facetDefs.ts: D29-32 conformance", () => {
  it("FACET_DEFS keys == the union of every FACET_KEYS entry, exactly", () => {
    const defKeys = Object.keys(FACET_DEFS).sort();
    expect(defKeys).toEqual([...allFacetKeys()]);
  });

  it("every FACET_KEYS-allowlisted key has a def (per category, not just the union)", () => {
    for (const [category, keys] of Object.entries(FACET_KEYS)) {
      for (const key of keys) {
        expect(FACET_DEFS[key], `${category}'s "${key}" has no facetDefs entry`).toBeDefined();
      }
    }
  });

  it("no def exists for a key absent from every category's allowlist", () => {
    const allowlisted = new Set(allFacetKeys());
    for (const key of Object.keys(FACET_DEFS)) {
      expect(allowlisted.has(key), `"${key}" has a def but is not allowlisted anywhere`).toBe(true);
    }
  });

  it("spillover keys (featLevel/rank) are absent from FACET_DEFS", () => {
    for (const spillover of SPILLOVER_FACET_KEYS) {
      expect(FACET_DEFS).not.toHaveProperty(spillover);
    }
  });

  it("every def key exists as a named field on FacetsSchema", () => {
    const namedKeys = new Set(Object.keys(FacetsSchema.shape));
    for (const key of Object.keys(FACET_DEFS)) {
      expect(namedKeys.has(key), `"${key}" is not a named FacetsSchema field`).toBe(true);
    }
  });

  it("traits never gets a facetDefs entry (core, handled by the panel directly)", () => {
    expect(FACET_DEFS).not.toHaveProperty("traits");
  });

  it("label maps are total over the value set observed in the fixture corpus", () => {
    const reader = createCorpusReader(fixtureCorpusRoot());
    let checkedAny = false;
    for (const [key, def] of Object.entries(FACET_DEFS)) {
      if (!def.labelMap) continue;
      for (const category of reader.categories()) {
        if (!facetKeysFor(category).includes(key)) continue;
        for (const row of reader.index(category)) {
          const raw = row.facets?.[key] as RawFacetValue | undefined;
          const tags = enumTagsFor(def, raw);
          if (!tags) continue;
          for (const tag of tags) {
            checkedAny = true;
            expect(
              def.labelMap,
              `${key} (category ${category}) has no label for observed value "${tag}"`,
            ).toHaveProperty(tag);
          }
        }
      }
    }
    // Sanity: the fixture corpus does exercise at least one labelMapped key
    // (size/actionCost both appear on real fixture rows) — a silently-empty
    // loop would make this whole test vacuous.
    expect(checkedAny).toBe(true);
  });

  it("size labels cover the 6 Foundry abbreviations", () => {
    expect(FACET_DEFS.size?.labelMap).toEqual({
      tiny: "Tiny",
      sm: "Small",
      med: "Medium",
      lg: "Large",
      huge: "Huge",
      grg: "Gargantuan",
    });
  });

  it("actionCost labels cover the 6 observed values", () => {
    expect(FACET_DEFS.actionCost?.labelMap).toEqual({
      "1": "1 Action",
      "2": "2 Actions",
      "3": "3 Actions",
      reaction: "Reaction",
      free: "Free Action",
      passive: "Passive",
    });
  });
});

describe("parsePriceToCopper (D29-32)", () => {
  it.each([
    ["1700 gp", 170_000],
    ["2 sp", 20],
    ["2 cp", 2],
    ["1 pp", 1000],
    ["5 gp, 3 sp", 530],
  ])("parses %s -> %d copper", (raw, expected) => {
    expect(parsePriceToCopper(raw)).toBe(expected);
  });

  it("divides a `per N` batch suffix for per-item value", () => {
    expect(parsePriceToCopper("5 gp per 10")).toBe(50);
    expect(parsePriceToCopper("100 gp per 10")).toBe(1000);
  });

  it("returns null for an unparseable string", () => {
    expect(parsePriceToCopper("free")).toBeNull();
    expect(parsePriceToCopper("")).toBeNull();
  });
});

describe("numericValueFor / enumTagsFor (D29-32 missing-key + parse plumbing)", () => {
  it("numericValueFor parses price to copper via the def's parseNumeric", () => {
    const def = FACET_DEFS.price;
    expect(def).toBeDefined();
    if (!def) return;
    expect(numericValueFor(def, "2 sp")).toBe(20);
    expect(numericValueFor(def, undefined)).toBeNull();
  });

  it("numericValueFor returns the raw number for a bare-numeric range facet", () => {
    const def = FACET_DEFS.hp;
    expect(def).toBeDefined();
    if (!def) return;
    expect(numericValueFor(def, 220)).toBe(220);
  });

  it("enumTagsFor folds an unparseable spell.range into null (the missing-key bucket)", () => {
    const def = FACET_DEFS.range;
    expect(def).toBeDefined();
    if (!def) return;
    expect(enumTagsFor(def, "120 feet")).toEqual(["100-500"]);
    expect(enumTagsFor(def, "touch")).toEqual(["touch"]);
    expect(enumTagsFor(def, "not a range at all")).toBeNull();
  });

  it("enumTagsFor handles an array-valued facet (traditions) as multiple tags", () => {
    const def = FACET_DEFS.traditions;
    expect(def).toBeDefined();
    if (!def) return;
    expect(enumTagsFor(def, ["arcane", "occult"])).toEqual(["arcane", "occult"]);
  });
});
