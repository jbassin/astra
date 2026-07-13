import { describe, expect, it } from "vitest";

import { CategoryMapError, isKnownPack, mapCategory } from "./categoryMap";

describe("categoryMap: exclusions (D29-8 + S2 extension)", () => {
  it("excludes a *-effects pack wholesale, regardless of doc type", () => {
    expect(mapCategory("feat-effects", "effect")).toEqual({ kind: "excluded" });
    // campaign-effects's stray non-effect docs are excluded too (pack-level rule).
    expect(mapCategory("campaign-effects", "feat")).toEqual({ kind: "excluded" });
    expect(mapCategory("campaign-effects", "condition")).toEqual({ kind: "excluded" });
  });

  it("excludes macros/action-macros/rollable-tables/criticaldeck", () => {
    expect(mapCategory("macros", "script")).toEqual({ kind: "excluded" });
    expect(mapCategory("action-macros", "script")).toEqual({ kind: "excluded" });
    expect(mapCategory("rollable-tables", "__NO_TYPE__")).toEqual({ kind: "excluded" });
    expect(mapCategory("criticaldeck", "__NO_TYPE__")).toEqual({ kind: "excluded" });
  });
});

describe("categoryMap: Actor packs collapse many-to-one", () => {
  it("maps npc/character/familiar to creature across different bestiary packs", () => {
    expect(mapCategory("pathfinder-bestiary", "npc")).toEqual({
      kind: "category",
      category: "creature",
    });
    expect(mapCategory("abomination-vaults-bestiary", "npc")).toEqual({
      kind: "category",
      category: "creature",
    });
    expect(mapCategory("iconics", "character")).toEqual({ kind: "category", category: "creature" });
    expect(mapCategory("paizo-pregens", "familiar")).toEqual({
      kind: "category",
      category: "creature",
    });
  });

  it("maps hazard/army/vehicle distinctly", () => {
    expect(mapCategory("age-of-ashes-bestiary", "hazard")).toEqual({
      kind: "category",
      category: "hazard",
    });
    expect(mapCategory("kingmaker-bestiary", "army")).toEqual({
      kind: "category",
      category: "warfare-army",
    });
    expect(mapCategory("vehicles", "vehicle")).toEqual({ kind: "category", category: "vehicle" });
  });

  it("hard-fails on an Actor pack doc type it hasn't seen", () => {
    expect(() => mapCategory("pathfinder-bestiary", "loot")).toThrow(CategoryMapError);
  });
});

describe("categoryMap: equipment fans per-doc-type", () => {
  it("gives weapon/armor/shield their own category", () => {
    expect(mapCategory("equipment", "weapon")).toEqual({ kind: "category", category: "weapon" });
    expect(mapCategory("equipment", "armor")).toEqual({ kind: "category", category: "armor" });
    expect(mapCategory("equipment", "shield")).toEqual({ kind: "category", category: "shield" });
  });

  it("folds ammo/backpack/consumable/equipment/kit/treasure into equipment", () => {
    for (const t of ["ammo", "backpack", "consumable", "equipment", "kit", "treasure"]) {
      expect(mapCategory("equipment", t)).toEqual({ kind: "category", category: "equipment" });
    }
  });
});

describe("categoryMap: other Item packs", () => {
  it("maps the straightforward single-type packs", () => {
    expect(mapCategory("spells", "spell")).toEqual({ kind: "category", category: "spell" });
    expect(mapCategory("ancestries", "ancestry")).toEqual({
      kind: "category",
      category: "ancestry",
    });
    expect(mapCategory("classes", "class")).toEqual({ kind: "category", category: "class" });
    expect(mapCategory("class-features", "feat")).toEqual({
      kind: "category",
      category: "class-feature",
    });
    expect(mapCategory("ancestry-features", "feat")).toEqual({
      kind: "category",
      category: "feat",
    });
  });

  it("folds glossary-ability packs to creature-ability, not action", () => {
    expect(mapCategory("bestiary-ability-glossary-srd", "action")).toEqual({
      kind: "category",
      category: "creature-ability",
    });
    expect(mapCategory("bestiary-family-ability-glossary", "action")).toEqual({
      kind: "category",
      category: "creature-ability",
    });
  });

  it("maps a fanning Item pack's nested per-type table", () => {
    expect(mapCategory("adventure-specific-actions", "action")).toEqual({
      kind: "category",
      category: "action",
    });
    expect(mapCategory("adventure-specific-actions", "feat")).toEqual({
      kind: "category",
      category: "feat",
    });
    expect(mapCategory("boons-and-curses", "feat")).toEqual({ kind: "category", category: "boon" });
    expect(mapCategory("boons-and-curses", "effect")).toEqual({
      kind: "category",
      category: "effect",
    });
    expect(mapCategory("kingmaker-features", "campaignFeature")).toEqual({
      kind: "category",
      category: "kingdom-feature",
    });
  });

  it("hard-fails on an unknown pack entirely", () => {
    expect(() => mapCategory("some-new-pack-2027", "feat")).toThrow(CategoryMapError);
  });

  it("hard-fails on a known Item pack with a doc type it hasn't seen", () => {
    expect(() => mapCategory("spells", "ritual")).toThrow(CategoryMapError);
  });
});

