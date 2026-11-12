// The builder gives each class the first options of its shortlists. These tests move other
// options to the front (the way Josh would by reordering content/classes.ts) to keep every
// option's code path in the engine covered.

import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { CONTENT } from "./content";
import { buildCharacter } from "./engine";
import { withShortlist } from "./testShortlist";

const DONE = { name: "Test", look: "Plain.", personality: "Calm." };

const FIGHTER: Answers = {
  archetype: "warrior",
  classId: "fighter",
  speciesId: "human",
  backgroundId: "soldier",
  ...DONE,
};

describe("options the shipped shortlists don't pick first", () => {
  it("builds every class with each of its options moved to the front", () => {
    for (const cls of Object.values(CONTENT.classes)) {
      for (const g of cls.optionGroups) {
        for (const id of g.choices.slice()) {
          const c = withShortlist(cls.id, { [g.key]: [id] }, () =>
            buildCharacter({
              archetype: cls.archetype,
              classId: cls.id,
              speciesId: "human",
              backgroundId: cls.backgrounds[0],
              ...DONE,
            }),
          );
          expect(c.missing, `${cls.id} ${id}`).toEqual([]);
        }
      }
    }
  });

  it("Protector and Warden train armor the Cleric and Druid lack", () => {
    const protector = withShortlist("cleric", { divineOrder: ["protector"] }, () =>
      buildCharacter({
        archetype: "healer",
        classId: "cleric",
        speciesId: "human",
        backgroundId: "acolyte",
        ...DONE,
      }),
    );
    expect(protector.proficiencies.armor).toContain("Heavy armor (Protector)");
    const warden = withShortlist("druid", { primalOrder: ["warden"] }, () =>
      buildCharacter({
        archetype: "mage",
        classId: "druid",
        speciesId: "human",
        backgroundId: "hermit",
        ...DONE,
      }),
    );
    expect(warden.proficiencies.armor).toContain("Medium armor (Warden)");
  });

  it("a fighting style shows in the attack notes", () => {
    const notes = (classId: "fighter" | "ranger", style: string) =>
      withShortlist(classId, { fightingStyle: [style] }, () =>
        buildCharacter({
          ...FIGHTER,
          archetype: CONTENT.classes[classId].archetype,
          classId,
          backgroundId: CONTENT.classes[classId].backgrounds[0],
        }).attacks.flatMap((a) => a.notes),
      ).join(" ");
    expect(notes("ranger", "two-weapon-fighting")).toContain("Two-Weapon Fighting");
    expect(notes("fighter", "thrown-weapon-fighting")).toContain("Thrown Weapon Fighting");
    expect(notes("fighter", "great-weapon-fighting")).toContain("Great Weapon Fighting");
    expect(notes("fighter", "defense")).not.toContain("Fighting");
  });

  it("Dueling's rivals leave the damage alone: Protection and Blessed Warrior", () => {
    const damage = (style: string) =>
      withShortlist("paladin", { fightingStyle: [style] }, () =>
        buildCharacter({
          archetype: "healer",
          classId: "paladin",
          speciesId: "human",
          backgroundId: "noble",
          ...DONE,
        }).attacks.map((a) => a.notes.join(" ")),
      );
    expect(damage("dueling").join(" ")).toContain("Dueling");
    expect(damage("protection").join(" ")).not.toContain("Dueling");
    expect(damage("blessed-warrior").join(" ")).not.toContain("Dueling");
  });
});
