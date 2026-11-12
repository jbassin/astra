import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { CONTENT } from "./content";
import type { Activation } from "./contentTypes";
import { buildCharacter, type Character, spellEntry } from "./engine";
import {
  attackCardId,
  attackRoll,
  goodAt,
  sheetCards,
  slotLine,
  spellRoll,
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

  it("writes the slot line", () => {
    expect(slotLine([2], 1)).toBe(
      "2 level 1 spell slots; they all come back after a Short or Long Rest.",
    );
    expect(slotLine([3], undefined)).toBe(
      "3 level 1 spell slots; they all come back after a Long Rest.",
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
    const names = plan.actionSpells.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["Mage Hand", "Magic Missile", "Sleep"]));
    expect(names).not.toContain("Fire Bolt"); // an attack, listed with the attacks
    const cards = sheetCards(c);
    // Each action spell carries its card's id, and the card exists.
    for (const i of plan.actionSpells) {
      expect(i.id).toMatch(/^spell-/);
      expect(cards.some((x) => x.id === i.id)).toBe(true);
    }
    // An attack cantrip gives its spell's card id; a weapon attack gives none.
    const fireBolt = c.attacks.find((a) => a.name === "Fire Bolt");
    expect(fireBolt && attackCardId(c, fireBolt)).toBe("spell-fire-bolt");
    expect(cards.some((x) => x.id === "spell-fire-bolt")).toBe(true);
    const fighter = buildCharacter(FIGHTER);
    for (const a of fighter.attacks) expect(attackCardId(fighter, a)).toBeUndefined();
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
    expect(rollOf("divine-smite")).toBe(
      "When your attack hits, add 2d8 Radiant damage. 1d8 more if the target is a Fiend or an Undead.",
    );
    expect(rollOf("toll-the-dead")).toBe(
      "Targets make a Wisdom save against DC 13. On a failure, roll 1d8 or 1d12 Necrotic damage. 1d12 instead if the target is missing any Hit Points.",
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

const BARBARIAN: Answers = {
  archetype: "warrior",
  classId: "barbarian",
  speciesId: "human",
  backgroundId: "soldier",
  ...DONE,
};

const CLERIC: Answers = {
  archetype: "healer",
  classId: "cleric",
  speciesId: "human",
  backgroundId: "acolyte",
  options: { divineOrder: ["protector"] },
  ...DONE,
};

/** Every name the sheet gives a card or an "On your turn" entry. */
function described(c: Character): string[] {
  return [...sheetCards(c).map((x) => x.name), ...onTurn(c)];
}

describe("each thing is described once, on its card", () => {
  it("gives an 'On your turn' entry a name and its uses, never a sentence", () => {
    const fighter = turnPlan(buildCharacter(FIGHTER));
    expect(fighter.bonus).toContainEqual({
      id: "fighter-second-wind",
      name: "Second Wind",
      uses: "2 per Long Rest; regain one use when you finish a Short Rest.",
    });
    expect(fighter.always).toContainEqual({ id: "fighter-tactical-mind", name: "Tactical Mind" });
    // A spell cast as a bonus action or a reaction: its name and what it costs.
    expect(turnPlan(buildCharacter(WARLOCK)).reaction).toEqual([
      { id: "spell-hellish-rebuke", name: "Hellish Rebuke", uses: "Spend a spell slot" },
    ]);
    for (const answers of [FIGHTER, WIZARD, WARLOCK, BARBARIAN, CLERIC]) {
      const plan = turnPlan(buildCharacter(answers));
      for (const item of [...plan.action, ...plan.bonus, ...plan.reaction, ...plan.always]) {
        const extra = Object.keys(item).filter((k) => !["id", "name", "uses"].includes(k));
        expect(extra, item.name).toEqual([]);
      }
    }
  });

  it("writes a spell's card from its gist, then the note on how the character has it", () => {
    // This Wizard has only ordinary picks, so no card carries a note.
    const spells = sheetCards(buildCharacter(WIZARD)).filter((x) => x.kind !== "Feature");
    expect(spells.find((x) => x.name === "Magic Missile")?.text).toBe(
      "Three glowing darts that always hit.",
    );
    for (const card of spells) {
      const spell = CONTENT.spells[card.id.slice("spell-".length)];
      expect(card.text, card.name).toBe(spell?.gist);
      expect(card.text, card.name).not.toBe(spell?.summary);
    }
    const mageArmor = sheetCards(buildCharacter(WARLOCK)).find((x) => x.name === "Mage Armor");
    expect(mageArmor?.text).toBe(
      `${CONTENT.spells["mage-armor"]?.gist} (Armor of Shadows: cast it on yourself without a spell slot.)`,
    );
  });
});

describe("what a number or a line already shows", () => {
  it("gets no card and no turn entry: Tough, Unarmored Defense, Weapon Mastery", () => {
    const barbarian = buildCharacter(BARBARIAN);
    // d12: (12 + 2) + (7 + 2) + Tough 4 = 27; no armor: 10 + Dex 1 + Con 2 = 13.
    expect(barbarian.hitPoints.max).toBe(27);
    expect(barbarian.hitPoints.breakdown).toMatch(/\+4 Tough/);
    expect(barbarian.armorClass.value).toBe(13);
    expect(barbarian.armorClass.breakdown).toMatch(/Unarmored Defense/);
    expect(barbarian.attacks.find((a) => a.name === "Greataxe")?.mastery?.name).toBe("Cleave");
    // Soldier's two skills, the Barbarian's two, and Skillful's one.
    expect(goodAt(barbarian)).toHaveLength(5);
    const shown = described(barbarian);
    for (const name of ["Tough", "Unarmored Defense", "Weapon Mastery", "Skillful", "Versatile"])
      expect(shown, name).not.toContain(name);
    // What the player decides or has to remember at the table keeps its card.
    expect(sheetCards(barbarian).map((x) => x.name)).toEqual([
      "Rage",
      "Danger Sense",
      "Reckless Attack",
      "Resourceful",
      "Savage Attacker",
    ]);
  });

  it("leaves a caster's Spellcasting, order and Magic Initiate to the spells section", () => {
    const cleric = buildCharacter(CLERIC);
    const shown = described(cleric);
    for (const name of ["Spellcasting", "Protector", "Magic Initiate", "Tough"])
      expect(shown, name).not.toContain(name);
    // Wis 17 (+3): save DC 8 + 3 + 2 = 13, spell attack 3 + 2 = +5.
    expect(cleric.spellcasting[0]).toMatchObject({ saveDc: 13, attackBonus: 5, slots: [3] });
    expect(cleric.proficiencies.armor).toContain("Heavy armor (Protector)");
    const initiate = cleric.spellcasting.find((b) => b.source === "feat");
    expect(initiate?.spells[0]).toMatchObject({ id: "sanctuary", freeCasts: "1 per Long Rest" });
    expect(sheetCards(cleric).find((x) => x.name === "Sanctuary")?.uses).toBe(
      "1 per Long Rest without a slot, or spend a spell slot",
    );
  });

  it("leaves a fighting style and species traits that are only numbers off the cards", () => {
    const fighter = buildCharacter({ ...FIGHTER, options: { fightingStyle: ["defense"] } });
    // Chain Mail 16 + Defense 1; d10: (10 + 2) + (6 + 2) + Dwarven Toughness 2 = 22.
    expect(fighter.armorClass.value).toBe(17);
    expect(fighter.hitPoints.max).toBe(22);
    expect(fighter.darkvision).toBe(120);
    const shown = described(fighter);
    for (const name of ["Defense", "Darkvision", "Dwarven Toughness", "Weapon Mastery"])
      expect(shown, name).not.toContain(name);
    // Dwarven Resilience also gives Advantage on a save, which no number shows.
    expect(shown).toContain("Dwarven Resilience");
  });
});

describe("the checks behind leaving a card out", () => {
  it("shows every mastered weapon's mastery on an attack, so Weapon Mastery needs no card", () => {
    for (const cls of Object.values(CONTENT.classes)) {
      if (cls.masteries.count === 0) continue;
      const c = buildCharacter({
        archetype: cls.archetype,
        classId: cls.id,
        speciesId: "human",
        backgroundId: cls.backgrounds[0],
        options: Object.fromEntries(
          cls.optionGroups.map((g) => [g.key, g.choices.slice(0, g.count)]),
        ),
        ...DONE,
      });
      expect(c.missing, cls.id).toEqual([]);
      expect(c.masteries, cls.id).toHaveLength(cls.masteries.count);
      for (const weapon of c.masteries) {
        const attack = c.attacks.find((a) => a.name.startsWith(weapon));
        expect(attack?.mastery, `${cls.id} ${weapon}`).toBeDefined();
      }
    }
  });

  it("flags as applied only passive things with no uses to count", () => {
    const species = Object.values(CONTENT.species);
    const applied = [
      ...Object.values(CONTENT.options),
      ...Object.values(CONTENT.feats),
      ...species.flatMap((s) => s.traits),
      ...species.flatMap((s) => s.option?.choices ?? []),
    ].filter((x) => x.applied !== undefined);
    expect(applied.length).toBeGreaterThan(0);
    for (const x of applied) {
      expect(x.applied?.trim(), x.id).not.toBe("");
      expect(x.activation, x.id).toBe("passive");
      expect("uses" in x ? x.uses : undefined, x.id).toBeUndefined();
    }
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
