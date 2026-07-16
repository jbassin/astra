import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { EnricherContext, UuidResolution } from "./enrichers";
import { type RawFoundryDoc, assembleFoundryEntity } from "./foundryEntities";
import { parseFoundryHtml } from "./foundryHtml";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "fixtures");

const langSubset = JSON.parse(readFileSync(join(FIXTURES, "lang-subset.json"), "utf8")) as {
  en: Record<string, string>;
};

/** Permissive stub ctx (never fails resolution) — this module tests entity
 * ASSEMBLY, not enricher/uuid resolution correctness (covered in
 * `enrichers.test.ts`/`uuidResolve.test.ts`). */
function makeCtx(): EnricherContext {
  const ctx: EnricherContext = {
    resolveUuid: (uuid: string): UuidResolution => ({ kind: "crossref", id: uuid, display: uuid }),
    localize: new Map(Object.entries(langSubset.en)),
    report: () => undefined,
    parseBlockHtml: (html: string) => parseFoundryHtml(html, ctx),
  };
  return ctx;
}

describe("assembleFoundryEntity: real fixture — Balor (Actor, npc, embedded items)", () => {
  const balor = JSON.parse(
    readFileSync(join(FIXTURES, "foundry", "balor.json"), "utf8"),
  ) as RawFoundryDoc;

  it("assembles the creature entity with facets from system.details.publication (D29-13)", () => {
    const seenIds = new Set<string>();
    const reports: Array<{ cls: string; detail: string }> = [];
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "balor",
      doc: balor,
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds,
    });

    expect(entity).toBeDefined();
    expect(entity?.id).toBe("creature/balor");
    expect(entity?.category).toBe("creature");
    expect(entity?.name).toBe("Balor");
    expect(entity?.edition).toBe("legacy"); // remaster: false
    expect(entity?.source).toEqual({ book: "Pathfinder Bestiary", license: "OGL" });
    expect(entity?.level).toBe(20);
    expect(entity?.traits).toEqual(["chaotic", "demon", "evil", "fiend", "unholy"]);
    expect(entity?.rarity).toBe("common");
    expect(entity?.facets.hp).toBe(480);
    expect(entity?.facets.ac).toBe(45);
    expect(entity?.facets.fortitudeSave).toBe(39);
    expect(entity?.facets.reflexSave).toBe(35);
    expect(entity?.facets.willSave).toBe(34);
    expect(entity?.facets.perception).toBe(36);
    expect(entity?.facets.size).toBe("lg");
    expect(reports).toEqual([]); // no report-worthy residue on this fixture
  });

  it("carries every embedded item, typed (no raw system JSON leak, S2 widening)", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "balor",
      doc: balor,
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });

    expect(entity?.embeddedItems).toHaveLength(24);
    const decree = entity?.embeddedItems?.find((i) => i.name === "Divine Decree");
    expect(decree).toMatchObject({
      slug: "divine-decree",
      type: "spell",
      level: 7,
      traits: ["concentrate", "manipulate", "sanctified"],
    });
    expect(decree?.body.length).toBeGreaterThan(0);
    // A passive ability (actionType "passive", actions.value null) resolves no
    // actionCost token — distinct from an "action" or "reaction" typed one.
    const telepathy = entity?.embeddedItems?.find((i) => i.name === "Telepathy 100 feet");
    expect(telepathy?.actionCost).toBe("passive");
    const dispellingStrike = entity?.embeddedItems?.find((i) => i.name === "Dispelling Strike");
    expect(dispellingStrike?.actionCost).toBe("free");
  });

  it("D29-20 (P1.6): extracts CreatureStats — speeds/abilityMods/senses/languages/immunities/weaknesses/skills; null resistances OMITTED", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "balor",
      doc: balor,
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });

    expect(entity?.stats?.kind).toBe("creature");
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.speeds).toEqual({ base: 35, other: [{ type: "fly", value: 70 }] });
    expect(stats?.abilityMods).toEqual({ str: 9, dex: 7, con: 9, int: 6, wis: 6, cha: 8 });
    expect(stats?.senses).toEqual({ mod: 36, list: [{ type: "darkvision" }] });
    expect(stats?.languages).toEqual(["chthonian", "draconic", "empyrean"]);
    expect(stats?.immunities).toEqual(["fire"]);
    // Balor's raw `system.attributes.resistances` is a literal JSON `null` —
    // the field must be OMITTED, never a null/empty passthrough (the S4
    // emit-gate `present()` lesson applied to stats).
    expect(stats?.resistances).toBeUndefined();
    expect(stats?.weaknesses).toEqual([
      { type: "cold", value: 20 },
      { type: "cold-iron", value: 20 },
      { type: "holy", value: 20 },
    ]);
    expect(stats?.skills).toMatchObject({ athletics: 37, intimidation: 38, stealth: 33 });
  });

  it("D29-20 (P1.6): melee strike items carry attackBonus + flattened damage; spellcastingEntry carries dc/attack/tradition", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "balor",
      doc: balor,
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });

    const longsword = entity?.embeddedItems?.find(
      (i) => i.name === "Vorpal Cold Iron Silver Longsword",
    );
    expect(longsword?.type).toBe("melee");
    expect(longsword?.attackBonus).toBe(40);
    expect(longsword?.damage).toEqual(["4d8+17 slashing"]);

    const spellcasting = entity?.embeddedItems?.find((i) => i.name === "Divine Innate Spells");
    expect(spellcasting?.type).toBe("spellcastingEntry");
    expect(spellcasting?.dc).toBe(44);
    expect(spellcasting?.attack).toBe(36);
    expect(spellcasting?.tradition).toBe("divine");

    // Non-strike/non-spellcasting items gain NONE of the new fields.
    const decree = entity?.embeddedItems?.find((i) => i.name === "Divine Decree");
    expect(decree?.attackBonus).toBeUndefined();
    expect(decree?.damage).toBeUndefined();
    expect(decree?.dc).toBeUndefined();
    expect(decree?.tradition).toBeUndefined();
  });
});

