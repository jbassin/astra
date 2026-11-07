import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { buildCharacter } from "./engine";
import {
  attackRoll,
  featureSlot,
  firstSentence,
  goodAt,
  sheetCards,
  slotLine,
  spellGist,
  spellSlot,
  turnPlan,
} from "./sheet";

const DONE = { name: "Test", look: "Plain.", personality: "Calm." };

const FIGHTER: Answers = {
  archetype: "warrior",
  classId: "fighter",
  speciesId: "dwarf",
  backgroundId: "soldier",
  options: { fightingStyle: ["great-weapon-fighting"] },
  ...DONE,
};

const WIZARD: Answers = {
  archetype: "mage",
  classId: "wizard",
  speciesId: "human",
  backgroundId: "scribe",
  cantrips: ["fire-bolt", "mage-hand", "light"],
  spells: ["magic-missile", "shield", "sleep", "mage-armor", "detect-magic"],
  ...DONE,
};

describe("plain-language rolls", () => {
  it("writes a weapon attack as a d20 roll and a damage roll", () => {
    const c = buildCharacter(FIGHTER);
    const greatsword = c.attacks.find((a) => a.name === "Greatsword");
    expect(greatsword && attackRoll(greatsword)).toBe(
      "Roll a d20 + 5 to hit. On a hit, roll 2d6 + 3 Slashing damage.",
    );
  });

  it("writes a save cantrip as the target's save", () => {
    expect(
      attackRoll({
        name: "Sacred Flame",
        kind: "cantrip",
        save: { ability: "dex", dc: 13 },
        damage: "1d8",
        damageType: "Radiant",
        range: "60 feet",
        properties: [],
        notes: [],
      }),
    ).toBe(
      "The target makes a Dexterity save against DC 13. If it fails, it takes 1d8 Radiant damage.",
    );
  });

  it("sorts features and spells by when they're used", () => {
    expect(featureSlot("As a bonus action, fly into a Rage.")).toBe("bonus");
    expect(featureSlot("Use your reaction and your shield.")).toBe("reaction");
    expect(featureSlot("Channel Divinity, as an action: point your holy symbol.")).toBe("action");
    expect(featureSlot("You have advantage on Dexterity saving throws.")).toBe("always");
    expect(spellSlot("1 reaction, which you take when you are hit")).toBe("reaction");
    expect(spellSlot("1 hour")).toBe("longer");
    expect(firstSentence("Action. Three darts fly. They hit.")).toBe("Action.");
    expect(spellGist("Bonus action. Curse a creature. It hurts.")).toBe("Curse a creature.");
    expect(spellGist("Reaction, when you take damage. Flames.")).toBe(
      "Reaction, when you take damage.",
    );
    expect(slotLine([2], 1)).toBe(
      "2 level 1 spell slots; they all come back after a Short or Long Rest.",
    );
  });
});

describe("the sheet's layout from buildCharacter", () => {
  it("puts a Fighter's Second Wind on the bonus action and makes a card per feature", () => {
    const c = buildCharacter(FIGHTER);
    const plan = turnPlan(c);
    expect(plan.bonus.map((i) => i.name)).toContain("Second Wind");
    expect(plan.action.map((i) => i.name)).toContain("Action Surge");
    expect(plan.actionSpells).toEqual([]);
    const cards = sheetCards(c);
    expect(cards.map((x) => x.name)).toEqual(c.features.map((f) => f.name));
    expect(goodAt(c).map((s) => s.name)).toEqual([
      "Athletics",
      "Perception",
      "Survival",
      "Intimidation",
    ]);
  });

  it("puts a Wizard's Shield on the reaction and gives every spell a card with its roll", () => {
    const c = buildCharacter(WIZARD);
    expect(c.missing).toEqual([]);
    const plan = turnPlan(c);
    expect(plan.reaction.map((i) => i.name)).toEqual(["Shield"]);
    expect(plan.actionSpells).toEqual(
      expect.arrayContaining(["Mage Hand", "Magic Missile", "Sleep"]),
    );
    expect(plan.actionSpells).not.toContain("Fire Bolt"); // an attack, listed with the attacks
    const cards = sheetCards(c);
    const sleep = cards.find((x) => x.name === "Sleep");
    expect(sleep).toMatchObject({
      kind: "Level 1 spell",
      when: "Your action",
      roll: "Targets make a Wisdom save against DC 13.",
      uses: "Spend a spell slot",
    });
    expect(cards.find((x) => x.name === "Fire Bolt")).toMatchObject({
      kind: "Cantrip",
      roll: "Roll a d20 + 5 to hit. On a hit, roll 1d10 Fire damage.",
      uses: "As often as you like",
    });
  });
});
