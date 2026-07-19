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

/** A `class-feature` masthead "Class" entry naming `className` (real-corpus
 * shape — the value carries a measured leading space, `build-search.ts`'s
 * own D29-101a note). */
function mastheadClass(className: string): CodexEntity["mastheadExtra"] {
  return [
    {
      label: "Class",
      value: [
        {
          kind: "text",
          content: ` ${className}`,
          marks: { bold: false, italic: false, superscript: false },
        },
      ],
    },
  ];
}

function classFeature(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "name">,
): CodexEntity {
  return entity({ category: "class-feature", slug: "weapon-specialization", ...overrides });
}

describe("augmentClassStats: grantedFeatures same-slug collision-family disambiguation (D29-132)", () => {
  const SHARED_UUID = "Compendium.pf2e.classfeatures.Item.Weapon Specialization";
  const SHARED_RESOLUTION: UuidResolution = {
    kind: "crossref",
    id: "class-feature/weapon-specialization",
    display: "Weapon Specialization",
  };
  const sharedGrant: RawGrantedFeatureEntry[] = [
    { level: 7, name: "Weapon Specialization", uuid: SHARED_UUID },
  ];

  it("family size 1 (no collision): resolves exactly as the pre-D29-132 naive check would — byte-identical", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const soleDoc = classFeature({
      id: "class-feature/weapon-specialization",
      name: "Weapon Specialization",
      // No mastheadExtra/legacyOf at all — proves family-size-1 doesn't need
      // ANY of the new disambiguation machinery to resolve correctly.
    });
    const { result } = run({
      entities: [fighter, soleDoc],
      classGrantedFeatures: new Map([["class/fighter", sharedGrant]]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    expect(out?.stats?.kind === "class" ? out.stats.grantedFeatures : undefined).toEqual([
      { level: 7, name: "Weapon Specialization", targetId: "class-feature/weapon-specialization" },
    ]);
  });

  it("rule (1) masthead match: two classes sharing the identical Foundry grant uuid each resolve to THEIR OWN masthead-matched doc — pre-D29-132 both would wrongly resolve to the collision WINNER (fighter's)", () => {
    const fighter = classEntity({ id: "class/fighter", slug: "fighter", name: "Fighter" });
    const swashbuckler = classEntity({
      id: "class/swashbuckler",
      slug: "swashbuckler",
      name: "Swashbuckler",
    });
    // The collision winner (unsuffixed id) — mastheads Fighter.
    const fighterDoc = classFeature({
      id: "class-feature/weapon-specialization",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Fighter"),
    });
    // The residual loser (suffixed id) — mastheads Swashbuckler.
    const swashbucklerDoc = classFeature({
      id: "class-feature/weapon-specialization-2",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Swashbuckler"),
    });
    const { result } = run({
      entities: [fighter, swashbuckler, fighterDoc, swashbucklerDoc],
      classGrantedFeatures: new Map([
        ["class/fighter", sharedGrant],
        ["class/swashbuckler", sharedGrant],
      ]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });

    const fighterOut = result.entities.find((e) => e.id === "class/fighter");
    const swashbucklerOut = result.entities.find((e) => e.id === "class/swashbuckler");
    const fighterTarget =
      fighterOut?.stats?.kind === "class" ? fighterOut.stats.grantedFeatures?.[0]?.targetId : "?";
    const swashbucklerTarget =
      swashbucklerOut?.stats?.kind === "class"
        ? swashbucklerOut.stats.grantedFeatures?.[0]?.targetId
        : "?";

    expect(fighterTarget).toBe("class-feature/weapon-specialization");
    // THE bug this proves fixed: pre-D29-132, `keptIds.has(resolvedId)` alone
    // would make this ALSO "class-feature/weapon-specialization" (fighter's
    // doc) — wrong-class prose on the swashbuckler page.
    expect(swashbucklerTarget).toBe("class-feature/weapon-specialization-2");
    expect(swashbucklerTarget).not.toBe(fighterTarget);
  });

  it("rule (2) legacyOf fallback: fires only when NO family member's masthead names the granting class", () => {
    const swashbuckler = classEntity({
      id: "class/swashbuckler",
      slug: "swashbuckler",
      name: "Swashbuckler",
    });
    // Neither doc carries a masthead at all — rule (1) can't fire for either.
    const fighterDoc = classFeature({
      id: "class-feature/weapon-specialization",
      name: "Weapon Specialization",
      legacyOf: ["class/fighter@legacy"],
    });
    const swashbucklerDoc = classFeature({
      id: "class-feature/weapon-specialization-2",
      name: "Weapon Specialization",
      legacyOf: ["class/swashbuckler@legacy"],
    });
    const { result } = run({
      entities: [swashbuckler, fighterDoc, swashbucklerDoc],
      classGrantedFeatures: new Map([["class/swashbuckler", sharedGrant]]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });
    const out = result.entities.find((e) => e.id === "class/swashbuckler");
    const targetId = out?.stats?.kind === "class" ? out.stats.grantedFeatures?.[0]?.targetId : "?";
    expect(targetId).toBe("class-feature/weapon-specialization-2");
  });

  it("rule (3) unique level match: fires only when NEITHER masthead NOR legacyOf disambiguates, and exactly one family member's level matches the grant's level", () => {
    const swashbuckler = classEntity({
      id: "class/swashbuckler",
      slug: "swashbuckler",
      name: "Swashbuckler",
    });
    const levelSeven = classFeature({
      id: "class-feature/weapon-specialization",
      name: "Weapon Specialization",
      level: 7,
    });
    const levelNine = classFeature({
      id: "class-feature/weapon-specialization-2",
      name: "Weapon Specialization",
      level: 9,
    });
    const { result } = run({
      entities: [swashbuckler, levelSeven, levelNine],
      classGrantedFeatures: new Map([
        ["class/swashbuckler", [{ level: 9, name: "Weapon Specialization", uuid: SHARED_UUID }]],
      ]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });
    const out = result.entities.find((e) => e.id === "class/swashbuckler");
    const targetId = out?.stats?.kind === "class" ? out.stats.grantedFeatures?.[0]?.targetId : "?";
    expect(targetId).toBe("class-feature/weapon-specialization-2");
  });

  it("no rule resolves a single candidate -> null (R3, NEVER a wrong-class card)", () => {
    // guardian also maps to [] (no subclass categories) — and its masthead
    // never appears in either candidate below, so NEITHER rule (1) NOR
    // rule (2) fires; both candidates share the SAME level, so rule (3)'s
    // uniqueness test also fails.
    const guardian = classEntity({ id: "class/guardian", slug: "guardian", name: "Guardian" });
    const docA = classFeature({
      id: "class-feature/weapon-specialization",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Fighter"),
      level: 7,
    });
    const docB = classFeature({
      id: "class-feature/weapon-specialization-2",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Swashbuckler"),
      level: 7,
    });
    const { result } = run({
      entities: [guardian, docA, docB],
      classGrantedFeatures: new Map([["class/guardian", sharedGrant]]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });
    const out = result.entities.find((e) => e.id === "class/guardian");
    const stats = out?.stats?.kind === "class" ? out.stats : undefined;
    expect(stats?.grantedFeatures).toEqual([
      { level: 7, name: "Weapon Specialization", targetId: null },
    ]);
    expect(result.grantedFeaturesUnresolved).toBeGreaterThanOrEqual(1);
  });

  it("tie-break (a): when rule (1) matches MULTIPLE candidates (a legacy+remaster pair both mastheading the granting class), the edition matching the granting class doc wins", () => {
    const fighter = classEntity({
      id: "class/fighter",
      slug: "fighter",
      name: "Fighter",
      edition: "remaster",
    });
    const remasterDoc = classFeature({
      id: "class-feature/weapon-specialization",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Fighter"),
      edition: "remaster",
    });
    const legacyDoc = classFeature({
      id: "class-feature/weapon-specialization-2",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Fighter"),
      edition: "legacy",
    });
    const { result } = run({
      entities: [fighter, remasterDoc, legacyDoc],
      classGrantedFeatures: new Map([["class/fighter", sharedGrant]]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    const targetId = out?.stats?.kind === "class" ? out.stats.grantedFeatures?.[0]?.targetId : "?";
    expect(targetId).toBe("class-feature/weapon-specialization");
  });

  it("tie-break (b): when rule (1) matches multiple SAME-edition candidates, the lowest collision suffix wins", () => {
    const fighter = classEntity({
      id: "class/fighter",
      slug: "fighter",
      name: "Fighter",
      edition: "remaster",
    });
    const suffix2 = classFeature({
      id: "class-feature/weapon-specialization-2",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Fighter"),
      edition: "remaster",
    });
    const suffix3 = classFeature({
      id: "class-feature/weapon-specialization-3",
      name: "Weapon Specialization",
      mastheadExtra: mastheadClass("Fighter"),
      edition: "remaster",
    });
    const { result } = run({
      entities: [fighter, suffix2, suffix3],
      classGrantedFeatures: new Map([["class/fighter", sharedGrant]]),
      resolveUuid: resolverFrom({ [SHARED_UUID]: SHARED_RESOLUTION }),
    });
    const out = result.entities.find((e) => e.id === "class/fighter");
    const targetId = out?.stats?.kind === "class" ? out.stats.grantedFeatures?.[0]?.targetId : "?";
    expect(targetId).toBe("class-feature/weapon-specialization-2");
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