describe("assembleFoundryEntity: D29-73 (P7 S1) strike range extraction", () => {
  /** A minimal npc Actor carrying one `melee`-typed embedded item whose raw
   * `system.range` is overridden per test. */
  function creatureDoc(items: RawFoundryDoc[]): RawFoundryDoc {
    return {
      _id: "npcID00000001",
      name: "Test Creature",
      type: "npc",
      system: {
        details: { publication: { license: "OGL", remaster: false, title: "Core Rulebook" } },
      },
      items,
    };
  }

  function meleeItem(
    name: string,
    range: { increment?: number | null; max?: number | null },
  ): RawFoundryDoc {
    return {
      _id: "meleeID0000001",
      name,
      type: "melee",
      system: { range },
    };
  }

  it('max-only range formats as AoN-style "range {max} feet" (abberton-ruffian\'s Thrown Bottle shape: increment null, max 10)', () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([meleeItem("Thrown Bottle", { increment: null, max: 10 })]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const item = entity?.embeddedItems?.find((i) => i.name === "Thrown Bottle");
    expect(item?.range).toBe("range 10 feet");
  });

  it('increment-only range formats as "range increment {increment} feet" (ailuran\'s Boomerang shape: increment 20, max null)', () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([meleeItem("Boomerang", { increment: 20, max: null })]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const item = entity?.embeddedItems?.find((i) => i.name === "Boomerang");
    expect(item?.range).toBe("range increment 20 feet");
  });

  it("SYNTHETIC ONLY (0/12,942 real melee items carry both): increment wins when both increment and max are set", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([meleeItem("Both-Set Thrower", { increment: 30, max: 60 })]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const item = entity?.embeddedItems?.find((i) => i.name === "Both-Set Thrower");
    expect(item?.range).toBe("range increment 30 feet");
  });

  it("a melee item with no system.range at all gets no range field (most melee weapons — thrown-N traits cover that case separately)", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([
        {
          _id: "meleeID0000002",
          name: "Dagger",
          type: "melee",
          system: { traits: { value: ["agile", "thrown-10", "versatile-s"] } },
        },
      ]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const dagger = entity?.embeddedItems?.find((i) => i.name === "Dagger");
    expect(dagger?.range).toBeUndefined();
    expect(dagger?.traits).toContain("thrown-10"); // trait-encoded range is unchanged
  });

  it("a non-melee embedded item (e.g. a spell, which has its own unrelated system.range.value shape) never gains a range field", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([
        {
          _id: "spellID0000002",
          name: "Fireball",
          type: "spell",
          system: { range: { value: "500 feet" } },
        },
      ]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const spell = entity?.embeddedItems?.find((i) => i.name === "Fireball");
    expect(spell?.range).toBeUndefined();
  });
});

