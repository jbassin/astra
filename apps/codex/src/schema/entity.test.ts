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

describe("CodexEntity: P6 (D29-60/-62) itemSubcategory + mastheadExtra", () => {
  it("round-trips facets.itemSubcategory (equipment-only fill-gap field, R8)", () => {
    const entity = baseEntity({
      category: "equipment",
      facets: { itemCategory: "Runes", itemSubcategory: "Weapon Property Runes" },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("round-trips mastheadExtra (top-level, rich InlineNode value, R3)", () => {
    const entity = baseEntity({
      mastheadExtra: [
        {
          label: "Target",
          value: [
            {
              kind: "text",
              content: "1 willing living creature",
              marks: { bold: false, italic: false, superscript: false },
            },
          ],
        },
        {
          label: "Primary Check",
          value: [{ kind: "crossref", targetId: "trait/arcana", display: "Arcana" }],
        },
      ],
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("leaves mastheadExtra absent on a plain entity (never a defaulted empty array)", () => {
    expect(parseCodexEntity(baseEntity()).mastheadExtra).toBeUndefined();
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

describe("CodexEntity.stats: ClassStats (D29-113..115/P12 S1, schemaVersion 4->5)", () => {
  it("accepts a ClassStats entity with scalar fields only (pre-augmentClassStats shape)", () => {
    const entity = baseEntity({
      id: "class/fighter",
      category: "class",
      stats: {
        kind: "class",
        keyAbility: ["dex", "str"],
        hp: 10,
        perception: 2,
        savingThrows: { fortitude: 2, reflex: 2, will: 1 },
        attacks: { simple: 2, martial: 2, advanced: 1, unarmed: 2 },
        defenses: { unarmored: 1, light: 1, medium: 1, heavy: 1 },
        trainedSkills: { value: [], additional: 3 },
        spellcasting: false,
        featLevels: {
          classFeat: [1, 2, 4],
          ancestryFeat: [1, 5],
          skillFeat: [2, 4],
          generalFeat: [3, 7],
          skillIncrease: [3, 5],
        },
      },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts an empty keyAbility array (psychic's real shape) + a non-empty attacks.other (gunslinger's real shape)", () => {
    const entity = baseEntity({
      id: "class/gunslinger",
      category: "class",
      stats: {
        kind: "class",
        keyAbility: [],
        hp: 10,
        perception: 2,
        savingThrows: { fortitude: 2, reflex: 1, will: 1 },
        attacks: {
          simple: 1,
          martial: 1,
          advanced: 0,
          unarmed: 1,
          other: { name: "Simple Firearms, Martial Firearms", rank: 2 },
        },
        defenses: { unarmored: 1, light: 1, medium: 0, heavy: 0 },
        trainedSkills: { value: [], additional: 3 },
        spellcasting: false,
        featLevels: {
          classFeat: [1],
          ancestryFeat: [1],
          skillFeat: [2],
          generalFeat: [3],
          skillIncrease: [3],
        },
      },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("accepts the post-augmentClassStats shape: grantedFeatures (incl. a null targetId) + subclassOptions (incl. a superseded husk)", () => {
    const entity = baseEntity({
      id: "class/cleric",
      category: "class",
      stats: {
        kind: "class",
        keyAbility: ["wis"],
        hp: 8,
        perception: 1,
        savingThrows: { fortitude: 1, reflex: 1, will: 2 },
        attacks: {
          simple: 1,
          martial: 0,
          advanced: 0,
          unarmed: 1,
          other: { name: "Deity's favored weapon", rank: 1 },
        },
        defenses: { unarmored: 1, light: 0, medium: 0, heavy: 0 },
        trainedSkills: { value: [], additional: 2 },
        spellcasting: true,
        featLevels: {
          classFeat: [1],
          ancestryFeat: [1],
          skillFeat: [2],
          generalFeat: [3],
          skillIncrease: [3],
        },
        grantedFeatures: [
          { level: 1, name: "Doctrine", targetId: "class-feature/doctrine" },
          { level: 1, name: "First Doctrine", targetId: null },
        ],
        subclassOptions: [
          {
            category: "doctrine",
            targetId: "class-feature/cloistered-cleric",
            name: "Cloistered Cleric",
            superseded: false,
          },
          {
            category: "doctrine",
            targetId: "doctrine/cloistered-cleric",
            name: "Cloistered Cleric",
            superseded: true,
          },
        ],
      },
    });
    expect(parseCodexEntity(entity)).toEqual(entity);
  });

  it("rejects a class stats object missing a required scalar field", () => {
    const bad = {
      ...baseEntity({ category: "class" }),
      stats: {
        kind: "class",
        keyAbility: ["dex"],
        // hp missing
        perception: 2,
        savingThrows: { fortitude: 2, reflex: 2, will: 1 },
        attacks: { simple: 2, martial: 2, advanced: 1, unarmed: 2 },
        defenses: { unarmored: 1, light: 1, medium: 1, heavy: 1 },
        trainedSkills: { value: [], additional: 3 },
        spellcasting: false,
        featLevels: {
          classFeat: [1],
          ancestryFeat: [1],
          skillFeat: [2],
          generalFeat: [3],
          skillIncrease: [3],
        },
      },
    };
    expect(() => CodexEntitySchema.parse(bad)).toThrow();
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
