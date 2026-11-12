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
    expect(protector.proficiencies.armor).toContain("Heavy armor");
    const warden = withShortlist("druid", { primalOrder: ["warden"] }, () =>
      buildCharacter({
        archetype: "mage",
        classId: "druid",
        speciesId: "human",
        backgroundId: "hermit",
        ...DONE,
      }),
    );
    expect(warden.proficiencies.armor).toContain("Medium armor");
  });

  it("a fighting style's numbers go into the attack, with no note on where they came from", () => {
    const attacks = (classId: "fighter" | "ranger", style: string) =>
      withShortlist(classId, { fightingStyle: [style] }, () =>
        buildCharacter({
          ...FIGHTER,
          archetype: CONTENT.classes[classId].archetype,
          classId,
          backgroundId: CONTENT.classes[classId].backgrounds[0],
        }),
      ).attacks;
    const notes = (classId: "fighter" | "ranger", style: string) =>
      attacks(classId, style).flatMap((a) => a.notes);
    // Thrown Weapon Fighting adds 2 to a thrown weapon's damage, and the note says only the number.
    expect(notes("fighter", "thrown-weapon-fighting")).toContainEqual(
      expect.stringMatching(/^Thrown: 1d6 \+ \d+\.$/),
    );
    expect(notes("fighter", "defense").join(" ")).not.toContain("Thrown:");
    // The other styles leave no note: their cards say what they do.
    for (const [cls, style] of [
      ["ranger", "two-weapon-fighting"],
      ["fighter", "great-weapon-fighting"],
      ["ranger", "archery"],
    ] as const) {
      expect(notes(cls, style).join(" "), style).not.toMatch(/Fighting|Archery|Includes/);
    }
    // Archery adds 2 to the attack roll of a ranged weapon.
    const bow = (style: string) =>
      attacks("ranger", style).find((a) => a.properties.includes("Ammunition"))?.toHit;
    expect((bow("archery") ?? 0) - (bow("two-weapon-fighting") ?? 0)).toBe(2);
  });

  it("Dueling adds 2 to a one-handed Longsword, not to its two-handed damage", () => {
    const longsword = (style: string) => {
      const c = withShortlist("paladin", { fightingStyle: [style] }, () =>
        buildCharacter({
          archetype: "healer",
          classId: "paladin",
          speciesId: "human",
          backgroundId: "noble",
          ...DONE,
        }),
      );
      const a = c.attacks.find((x) => x.name.startsWith("Longsword"));
      if (!a) throw new Error("no Longsword");
      return a;
    };
    const dueling = longsword("dueling");
    const protection = longsword("protection");
    // Str 17: +3. One-handed 1d8 + 3, or 1d8 + 5 with Dueling; two-handed 1d10 + 3 either way.
    expect(protection.damage).toBe("1d8 + 3");
    expect(dueling.damage).toBe("1d8 + 5");
    expect(dueling.notes).toEqual(["Two-handed: 1d10 + 3."]);
    expect(protection.notes).toEqual(dueling.notes);
    expect(dueling.notes.join(" ")).not.toContain("Dueling");
  });
});