describe("isKnownPack", () => {
  it("is true for excluded, Actor, and Item packs; false for an unrecognized pack", () => {
    expect(isKnownPack("macros")).toBe(true);
    expect(isKnownPack("pathfinder-bestiary")).toBe(true);
    expect(isKnownPack("spells")).toBe(true);
    expect(isKnownPack("some-new-pack-2027")).toBe(false);
  });
});

describe("categoryMap: totality over the real (pack,type) census (D29-7)", () => {
  // A small, hand-transcribed fixture of every distinct (pack,type) pair
  // observed in the real pf2e-8.3.0 snapshot (166 pairs total, walked once
  // against the real corpus while writing this map — see categoryMap.ts's file
  // header). Not the full corpus (that stays a host-only run, D29-12's
  // hermeticity pin) — just proof that the map is total over what's real.
  const REAL_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["abomination-vaults-bestiary", "hazard"],
    ["abomination-vaults-bestiary", "npc"],
    ["action-macros", "script"],
    ["actions", "action"],
    ["adventure-specific-actions", "action"],
    ["adventure-specific-actions", "feat"],
    ["ancestries", "ancestry"],
    ["ancestry-features", "feat"],
    ["backgrounds", "background"],
    ["bestiary-ability-glossary-srd", "action"],
    ["bestiary-effects", "effect"],
    ["bestiary-family-ability-glossary", "action"],
    ["boons-and-curses", "effect"],
    ["boons-and-curses", "feat"],
    ["campaign-effects", "condition"],
    ["campaign-effects", "effect"],
    ["campaign-effects", "feat"],
    ["class-features", "feat"],
    ["classes", "class"],
    ["conditions", "condition"],
    ["criticaldeck", "__NO_TYPE__"],
    ["deities", "deity"],
    ["equipment", "ammo"],
    ["equipment", "armor"],
    ["equipment", "backpack"],
    ["equipment", "consumable"],
    ["equipment", "equipment"],
    ["equipment", "kit"],
    ["equipment", "shield"],
    ["equipment", "treasure"],
    ["equipment", "weapon"],
    ["equipment-effects", "effect"],
    ["familiar-abilities", "action"],
    ["feat-effects", "effect"],
    ["feats", "feat"],
    ["hazards", "hazard"],
    ["heritages", "heritage"],
    ["iconics", "character"],
    ["iconics", "familiar"],
    ["kingmaker-bestiary", "army"],
    ["kingmaker-bestiary", "character"],
    ["kingmaker-bestiary", "hazard"],
    ["kingmaker-bestiary", "npc"],
    ["kingmaker-features", "campaignFeature"],
    ["kingmaker-features", "effect"],
    ["macros", "script"],
    ["myth-speaker-bestiary", "vehicle"],
    ["npc-gallery", "npc"],
    ["other-effects", "effect"],
    ["paizo-pregens", "character"],
    ["paizo-pregens", "familiar"],
    ["pathfinder-society-boons", "feat"],
    ["rollable-tables", "__NO_TYPE__"],
    ["spell-effects", "effect"],
    ["spells", "spell"],
    ["standalone-adventures", "hazard"],
    ["standalone-adventures", "npc"],
    ["vehicles", "vehicle"],
  ];

  it("resolves every real pair without throwing", () => {
    for (const [pack, type] of REAL_PAIRS) {
      expect(() => mapCategory(pack, type), `${pack}::${type}`).not.toThrow();
    }
  });
});
