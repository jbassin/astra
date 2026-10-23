import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import { LEVEL_BEARING_CATEGORIES, applyLevelDefault } from "./levelDefault";

function collector(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

function entity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "category">,
): CodexEntity {
  return {
    slug: overrides.id.split("/")[1] ?? "x",
    name: "X",
    edition: "remaster",
    source: { book: "Test", license: "ORC" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

describe("LEVEL_BEARING_CATEGORIES (D29-61a)", () => {
  it("is exactly the 23 named categories", () => {
    expect([...LEVEL_BEARING_CATEGORIES].sort()).toEqual(
      [
        "animal-companion",
        "armor",
        "campsite-meal",
        "class-feature",
        "epithet",
        "feat",
        "hazard",
        "item-bonus",
        "kingdom-event",
        "kingdom-structure",
        "ritual",
        "shield",
        "siege-weapon",
        "spell",
        "vehicle",
        "warfare-army",
        "warfare-tactic",
        "weapon",
        "weather-hazard",
        "equipment",
        "creature",
        "curse",
        "disease",
      ].sort(),
    );
  });

  it("excludes archetype (26.06% coverage — under the 40% floor)", () => {
    expect(LEVEL_BEARING_CATEGORIES.has("archetype")).toBe(false);
  });

  it("excludes every 0%-coverage category (deity, language, rules, ...)", () => {
    expect(LEVEL_BEARING_CATEGORIES.has("deity")).toBe(false);
    expect(LEVEL_BEARING_CATEGORIES.has("language")).toBe(false);
    expect(LEVEL_BEARING_CATEGORIES.has("rules")).toBe(false);
  });
});

describe("applyLevelDefault (R9(a), D29-61a)", () => {
  it("defaults a missing level to 0 on a level-bearing category", () => {
    const { entities, defaultedCount } = applyLevelDefault(
      [entity({ id: "equipment/adventurers-pack", category: "equipment" })],
      collector().report,
    );
    expect(defaultedCount).toBe(1);
    expect(entities[0]?.level).toBe(0);
  });

  it("leaves an already-leveled entity untouched (same object identity)", () => {
    const withLevel = entity({ id: "spell/heal", category: "spell", level: 1 });
    const { entities, defaultedCount } = applyLevelDefault([withLevel], collector().report);
    expect(defaultedCount).toBe(0);
    expect(entities[0]).toBe(withLevel); // no-op means literally unchanged
  });

  it("leaves archetype's missing level as undefined (excluded category)", () => {
    const arch = entity({ id: "archetype/duelist", category: "archetype" });
    const { entities, defaultedCount } = applyLevelDefault([arch], collector().report);
    expect(defaultedCount).toBe(0);
    expect(entities[0]?.level).toBeUndefined();
  });

  it("leaves a 0%-coverage category's missing level as undefined (e.g. deity)", () => {
    const deity = entity({ id: "deity/sarenrae", category: "deity" });
    const { entities, defaultedCount } = applyLevelDefault([deity], collector().report);
    expect(defaultedCount).toBe(0);
    expect(entities[0]?.level).toBeUndefined();
  });

  it("report-counts every defaulted entity as levelDefaulted", () => {
    const c = collector();
    applyLevelDefault([entity({ id: "curse/grave-curse", category: "curse" })], c.report);
    expect(c.reports).toEqual([{ cls: "levelDefaulted", detail: "curse/grave-curse" }]);
  });
});
