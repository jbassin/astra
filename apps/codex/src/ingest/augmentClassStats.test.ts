import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import { augmentClassStats, type AugmentClassStatsInput } from "./augmentClassStats";
import type { UuidResolution } from "./enrichers";
import type { RawGrantedFeatureEntry } from "./foundryEntities";

function entity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "category" | "slug" | "name">,
): CodexEntity {
  return {
    edition: "remaster",
    source: { book: "Test Book", license: "unknown" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

function classStats(): Extract<NonNullable<CodexEntity["stats"]>, { kind: "class" }> {
  return {
    kind: "class",
    keyAbility: ["str"],
    hp: 10,
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
  };
}

function classEntity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "slug" | "name">,
): CodexEntity {
  return entity({
    category: "class",
    stats: classStats(),
    ...overrides,
  });
}

/** A `resolveUuid` stub keyed by uuid string, defaulting to `broken`. */
function resolverFrom(map: Record<string, UuidResolution>): (uuid: string) => UuidResolution {
  return (uuid) => map[uuid] ?? { kind: "broken" };
}

function run(input: Partial<AugmentClassStatsInput> & Pick<AugmentClassStatsInput, "entities">) {
  const reports: Array<{ cls: string; detail: string }> = [];
  const result = augmentClassStats({
    classGrantedFeatures: new Map(),
    resolveUuid: () => ({ kind: "broken" }),
    report: (cls, detail) => reports.push({ cls, detail }),
    ...input,
  });
  return { result, reports };
}

describe("augmentClassStats: grantedFeatures (D29-114)", () => {
  it("resolves a grant whose uuid targets a KEPT entity", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const shieldBlock = entity({
      id: "class-feature/shield-block",
      category: "class-feature",
      slug: "shield-block",
      name: "Shield Block",
    });
    const raw: RawGrantedFeatureEntry[] = [
      { level: 1, name: "Shield Block", uuid: "Compendium.pf2e.classfeatures.Item.Shield Block" },
    ];
    const { result } = run({
      entities: [fighter, shieldBlock],
      classGrantedFeatures: new Map([["class/fighter", raw]]),
      resolveUuid: resolverFrom({
        "Compendium.pf2e.classfeatures.Item.Shield Block": {
          kind: "crossref",
          id: "class-feature/shield-block",
          display: "Shield Block",
        },
      }),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    expect(out?.stats?.kind === "class" ? out.stats.grantedFeatures : undefined).toEqual([
      { level: 1, name: "Shield Block", targetId: "class-feature/shield-block" },
    ]);
    expect(result.grantedFeaturesResolved).toBe(1);
    expect(result.grantedFeaturesUnresolved).toBe(0);
  });

  it("nulls a grant whose uuid resolves structurally but the target was DROPPED (not in the final kept set) — the D29-14 cleric 'First Doctrine' case", () => {
    const raw: RawGrantedFeatureEntry[] = [
      {
        level: 1,
        name: "First Doctrine",
        uuid: "Compendium.pf2e.classfeatures.Item.First Doctrine",
      },
    ];
    // fighter (mapped to []) stands in for "a class with no subclass
    // categories" so this test exercises ONLY the grantedFeatures nulling.
    const fighterStandIn = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const { result } = run({
      entities: [fighterStandIn],
      classGrantedFeatures: new Map([["class/fighter", raw]]),
      // Resolves structurally (a real class-feature/first-doctrine doc
      // WOULD exist as a Foundry doc), but it never made it into the final
      // kept entity set (`entities` above) — D29-14 dropped it.
      resolveUuid: resolverFrom({
        "Compendium.pf2e.classfeatures.Item.First Doctrine": {
          kind: "crossref",
          id: "class-feature/first-doctrine",
          display: "First Doctrine",
        },
      }),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    expect(out?.stats?.kind === "class" ? out.stats.grantedFeatures : undefined).toEqual([
      { level: 1, name: "First Doctrine", targetId: null },
    ]);
    expect(result.grantedFeaturesResolved).toBe(0);
    expect(result.grantedFeaturesUnresolved).toBe(1);
  });

  it("nulls a grant whose uuid resolves 'broken' (no Foundry doc at all)", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const raw: RawGrantedFeatureEntry[] = [
      { level: 1, name: "Nonexistent", uuid: "Compendium.pf2e.classfeatures.Item.Nonexistent" },
    ];
    const { result } = run({
      entities: [fighter],
      classGrantedFeatures: new Map([["class/fighter", raw]]),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    expect(out?.stats?.kind === "class" ? out.stats.grantedFeatures : undefined).toEqual([
      { level: 1, name: "Nonexistent", targetId: null },
    ]);
  });

  it("sorts grantedFeatures by (level, then name) deterministically", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const raw: RawGrantedFeatureEntry[] = [
      { level: 3, name: "Bravery", uuid: "Compendium.pf2e.classfeatures.Item.Bravery" },
      { level: 1, name: "Shield Block", uuid: "Compendium.pf2e.classfeatures.Item.Shield Block" },
      {
        level: 1,
        name: "Reactive Strike",
        uuid: "Compendium.pf2e.classfeatures.Item.Reactive Strike",
      },
    ];
    const { result } = run({
      entities: [fighter],
      classGrantedFeatures: new Map([["class/fighter", raw]]),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    const names =
      out?.stats?.kind === "class" ? out.stats.grantedFeatures?.map((g) => g.name) : undefined;
    expect(names).toEqual(["Reactive Strike", "Shield Block", "Bravery"]);
  });

  it("omits grantedFeatures entirely when the class has no raw manifest entry (never an empty array)", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const { result } = run({ entities: [fighter] });
    const out = result.entities.find((e) => e.id === "class/fighter");
    expect(out?.stats?.kind === "class" ? out.stats.grantedFeatures : "MISSING").toBeUndefined();
  });

  it("leaves non-class-stats entities (incl. legacy class docs with no stats) untouched", () => {
    const witchLegacy = entity({
      id: "class/witch@legacy",
      category: "class",
      slug: "witch",
      name: "Witch",
      proseOnly: true,
    });
    const { result } = run({ entities: [witchLegacy] });
    expect(result.entities).toEqual([witchLegacy]);
    expect(result.classStatsEmitted).toBe(0);
  });
});

describe("augmentClassStats: subclassOptions (D29-115)", () => {
  it("a LIVING category (no absorption): the union collapses to a no-op — current = the non-superseded docs, legacy = the husks pointing back at them", () => {
    const barbarian = classEntity({ id: "class/barbarian", slug: "barbarian", name: "Barbarian" });
    const animal = entity({
      id: "instinct/animal",
      category: "instinct",
      slug: "animal",
      name: "Animal",
      edition: "remaster",
    });
    const animalLegacy = entity({
      id: "instinct/animal@legacy",
      category: "instinct",
      slug: "animal",
      name: "Animal",
      edition: "legacy",
      remasteredAs: ["instinct/animal"],
    });
    const { result } = run({ entities: [barbarian, animal, animalLegacy] });
    const out = result.entities.find((e) => e.id === "class/barbarian");
    expect(out?.stats?.kind === "class" ? out.stats.subclassOptions : undefined).toEqual([
      { category: "instinct", targetId: "instinct/animal", name: "Animal", superseded: false },
      {
        category: "instinct",
        targetId: "instinct/animal@legacy",
        name: "Animal",
        superseded: true,
      },
    ]);
    expect(
      result.subclassOptionCounts.find(
        (r) => r.classId === "class/barbarian" && r.category === "instinct",
      ),
    ).toEqual({ classId: "class/barbarian", category: "instinct", current: 1, legacy: 1 });
  });

  it("a 100%-superseded category (absorbed into class-feature): the union follows every remasteredAs pointer out — the cleric/doctrine case", () => {
    const cleric = classEntity({ id: "class/cleric", slug: "cleric", name: "Cleric" });
    const cloisteredLegacy = entity({
      id: "doctrine/cloistered-cleric",
      category: "doctrine",
      slug: "cloistered-cleric",
      name: "Cloistered Cleric",
      edition: "legacy",
      remasteredAs: ["class-feature/cloistered-cleric"],
    });
    const warpriestLegacy = entity({
      id: "doctrine/warpriest",
      category: "doctrine",
      slug: "warpriest",
      name: "Warpriest",
      edition: "legacy",
      remasteredAs: ["class-feature/warpriest"],
    });
    const cloisteredCurrent = entity({
      id: "class-feature/cloistered-cleric",
      category: "class-feature",
      slug: "cloistered-cleric",
      name: "Cloistered Cleric",
    });
    const warpriestCurrent = entity({
      id: "class-feature/warpriest",
      category: "class-feature",
      slug: "warpriest",
      name: "Warpriest",
    });
    const { result } = run({
      entities: [cleric, cloisteredLegacy, warpriestLegacy, cloisteredCurrent, warpriestCurrent],
    });
    const out = result.entities.find((e) => e.id === "class/cleric");
    const options = out?.stats?.kind === "class" ? out.stats.subclassOptions : undefined;
    expect(options?.filter((o) => !o.superseded)).toEqual([
      {
        category: "doctrine",
        targetId: "class-feature/cloistered-cleric",
        name: "Cloistered Cleric",
        superseded: false,
      },
      {
        category: "doctrine",
        targetId: "class-feature/warpriest",
        name: "Warpriest",
        superseded: false,
      },
    ]);
    expect(options?.filter((o) => o.superseded)).toEqual([
      {
        category: "doctrine",
        targetId: "doctrine/cloistered-cleric",
        name: "Cloistered Cleric",
        superseded: true,
      },
      { category: "doctrine", targetId: "doctrine/warpriest", name: "Warpriest", superseded: true },
    ]);
  });

  it("emits TWO labeled category rows for a two-category class (witch: lesson + patron)", () => {
    const witch = classEntity({ id: "class/witch", slug: "witch", name: "Witch" });
    const lessonCurrent = entity({
      id: "lesson/lesson-of-the-elements",
      category: "lesson",
      slug: "lesson-of-the-elements",
      name: "Lesson of the Elements",
    });
    const patronCurrent = entity({
      id: "patron/the-unseen-broker",
      category: "patron",
      slug: "the-unseen-broker",
      name: "The Unseen Broker",
    });
    const { result } = run({ entities: [witch, lessonCurrent, patronCurrent] });
    const out = result.entities.find((e) => e.id === "class/witch");
    const options = out?.stats?.kind === "class" ? out.stats.subclassOptions : undefined;
    expect(options?.map((o) => o.category)).toEqual(["lesson", "patron"]);
    expect(result.subclassOptionsEmitted).toBe(2);
  });

  it("omits subclassOptions entirely for a class mapped to zero categories (fighter/commander/guardian/magus/swashbuckler)", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const { result } = run({ entities: [fighter] });
    const out = result.entities.find((e) => e.id === "class/fighter");
    expect(out?.stats?.kind === "class" ? out.stats.subclassOptions : "MISSING").toBeUndefined();
  });

  it("STOPs (throws) when a mapped subclass category has zero entities in the final kept corpus", () => {
    const cleric = classEntity({ id: "class/cleric", slug: "cleric", name: "Cleric" });
    expect(() => run({ entities: [cleric] }).result).toThrow(/zero entities/);
  });

  it("STOPs (throws) when a superseded doc's remasteredAs has 2+ targets", () => {
    const cleric = classEntity({ id: "class/cleric", slug: "cleric", name: "Cleric" });
    const badDoctrine = entity({
      id: "doctrine/cloistered-cleric",
      category: "doctrine",
      slug: "cloistered-cleric",
      name: "Cloistered Cleric",
      remasteredAs: ["class-feature/cloistered-cleric", "class-feature/warpriest"],
    });
    const target1 = entity({
      id: "class-feature/cloistered-cleric",
      category: "class-feature",
      slug: "cloistered-cleric",
      name: "Cloistered Cleric",
    });
    const target2 = entity({
      id: "class-feature/warpriest",
      category: "class-feature",
      slug: "warpriest",
      name: "Warpriest",
    });
    expect(() => run({ entities: [cleric, badDoctrine, target1, target2] }).result).toThrow(
      /expected exactly 1/,
    );
  });

  it("STOPs (throws) when a remasteredAs target is missing from the final kept set", () => {
    const cleric = classEntity({ id: "class/cleric", slug: "cleric", name: "Cleric" });
    const badDoctrine = entity({
      id: "doctrine/cloistered-cleric",
      category: "doctrine",
      slug: "cloistered-cleric",
      name: "Cloistered Cleric",
      remasteredAs: ["class-feature/does-not-exist"],
    });
    expect(() => run({ entities: [cleric, badDoctrine] }).result).toThrow(
      /not in the final kept set/,
    );
  });

  it("STOPs (throws) when a remasteredAs target lands outside class-feature/ AND outside the mapped category", () => {
    const cleric = classEntity({ id: "class/cleric", slug: "cleric", name: "Cleric" });
    const badDoctrine = entity({
      id: "doctrine/cloistered-cleric",
      category: "doctrine",
      slug: "cloistered-cleric",
      name: "Cloistered Cleric",
      remasteredAs: ["spell/heal"],
    });
    const wrongTarget = entity({ id: "spell/heal", category: "spell", slug: "heal", name: "Heal" });
    expect(() => run({ entities: [cleric, badDoctrine, wrongTarget] }).result).toThrow(
      /outside both class-feature\/ and its own mapped category/,
    );
  });

  it("STOPs (throws) for a class slug with no SUBCLASS_CATEGORY_MAP entry at all", () => {
    const unknown = classEntity({
      id: "class/not-a-real-class",
      slug: "not-a-real-class",
      name: "?",
    });
    expect(() => run({ entities: [unknown] }).result).toThrow(/no subclass-category mapping/);
  });
});

describe("augmentClassStats: overall counters", () => {
  it("classStatsEmitted counts every stats-bearing class entity, ignoring non-class-stats entities", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const witchLegacy = entity({
      id: "class/witch@legacy",
      category: "class",
      slug: "witch",
      name: "Witch",
      proseOnly: true,
    });
    const { result } = run({ entities: [fighter, witchLegacy] });
    expect(result.classStatsEmitted).toBe(1);
  });
});
