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

describe("assembleFoundryEntity: license/edition fallback when publication is missing (D29-13)", () => {
  it("reports missingPublication and defaults to license unknown / edition legacy", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const entity = assembleFoundryEntity({
      packDir: "iconics",
      docClass: "Actor",
      basename: "amiri-level-1",
      doc: {
        _id: "iconicID000001",
        name: "Amiri, Level 1",
        type: "character",
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