describe("assembleFoundryEntity: D29-74 (P7 S1) lore-skill merge into stats.skills", () => {
  function creatureDoc(
    items: RawFoundryDoc[],
    skills?: Record<string, { base?: number }>,
  ): RawFoundryDoc {
    return {
      _id: "npcID00000002",
      name: "Test Creature",
      type: "npc",
      system: {
        details: { publication: { license: "OGL", remaster: false, title: "Core Rulebook" } },
        ...(skills ? { skills } : {}),
      },
      items,
    };
  }

  function loreItem(name: string, mod: number | null | undefined): RawFoundryDoc {
    return {
      _id: `loreID${name}`,
      name,
      type: "lore",
      system: { mod: { value: mod ?? undefined } },
    };
  }

  it('abberton-ruffian shape: Gambling Lore (mod 1) merges into stats.skills["gambling-lore"]', () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([loreItem("Gambling Lore", 1)]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.skills).toEqual({ "gambling-lore": 1 });
  });

  it('ailuran shape: Silver Lore (mod 13) merges into stats.skills["silver-lore"] alongside a real core skill', () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([loreItem("Silver Lore", 13)], { stealth: { base: 12 } }),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.skills).toEqual({ stealth: 12, "silver-lore": 13 });
  });

  it("guards a lore slug that collides with a real core skill — the core value wins, collision is reported (loreSkillCoreCollision)", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    // Sluggify("Stealth") === "stealth" — a lore item improbably named
    // exactly like a core skill collides with it.
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([loreItem("Stealth", 99)], { stealth: { base: 12 } }),
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.skills).toEqual({ stealth: 12 }); // the real core value survives, unclobbered
    expect(reports.some((r) => r.cls === "loreSkillCoreCollision")).toBe(true);
  });

  it("logs (not silently merges) a same-slug DUPLICATE lore item on one actor — last-write-wins (loreSkillDuplicateSlug)", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([loreItem("Abyss Lore", 5), loreItem("Abyss Lore", 9)]),
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.skills).toEqual({ "abyss-lore": 9 }); // last (2nd) write wins
    expect(reports.some((r) => r.cls === "loreSkillDuplicateSlug")).toBe(true);
  });

  it("a creature with lore items but no core skills at all still gets stats.skills (never returns undefined once a lore mod is present)", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([loreItem("Academia Lore", 8)]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.stats?.kind).toBe("creature");
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.skills).toEqual({ "academia-lore": 8 });
  });

  it("a lore item with no system.mod.value at all contributes nothing (present() guard, same S4 emit-gate convention)", () => {
    const entity = assembleFoundryEntity({
      packDir: "pathfinder-bestiary",
      docClass: "Actor",
      basename: "test-creature",
      doc: creatureDoc([loreItem("Undefined Lore", undefined)]),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    const stats = entity?.stats?.kind === "creature" ? entity.stats : undefined;
    expect(stats?.skills).toBeUndefined();
  });

  it("a hazard's lore items never merge — HazardStatsSchema has no skills field, and no crash occurs (D29-74 hazard guard)", () => {
    const entity = assembleFoundryEntity({
      packDir: "hazards",
      docClass: "Actor",
      basename: "test-hazard",
      doc: {
        _id: "hazID00000002",
        name: "Test Hazard With Lore",
        type: "hazard",
        system: {
          details: { publication: { license: "OGL", remaster: false, title: "Core Rulebook" } },
          attributes: { hardness: 10 },
        },
        items: [loreItem("Trap Lore", 4)],
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.stats?.kind).toBe("hazard");
    const stats = entity?.stats?.kind === "hazard" ? entity.stats : undefined;
    expect(stats).not.toHaveProperty("skills");
  });
});

describe("assembleFoundryEntity: D29-20 (P1.6) HazardStats extraction", () => {
  function hazardDoc(): RawFoundryDoc {
    return {
      _id: "hazID000000001",
      name: "Test Complex Trap",
      type: "hazard",
      system: {
        details: {
          publication: { license: "OGL", remaster: false, title: "Core Rulebook" },
          level: { value: 5 },
          isComplex: true,
          disable: "<p>Thievery DC 24 to disrupt the trigger.</p>",
          routine: "<p>(1 action) The trap deals damage.</p>",
          reset: "",
        },
        attributes: {
          ac: { value: 20 },
          hp: { max: 60 },
          hardness: 12,
          stealth: { value: 14, details: "" },
        },
        saves: {
          fortitude: { value: 15 },
          reflex: { value: 8 },
          will: { value: 14 },
        },
      },
    };
  }

  it("extracts hardness/stealth/isComplex + disable/routine as BlockNode[]; empty reset OMITTED", () => {
    const entity = assembleFoundryEntity({
      packDir: "hazards",
      docClass: "Actor",
      basename: "test-complex-trap",
      doc: hazardDoc(),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });

    expect(entity?.category).toBe("hazard");
    expect(entity?.stats?.kind).toBe("hazard");
    const stats = entity?.stats?.kind === "hazard" ? entity.stats : undefined;
    expect(stats?.hardness).toBe(12);
    expect(stats?.stealth).toEqual({ value: 14 }); // empty details string omitted
    expect(stats?.isComplex).toBe(true);
    expect(stats?.disable).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "text",
            content: "Thievery DC 24 to disrupt the trigger.",
            marks: { bold: false, italic: false, superscript: false },
          },
        ],
      },
    ]);
    expect(stats?.routine?.length).toBe(1);
    expect(stats?.reset).toBeUndefined(); // empty string in source -> omitted
  });

  it("hazards keep the creature-style named facets (ac/hp/saves) — no longer generic-catchall-only", () => {
    const entity = assembleFoundryEntity({
      packDir: "hazards",
      docClass: "Actor",
      basename: "test-complex-trap",
      doc: hazardDoc(),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.facets).toMatchObject({
      ac: 20,
      hp: 60,
      fortitudeSave: 15,
      reflexSave: 8,
      willSave: 14,
    });
  });

  it("fail-soft: a malformed enricher inside disable/routine/reset omits THAT field + reports hazardStatsHtmlFailed (the historys-repetition upstream-typo class)", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const doc = hazardDoc();
    // The real pfs-season-6 typo shape: an unterminated @Check[... (missing ]).
    if (doc.system?.details) {
      doc.system.details.disable =
        "<p>@Check[thievery|dc:28 (expert) to pick apart the pebbles</p>";
    }
    const entity = assembleFoundryEntity({
      packDir: "hazards",
      docClass: "Actor",
      basename: "test-complex-trap",
      doc,
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    const stats = entity?.stats?.kind === "hazard" ? entity.stats : undefined;
    expect(stats?.disable).toBeUndefined(); // the broken field is omitted...
    expect(stats?.routine?.length).toBe(1); // ...the healthy sibling fields survive
    expect(stats?.isComplex).toBe(true);
    expect(reports.some((r) => r.cls === "hazardStatsHtmlFailed")).toBe(true);
  });

  it("a non-Actor category never gains stats (spell etc.)", () => {
    const entity = assembleFoundryEntity({
      packDir: "spells",
      docClass: "Item",
      basename: "fireball",
      doc: {
        _id: "spellID0000001",
        name: "Fireball",
        type: "spell",
        system: {
          publication: { license: "ORC", remaster: true, title: "Player Core" },
        },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.stats).toBeUndefined();
  });
});

describe("assembleFoundryEntity: equipment fans to weapon/armor/shield per doc type (D29-7)", () => {
  function weaponDoc(overrides: Partial<RawFoundryDoc> = {}): RawFoundryDoc {
    return {
      _id: "wpnID0000000001",
      name: "Longsword",
      type: "weapon",
      system: {
        description: { value: "<p>A one-handed slashing sword.</p>" },
        publication: { license: "OGL", remaster: false, title: "Pathfinder Core Rulebook" },
        traits: { rarity: "common", value: ["versatile-p"] },
        level: { value: 0 },
        price: { value: { gp: 1 } },
        bulk: { value: 1 },
        usage: { value: "held-in-one-hand" },
        category: "martial",
      },
      ...overrides,
    };
  }

  it("maps a weapon doc to category weapon with equipment-family facets", () => {
    const entity = assembleFoundryEntity({
      packDir: "equipment",
      docClass: "Item",
      basename: "longsword",
      doc: weaponDoc(),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("weapon");
    expect(entity?.facets).toMatchObject({
      price: "1 gp",
      bulk: 1,
      usage: "held-in-one-hand",
      itemCategory: "martial",
    });
  });

  it("folds a consumable doc into the equipment category", () => {
    const entity = assembleFoundryEntity({
      packDir: "equipment",
      docClass: "Item",
      basename: "minor-elixir-of-life",
      doc: weaponDoc({
        name: "Minor Elixir of Life",
        type: "consumable",
        system: {
          description: { value: "<p>A vial of restorative liquid.</p>" },
          publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core" },
          traits: { rarity: "common", value: ["consumable", "elixir"] },
          level: { value: 1 },
          price: { per: 1, value: { gp: 4 } },
        },
      }),
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("equipment");
    expect(entity?.edition).toBe("remaster");
    expect(entity?.source).toEqual({ book: "Pathfinder Player Core", license: "ORC" });
    expect(entity?.facets.price).toBe("4 gp");
  });
});

describe("assembleFoundryEntity: D29-19 npc-only creature import (P1.6)", () => {
  it("EXCLUDES a character-typed Actor (iconics pregen) and reports excludedActors", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const entity = assembleFoundryEntity({
      packDir: "iconics",
      docClass: "Actor",
      basename: "amiri-level-1",
      doc: {
        _id: "iconicID000001",
        name: "Amiri (Level 1)",
        type: "character",
        system: {},
      },
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    expect(entity).toBeUndefined();
    expect(reports).toContainEqual({
      cls: "excludedActors",
      detail: 'iconics/amiri-level-1.json: "Amiri (Level 1)"',
    });
    // No other residue for an excluded doc — assembly never ran.
    expect(reports).toHaveLength(1);
  });

  it("still assembles an npc-typed Actor in the same packs (the D29-19 narrowing is character-only)", () => {
    const entity = assembleFoundryEntity({
      packDir: "kingmaker-bestiary",
      docClass: "Actor",
      basename: "some-npc",
      doc: {
        _id: "npcID000000001",
        name: "Some Npc",
        type: "npc",
        system: {
          details: {
            publication: { license: "OGL", remaster: false, title: "Kingmaker" },
          },
        },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("creature");
  });

  it("does NOT exclude a character-typed doc in an Item pack context (Actor-classed only)", () => {
    // Defensive: no Item pack carries type "character" in the real snapshot —
    // the guard is scoped to docClass === "Actor" so a hypothetical Item-side
    // name collision on the type string can never be silently swallowed (it
    // would hard-fail in categoryMap instead, the correct drift signal).
    expect(() =>
      assembleFoundryEntity({
        packDir: "spells",
        docClass: "Item",
        basename: "weird",
        doc: { _id: "x1", name: "Weird", type: "character", system: {} },
        ctx: makeCtx(),
        report: () => undefined,
        seenIds: new Set(),
      }),
    ).toThrow(); // CategoryMapError, not a silent exclusion
  });
});

describe("assembleFoundryEntity: license/edition fallback when publication is missing (D29-13)", () => {
  it("reports missingPublication and defaults to license unknown / edition legacy", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const entity = assembleFoundryEntity({
      packDir: "npc-gallery",
      docClass: "Actor",
      basename: "publicationless-npc",
      doc: {
        _id: "npcID000000002",
        name: "Publicationless Npc",
        type: "npc",
        system: {},
      },
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    expect(entity?.source).toEqual({ book: "unknown", license: "unknown" });
    expect(entity?.edition).toBe("legacy");
    expect(reports.some((r) => r.cls === "missingPublication")).toBe(true);
  });

  it("reports unknownLicense when the raw license value isn't ORC/OGL", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    assembleFoundryEntity({
      packDir: "equipment",
      docClass: "Item",
      basename: "weird-item",
      doc: {
        _id: "weirdID0000001",
        name: "Weird Item",
        type: "equipment",
        system: { publication: { license: "CC-BY", remaster: false, title: "Some Zine" } },
      },
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    expect(reports).toContainEqual({ cls: "unknownLicense", detail: "CC-BY" });
  });
});

describe("assembleFoundryEntity: slug mismatch + collision reporting (S2 scope: no legacy suffix yet)", () => {
  it("reports a slugMismatch when the file basename disagrees with sluggify(name)", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    assembleFoundryEntity({
      packDir: "spells",
      docClass: "Item",
      basename: "wrong-basename",
      doc: {
        _id: "spellID00000001",
        name: "Fireball",
        type: "spell",
        system: {
          publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core" },
        },
      },
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds: new Set(),
    });
    expect(reports.some((r) => r.cls === "slugMismatch")).toBe(true);
  });

  it("reports a slugCollision for two docs resolving to the same id, keeping both distinct in-memory (S4's worklist)", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const seenIds = new Set<string>();
    const doc = (name: string, id: string): RawFoundryDoc => ({
      _id: id,
      name,
      type: "feat",
      system: { publication: { license: "OGL", remaster: false, title: "Some Book" } },
    });
    const first = assembleFoundryEntity({
      packDir: "feats",
      docClass: "Item",
      basename: "duplicate-name",
      doc: doc("Duplicate Name", "id1"),
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds,
    });
    const second = assembleFoundryEntity({
      packDir: "feats",
      docClass: "Item",
      basename: "duplicate-name",
      doc: doc("Duplicate Name", "id2"),
      ctx: makeCtx(),
      report: (cls, detail) => reports.push({ cls, detail }),
      seenIds,
    });
    expect(first?.id).toBe("feat/duplicate-name");
    expect(second?.id).toBe("feat/duplicate-name");
    expect(reports).toContainEqual({ cls: "slugCollision", detail: "feat/duplicate-name" });
  });
});

describe("assembleFoundryEntity: excluded pack/type returns undefined", () => {
  it("returns undefined for a doc in an excluded pack", () => {
    const entity = assembleFoundryEntity({
      packDir: "feat-effects",
      docClass: "Item",
      basename: "effect-something",
      doc: { _id: "eff1", name: "Effect: Something", type: "effect", system: {} },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity).toBeUndefined();
  });
});

describe("assembleFoundryEntity: P3 S1 (D29-33a) — the 5 extractor-gap categories", () => {
  it("ancestry: extracts hp/size/speed off the bare system.hp/size/speed fields (verified on Tengu)", () => {
    const entity = assembleFoundryEntity({
      packDir: "ancestries",
      docClass: "Item",
      basename: "tengu",
      doc: {
        _id: "ancID0000000001",
        name: "Tengu",
        type: "ancestry",
        system: {
          description: { value: "<p>Survivalists.</p>" },
          publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core 2" },
          traits: { rarity: "uncommon", value: ["humanoid", "tengu"] },
          hp: 6,
          size: "med",
          speed: 25,
        },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("ancestry");
    expect(entity?.facets).toEqual({ hp: 6, size: "med", speed: 25 });
  });

  it("ancestry: omits hp/size/speed when the doc has none of them (proseOnly-shaped Foundry doc)", () => {
    const entity = assembleFoundryEntity({
      packDir: "ancestries",
      docClass: "Item",
      basename: "bare",
      doc: {
        _id: "ancID0000000002",
        name: "Bare Ancestry",
        type: "ancestry",
        system: { description: { value: "" } },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.facets).toEqual({});
  });

  it("class: extracts hp + keyAbility.value off system.hp/keyAbility (verified on Swashbuckler/Champion)", () => {
    const entity = assembleFoundryEntity({
      packDir: "classes",
      docClass: "Item",
      basename: "champion",
      doc: {
        _id: "clsID0000000001",
        name: "Champion",
        type: "class",
        system: {
          description: { value: "<p>A holy warrior.</p>" },
          publication: { license: "ORC", remaster: true, title: "Pathfinder Player Core" },
          hp: 10,
          keyAbility: { value: ["dex", "str"] },
        },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("class");
    expect(entity?.facets).toEqual({ hp: 10, keyAbility: ["dex", "str"] });
  });

  it("class: keeps an empty keyAbility.value array (present, not non-empty — Psychic's real shape)", () => {
    const entity = assembleFoundryEntity({
      packDir: "classes",
      docClass: "Item",
      basename: "psychic",
      doc: {
        _id: "clsID0000000002",
        name: "Psychic",
        type: "class",
        system: { description: { value: "" }, hp: 6, keyAbility: { value: [] } },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.facets).toEqual({ hp: 6, keyAbility: [] });
  });

  it("background: extracts trainedSkills.value only (not the free-text .lore skill name)", () => {
    const entity = assembleFoundryEntity({
      packDir: "backgrounds",
      docClass: "Item",
      basename: "acolyte",
      doc: {
        _id: "bgID00000000001",
        name: "Acolyte",
        type: "background",
        system: {
          description: { value: "" },
          trainedSkills: { lore: ["Scribing Lore"], value: ["religion"] },
        },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("background");
    expect(entity?.facets).toEqual({ trainedSkills: ["religion"] });
  });

  it("condition: extracts valued from system.value.isValued (true for a numeric condition)", () => {
    const entity = assembleFoundryEntity({
      packDir: "conditions",
      docClass: "Item",
      basename: "clumsy",
      doc: {
        _id: "conID0000000001",
        name: "Clumsy",
        type: "condition",
        system: { description: { value: "" }, value: { isValued: true, value: 1 } },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("condition");
    expect(entity?.facets).toEqual({ valued: true });
  });

  it("condition: extracts valued: false for a flat-flag condition (e.g. Controlled)", () => {
    const entity = assembleFoundryEntity({
      packDir: "conditions",
      docClass: "Item",
      basename: "controlled",
      doc: {
        _id: "conID0000000002",
        name: "Controlled",
        type: "condition",
        system: { description: { value: "" }, value: { isValued: false, value: null } },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.facets).toEqual({ valued: false });
  });

  it("heritage: extracts ancestrySlug off system.ancestry.slug (verified on Thickskin Tripkee)", () => {
    const entity = assembleFoundryEntity({
      packDir: "heritages",
      docClass: "Item",
      basename: "thickskin-tripkee",
      doc: {
        _id: "herID0000000001",
        name: "Thickskin Tripkee",
        type: "heritage",
        system: {
          description: { value: "" },
          ancestry: { name: "Tripkee", slug: "tripkee", uuid: "Compendium.pf2e.ancestries.Item.x" },
        },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("heritage");
    expect(entity?.facets).toEqual({ ancestrySlug: "tripkee" });
  });

  it("gap extraction is category-gated: a bare system.hp on a non-ancestry/class doc is NOT promoted to a facet", () => {
    const entity = assembleFoundryEntity({
      packDir: "feats",
      docClass: "Item",
      basename: "some-feat",
      doc: {
        _id: "featID000000001",
        name: "Some Feat",
        type: "feat",
        // `hp` here is deliberately synthetic/nonsensical for a feat doc — this
        // proves the category gate, not a real Foundry shape.
        system: { description: { value: "" }, level: { value: 1 }, hp: 999 },
      },
      ctx: makeCtx(),
      report: () => undefined,
      seenIds: new Set(),
    });
    expect(entity?.category).toBe("feat");
    expect(entity?.facets).not.toHaveProperty("hp");
  });
});
