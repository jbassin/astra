import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { CONTENT } from "./content";
import type { Activation } from "./contentTypes";
import { buildCharacter, type Character, spellEntry } from "./engine";
import {
  attackRoll,
  firstSentence,
  goodAt,
  sheetCards,
  slotLine,
  spellRoll,
  spellGist,
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

  it("shortens summaries and slot lines", () => {
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

const WARLOCK: Answers = {
  archetype: "mage",
  classId: "warlock",
  speciesId: "orc",
  backgroundId: "charlatan",
  options: { invocations: ["agonizing-blast", "armor-of-shadows", "pact-of-the-chain"] },
  cantrips: ["eldritch-blast", "prestidigitation"],
  spells: ["hex", "hellish-rebuke", "armor-of-agathys"],
  ...DONE,
};

const CASTER = { attackBonus: 5, saveDc: 13, modifier: 3 };

function rollOf(id: string): string | undefined {
  const s = CONTENT.spells[id];
  if (!s) throw new Error(`no spell ${id}`);
  return spellRoll(spellEntry(s, CASTER));
}

describe("spell rolls", () => {
  it("shows Hellish Rebuke's damage as well as its save", () => {
    // Cha 17 (+3): save DC 8 + 3 + 2 = 13.
    const c = buildCharacter(WARLOCK);
    expect(turnPlan(c).reaction.map((i) => i.name)).toEqual(["Hellish Rebuke"]);
    expect(sheetCards(c).find((x) => x.name === "Hellish Rebuke")).toMatchObject({
      when: "Your reaction",
      roll: "Targets make a Dexterity save against DC 13. On a failure, roll 2d10 Fire damage; on a success, half as much.",
    });
    expect(sheetCards(c).find((x) => x.name === "Hex")?.roll).toBe(
      "When your attack hits, add 1d6 Necrotic damage. Add it to every hit on the target until the spell ends.",
    );
  });

  it("writes healing, no-roll damage and second rolls", () => {
    expect(rollOf("cure-wounds")).toBe("The creature regains 2d8 + 3 Hit Points.");
    expect(rollOf("magic-missile")).toMatch(/^It hits with no roll: roll 1d4 \+ 1 Force damage\./);
    expect(rollOf("ice-knife")).toBe(
      "Roll a d20 + 5 to hit. On a hit, roll 1d10 Piercing damage. Hit or miss, the target and each creature within 5 feet of it then make a Dexterity save or take 2d6 Cold damage. The Dexterity save is against DC 13.",
    );
    expect(rollOf("ensnaring-strike")).toBe(
      "Targets make a Strength save against DC 13. On a failure, the target takes 1d6 Piercing damage at the start of each of its turns while the spell lasts.",
    );
    expect(rollOf("sleep")).toBe("Targets make a Wisdom save against DC 13.");
    expect(rollOf("bless")).toBeUndefined();
  });

  it("prints every damage or healing roll of every spell a player can get", () => {
    const problems: string[] = [];
    for (const s of Object.values(CONTENT.spells)) {
      const roll = rollOf(s.id) ?? "";
      for (const sentence of s.rulesText.join(" ").split(/(?<=[.!?])\s+/)) {
        if (!/\bdamage\b|\bHit Points?\b|\bregains?\b/i.test(sentence)) continue;
        for (const d of sentence.match(/\b\d+d\d+(?: \+ \d+)?\b/g) ?? [])
          if (!roll.includes(d)) problems.push(`${s.id}: ${d} not in "${roll}"`);
      }
    }
    expect(problems).toEqual([]);
  });
});

/** The Fighter with one feature's activation changed and its summary left alone. */
function fighterWith(id: string, activation: Activation): Character {
  const c = buildCharacter(FIGHTER);
  const f = c.features.find((x) => x.id === id);
  if (!f) throw new Error(`no feature ${id}`);
  f.activation = activation;
  return c;
}

/** Every name on the "On your turn" lists. */
function onTurn(c: Character): string[] {
  const plan = turnPlan(c);
  return [...plan.action, ...plan.bonus, ...plan.reaction, ...plan.always].map((i) => i.name);
}

describe("grouping comes from the activation field, not the wording", () => {
  it("files a feature under its field even when its summary names another action", () => {
    // Second Wind's summary opens "As a bonus action"; the field wins.
    const c = fighterWith("fighter-second-wind", "passive");
    const plan = turnPlan(c);
    expect(plan.bonus.map((i) => i.name)).not.toContain("Second Wind");
    expect(plan.always.map((i) => i.name)).toContain("Second Wind");
    expect(sheetCards(c).find((x) => x.name === "Second Wind")?.when).toBe(
      "Always on, or when it says",
    );
  });

  it("files a feature whose summary names no action by its field", () => {
    const plan = turnPlan(fighterWith("fighter-tactical-mind", "reaction"));
    expect(plan.reaction.map((i) => i.name)).toEqual(["Tactical Mind"]);
    expect(plan.always.map((i) => i.name)).not.toContain("Tactical Mind");
  });

  it("leaves a minute-long feature off the turn but labels its card", () => {
    const c = fighterWith("fighter-tactical-mind", "minute");
    expect(onTurn(c)).not.toContain("Tactical Mind");
    expect(sheetCards(c).find((x) => x.name === "Tactical Mind")?.when).toBe(
      "Takes a minute or more",
    );
    // Warlock's Magical Cunning is curated as a 1-minute rite.
    expect(onTurn(buildCharacter(WARLOCK))).not.toContain("Magical Cunning");
  });

  it("files a spell by its field, not its casting-time wording", () => {
    const c = buildCharacter(WIZARD);
    const shield = c.spellcasting.flatMap((b) => b.spells).find((s) => s.id === "shield");
    if (!shield) throw new Error("no Shield");
    shield.activation = "bonus";
    const plan = turnPlan(c);
    expect(plan.reaction).toEqual([]);
    expect(plan.bonus.map((i) => i.name)).toContain("Shield");
  });
});
