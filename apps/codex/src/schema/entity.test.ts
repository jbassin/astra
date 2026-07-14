import { describe, expect, it } from "vitest";

import { CodexEntitySchema, parseCodexEntity, toIndexRow } from "./entity";
import type { CodexEntity } from "./entity";

function baseEntity(overrides: Partial<CodexEntity> = {}): CodexEntity {
  return {
    id: "spell/heal",
    slug: "heal",
    category: "spell",
    name: "Heal",
    edition: "remaster",
    source: { book: "Player Core", license: "ORC" },
    traits: ["healing", "manipulate", "vitality"],
    body: [],
    facets: { rank: 1, traditions: ["divine", "primal"] },
    ...overrides,
  };
}

describe("CodexEntity: identity + pairing (D29-1/-7)", () => {
  it("round-trips a plain entity", () => {
    const entity = baseEntity();
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts a shared-slug legacy-pair id (the Heal/Heal case, D29-1)", () => {
    const legacy = baseEntity({
      id: "spell/heal@legacy",
      edition: "legacy",
      source: { book: "Core Rulebook", license: "OGL" },
      legacyOf: undefined,
      remasteredAs: ["spell/heal"],
    });
    expect(parseCodexEntity(legacy)).toEqual(legacy);
  });

  it("accepts multi-member remasteredAs/legacyOf arrays (AoN's arrays, not singletons)", () => {
    const entity = baseEntity({ remasteredAs: ["spell/force-barrage", "spell/magic-missile-ii"] });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts variantOf for a 1:N Foundry creature variant", () => {
    const entity = baseEntity({
      id: "creature/adamantine-dragon-spellcaster",
      category: "creature",
      variantOf: "creature/adamantine-dragon-adult",
      facets: { hp: 250, ac: 44 },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts non-ASCII slugs verbatim (real sluggify output, e.g. déjà-vu)", () => {
    const entity = baseEntity({ id: "spell/déjà-vu", slug: "déjà-vu", name: "Déjà Vu" });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("rejects a malformed id (no category/slug separator)", () => {
    expect(() => parseCodexEntity(baseEntity({ id: "heal" }))).toThrow();
  });

  it("rejects extra top-level fields (.strict())", () => {
    const bad = { ...baseEntity(), extra: true };
    expect(() => CodexEntitySchema.parse(bad)).toThrow();
  });
});

describe("CodexEntity: P4 (D29-39) breadcrumbs + attachedSidebars", () => {
  it("round-trips breadcrumbs (top-level, not facets)", () => {
    const entity = baseEntity({
      category: "rules",
      breadcrumbs: ["Chapter 2: Tools", "Building Creatures"],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("leaves breadcrumbs absent on a plain entity (never a defaulted empty array)", () => {
    const entity = baseEntity();
    expect(parseCodexEntity(entity).breadcrumbs).toBeUndefined();
  });

  it("round-trips attachedSidebars (any category, per the stakeholder decision)", () => {
    const entity = baseEntity({
      category: "ancestry",
      attachedSidebars: ["sidebar/a-place-undersea", "sidebar/another-box"],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });
});

describe("CodexEntity: license + prose fields (D29-8/-13)", () => {
  it("allows an unknown license (report-counted residue)", () => {
    const entity = baseEntity({ source: { book: "Some Adventure Path", license: "unknown" } });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts a journal-merged loreBody alongside body", () => {
    const entity = baseEntity({
      loreBody: [
        {
          kind: "paragraph",
          children: [
            {
              kind: "text",
              content: "Lore.",
              marks: { bold: false, italic: false, superscript: false },
            },
          ],
        },
      ],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts a standalone proseOnly journal-page entity", () => {
    const entity = baseEntity({
      id: "ancestry/some-orphan-page",
      category: "ancestry",
      proseOnly: true,
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });
});

describe("CodexEntity: embeddedItems (S2 widening, foundryEntities.ts)", () => {
  it("accepts an Actor-derived entity's embedded items", () => {
    const entity = baseEntity({
      id: "creature/balor",
      category: "creature",
      facets: { hp: 480, ac: 45 },
      embeddedItems: [
        {
          name: "Divine Decree",
          slug: "divine-decree",
          type: "spell",
          level: 7,
          traits: ["divine", "evocation"],
          body: [],
        },
        {
          name: "Rend",
          slug: "rend",
          type: "melee",
          actionCost: "1",
          traits: ["agile"],
          body: [],
        },
      ],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("rejects an embedded item missing its required fields (.strict())", () => {
    const bad = { ...baseEntity(), embeddedItems: [{ name: "X" }] };
    expect(() => CodexEntitySchema.parse(bad)).toThrow();
  });

  it("accepts a melee strike item's attackBonus/damage (D29-20/P1.6)", () => {
    const entity = baseEntity({
      id: "creature/red-dragon-adult",
      category: "creature",
      embeddedItems: [
        {
          name: "Jaws",
          slug: "jaws",
          type: "melee",
          traits: ["fire", "magical", "reach-15", "unarmed"],
          body: [],
          attackBonus: 29,
          damage: ["3d12+15 piercing", "2d6 fire"],
        },
      ],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts a spellcastingEntry item's dc/attack/tradition (D29-20/P1.6)", () => {
    const entity = baseEntity({
      id: "creature/red-dragon-adult",
      category: "creature",
      embeddedItems: [
        {
          name: "Arcane Innate Spells",
          slug: "arcane-innate-spells",
          type: "spellcastingEntry",
          traits: [],
          body: [],
          dc: 35,
          attack: 27,
          tradition: "arcane",
        },
      ],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });
});

describe("CodexEntity.stats (D29-20/P1.6, schemaVersion 1->2)", () => {
  it("accepts a CreatureStats entity with every sub-field populated", () => {
    const entity = baseEntity({
      id: "creature/red-dragon-adult",
      category: "creature",
      stats: {
        kind: "creature",
        speeds: { base: 50, other: [{ type: "fly", value: 150 }] },
        abilityMods: { str: 7, dex: 3, con: 6, int: 3, wis: 4, cha: 5 },
        senses: {
          mod: 26,
          details: "smoke vision",
          list: [{ type: "darkvision" }, { type: "scent", acuity: "imprecise", range: 60 }],
        },
        languages: ["common", "draconic"],
        immunities: ["fire", "paralyzed", "sleep"],
        resistances: [{ type: "cold", value: 15 }],
        weaknesses: [{ type: "cold", value: 15 }],
        skills: { stealth: 23, athletics: 29 },
      },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts a HazardStats entity with disable/routine/reset as BlockNode[]", () => {
    const entity = baseEntity({
      id: "hazard/gravehall-trap",
      category: "hazard",
      stats: {
        kind: "hazard",
        hardness: 0,
        stealth: { value: 12, details: "" },
        isComplex: true,
        disable: [
          {
            kind: "paragraph",
            children: [
              {
                kind: "text",
                content: "Disrupt the magical trigger.",
                marks: { bold: false, italic: false, superscript: false },
              },
            ],
          },
        ],
        routine: [{ kind: "divider" }],
      },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("rejects a stats object mixing creature and hazard fields (discriminated union)", () => {
    const bad = {
      ...baseEntity(),
      stats: { kind: "creature", hardness: 5 },
    };
    expect(() => CodexEntitySchema.parse(bad)).toThrow();
  });

  it("omits stats entirely rather than requiring an empty object", () => {
    const entity = baseEntity();
    expect(entity.stats).toBeUndefined();
    expect(parseCodexEntity(entity)).toEqual(entity);
  });
});

describe("Facets: typed fields + catchall passthrough", () => {
  it("accepts the typed creature facet fields", () => {
    const entity = baseEntity({
      category: "creature",
      facets: {
        hp: 480,
        ac: 45,
        fortitudeSave: 39,
        reflexSave: 35,
        willSave: 34,
        perception: 36,
        size: "lg",
        family: "Demons",
      },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts the typed equipment facet fields", () => {
    const entity = baseEntity({
      category: "weapon",
      facets: { price: "2 sp", bulk: 2, usage: "held-in-one-hand", itemCategory: "martial" },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts the typed feat facet fields", () => {
    const entity = baseEntity({
      category: "feat",
      facets: { featLevel: 3, prerequisites: ["Battle Medicine"], actionCost: "3" },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("passes through arbitrary scalar/array facet fields for other categories (the catchall)", () => {
    const entity = baseEntity({
      category: "deity",
      facets: { alignment: "NG", divine_font: ["heal", "harm"], favored_weapon: "Rapier" },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("rejects a nested-object catchall value (facets only accept scalars/flat arrays)", () => {
    const entity = baseEntity({ facets: { nested: { not: "allowed" } } as never });
    expect(() => CodexEntitySchema.parse(entity)).toThrow();
  });
});

describe("toIndexRow (D29-3 slim facet row)", () => {
  it("carries id/name/level/traits/rarity/source/edition/superseded and drops body", () => {
    const entity = baseEntity({ level: 1, rarity: "common" });
    const row = toIndexRow(entity, []);
    expect(row).toEqual({
      id: "spell/heal",
      name: "Heal",
      level: 1,
      traits: ["healing", "manipulate", "vitality"],
      rarity: "common",
      source: { book: "Player Core", license: "ORC" },
      edition: "remaster",
      superseded: false,
    });
    expect(row).not.toHaveProperty("body");
  });

  it("omits level/rarity/facets when absent rather than emitting undefined keys", () => {
    const row = toIndexRow(baseEntity(), []);
    expect(Object.keys(row).sort()).toEqual([
      "edition",
      "id",
      "name",
      "source",
      "superseded",
      "traits",
    ]);
  });

  describe("D29-33c: facets trimmed to the allowlist", () => {
    it("omits `facets` entirely when the allowlist doesn't match anything on the entity", () => {
      const entity = baseEntity({ facets: { rank: 1, traditions: ["divine", "primal"] } });
      const row = toIndexRow(entity, ["actionCost"]); // spell never carries actionCost
      expect(row).not.toHaveProperty("facets");
    });

    it("keeps only the allowlisted keys the entity actually carries a value for", () => {
      const entity = baseEntity({
        category: "spell",
        facets: { rank: 1, traditions: ["divine", "primal"], castTime: "1" },
      });
      const row = toIndexRow(entity, ["traditions", "castTime", "range"]);
      expect(row.facets).toEqual({ traditions: ["divine", "primal"], castTime: "1" });
    });
  });

  describe("D29-33c: superseded (remasteredAs non-empty, NOT edition === legacy)", () => {
    it("is false when remasteredAs is absent", () => {
      expect(toIndexRow(baseEntity(), []).superseded).toBe(false);
    });

    it("is true when remasteredAs is a non-empty array", () => {
      const entity = baseEntity({
        edition: "legacy",
        remasteredAs: ["spell/heal"],
      });
      expect(toIndexRow(entity, []).superseded).toBe(true);
    });

    it("is false for a never-remastered legacy entity (edition alone is NOT the predicate)", () => {
      const entity = baseEntity({ edition: "legacy", remasteredAs: undefined });
      expect(toIndexRow(entity, []).superseded).toBe(false);
    });

    it("is true for a remaster-edition anomaly member (the 42 remaster+remasteredAs rows)", () => {
      const entity = baseEntity({ edition: "remaster", remasteredAs: ["spell/some-other"] });
      expect(toIndexRow(entity, []).superseded).toBe(true);
    });
  });
});
