// One fully worked level 2 character per class, checked by hand against the 2024 rules. Each
// expected number has its arithmetic beside it. Shared rules used throughout:
// - standard array 15, 14, 13, 12, 10, 8 in the class's ability priority (content/classes.ts);
// - background: +2 to the primary and +1 to the next ability in priority order it lists;
// - modifier = floor((score − 10) / 2); Proficiency Bonus at level 2 = +2;
// - HP = hit die max + Con (level 1) + (die / 2 + 1) + Con (level 2), plus Dwarf +1/level and
//   Tough +2/level; spell save DC = 8 + modifier + 2; spell attack = modifier + 2.

import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { CONTENT, speciesOptionOf } from "./content";
import { CLASS_IDS } from "./contentTypes";
import { buildCharacter, type Character, type SpellEntry } from "./engine";
import { withShortlist } from "./testShortlist";

function scores(c: Character): Record<string, number> {
  return Object.fromEntries(Object.entries(c.abilities).map(([k, v]) => [k, v.score]));
}

function skill(c: Character, id: string) {
  const s = c.skills.find((x) => x.id === id);
  if (!s) throw new Error(`no skill ${id}`);
  return s;
}

function attack(c: Character, name: string) {
  const a = c.attacks.find((x) => x.name.startsWith(name));
  if (!a) throw new Error(`no attack ${name}: ${c.attacks.map((x) => x.name).join(", ")}`);
  return a;
}

function proficientSkills(c: Character): Record<string, number> {
  return Object.fromEntries(c.skills.filter((s) => s.proficient).map((s) => [s.id, s.bonus]));
}

const DONE = { name: "Test", look: "Plain.", personality: "Calm." };

describe("buildCharacter: one worked character per class", () => {
  it("Fighter (Dwarf, Soldier, Great Weapon Fighting)", () => {
    const c = withShortlist("fighter", { fightingStyle: ["great-weapon-fighting"] }, () =>
      buildCharacter({
        archetype: "warrior",
        classId: "fighter",
        speciesId: "dwarf",
        backgroundId: "soldier",
        ...DONE,
      }),
    );
    // Priority str con dex wis int cha → 15 14 13 12 10 8; Soldier (Str Dex Con): Str +2, Con +1.
    expect(scores(c)).toEqual({ str: 17, dex: 13, con: 15, int: 10, wis: 12, cha: 8 });
    // d10: (10 + 2) + (6 + 2) + Dwarven Toughness 2 = 22.
    expect(c.hitPoints.max).toBe(22);
    // Chain Mail 16, heavy: no Dex.
    expect(c.armorClass.value).toBe(16);
    expect(c.speed.walk).toBe(30);
    expect(c.initiative).toBe(1); // Dex +1
    // Saves: Str 3 + 2 = 5, Con 2 + 2 = 4.
    expect(c.abilities.str.save).toBe(5);
    expect(c.abilities.con.save).toBe(4);
    // Soldier: Athletics, Intimidation; Fighter's best unused: Perception, Survival.
    // Athletics 3 + 2 = 5; Intimidation −1 + 2 = 1; Perception and Survival 1 + 2 = 3.
    expect(proficientSkills(c)).toEqual({
      athletics: 5,
      intimidation: 1,
      perception: 3,
      survival: 3,
    });
    expect(c.passivePerception).toBe(13); // 10 + 3
    // Greatsword: Str 3 + 2 = +5, 2d6 + 3, Graze (one of 3 masteries).
    expect(attack(c, "Greatsword")).toMatchObject({
      toHit: 5,
      damage: "2d6 + 3",
      damageType: "Slashing",
    });
    expect(attack(c, "Greatsword").mastery?.name).toBe("Graze");
    expect(attack(c, "Javelin")).toMatchObject({
      toHit: 5,
      damage: "1d6 + 3",
      range: "5 ft. or thrown 30/120 ft.",
    });
    expect(c.masteries).toEqual(["Greatsword", "Flail", "Javelin"]);
    expect(c.darkvision).toBe(120);
    expect(c.resistances).toEqual(["Poison"]);
    expect(c.gold).toBe(18); // 4 GP (Fighter A) + 14 GP (Soldier A)
    expect(c.proficiencies.languages).toEqual(["Common", "Dwarvish", "Elvish"]);
    expect(c.features.find((f) => f.id === "fighter-second-wind")?.uses).toEqual({
      max: 2,
      unit: "use",
    });
    expect(c.missing).toEqual([]);
  });

  it("Barbarian (Goliath, Farmer)", () => {
    const c = buildCharacter({
      archetype: "warrior",
      classId: "barbarian",
      speciesId: "goliath",
      backgroundId: "farmer",
      ...DONE,
    });
    // Priority str con dex wis cha int → 15 14 13 12 10 8; Farmer (Str Con Wis): Str +2, Con +1.
    expect(scores(c)).toEqual({ str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 });
    // d12: (12 + 2) + (7 + 2) + Tough (Farmer) 4 = 27.
    expect(c.hitPoints.max).toBe(27);
    // No armor in the kit: Unarmored Defense 10 + Dex 1 + Con 2 = 13.
    expect(c.armorClass.value).toBe(13);
    expect(c.speed.walk).toBe(35); // Goliath
    expect(attack(c, "Greataxe")).toMatchObject({ toHit: 5, damage: "1d12 + 3" });
    expect(attack(c, "Greataxe").mastery?.name).toBe("Cleave");
    expect(attack(c, "Greataxe").notes).toContain("+2 damage while raging.");
    // Farmer: Animal Handling, Nature; Barbarian: Athletics, Perception.
    expect(proficientSkills(c)).toEqual({
      "animal-handling": 3,
      athletics: 5,
      nature: 1,
      perception: 3,
    });
    expect(c.features.find((f) => f.id === "barbarian-rage")?.uses).toEqual({
      max: 2,
      unit: "use",
    });
    // A Barbarian's Goliath descends from hill giants (the builder picks it from the class).
    expect(c.features.map((f) => f.name)).toContain("Giant Ancestry (Hill Giant)");
    expect(c.spellcasting).toEqual([]);
  });

  it("Monk (Wood Elf, Guide, Magic Initiate: Druid)", () => {
    const c = buildCharacter({
      archetype: "warrior",
      classId: "monk",
      speciesId: "elf",
      backgroundId: "guide",
      ...DONE,
    });
    // Priority dex wis con str int cha → 15 14 13 12 10 8; Guide (Dex Con Wis): Dex +2, Wis +1.
    expect(scores(c)).toEqual({ str: 12, dex: 17, con: 13, int: 10, wis: 15, cha: 8 });
    expect(c.hitPoints.max).toBe(15); // d8: (8 + 1) + (5 + 1)
    expect(c.armorClass.value).toBe(15); // 10 + Dex 3 + Wis 2
    expect(c.speed.walk).toBe(45); // Wood Elf 35 + Unarmored Movement 10
    // Guide: Stealth, Survival; Monk: Acrobatics, Insight; Keen Senses: Perception.
    expect(proficientSkills(c)).toEqual({
      acrobatics: 5,
      insight: 4,
      perception: 4,
      stealth: 5,
      survival: 4,
    });
    // Martial Arts: Dex 3 + 2 = +5, 1d6 + 3, and a dagger's 1d4 becomes the 1d6 Martial Arts die.
    expect(attack(c, "Unarmed Strike")).toMatchObject({ toHit: 5, damage: "1d6 + 3" });
    expect(attack(c, "Dagger")).toMatchObject({ toHit: 5, damage: "1d6 + 3" });
    // Magic Initiate ability: no class casting, so the best of Int/Wis/Cha: Wis 15 (+2).
    const mi = c.spellcasting.find((b) => b.source === "feat");
    expect(mi).toMatchObject({ ability: "wis", saveDc: 12, attackBonus: 4 }); // 8 + 2 + 2; 2 + 2
    const goodberry: SpellEntry | undefined = mi?.spells[0];
    expect(goodberry).toMatchObject({ id: "goodberry", freeCasts: 1 });
    expect(c.abilities.wis.name).toBe("Wisdom");
    expect(attack(c, "Produce Flame")).toMatchObject({
      toHit: 4,
      damage: "1d8",
      damageType: "Fire",
    });
    expect(c.spellcasting.find((b) => b.source === "species")?.cantrips.map((s) => s.id)).toEqual([
      "druidcraft",
    ]);
  });

  it("Rogue (Halfling, Criminal)", () => {
    const c = buildCharacter({
      archetype: "scoundrel",
      classId: "rogue",
      speciesId: "halfling",
      backgroundId: "criminal",
      ...DONE,
    });
    // Priority dex con wis int cha str → 15 14 13 12 10 8; Criminal (Dex Con Int): Dex +2, Con +1.
    expect(scores(c)).toEqual({ str: 8, dex: 17, con: 15, int: 12, wis: 13, cha: 10 });
    expect(c.hitPoints.max).toBe(17); // d8: (8 + 2) + (5 + 2)
    expect(c.armorClass.value).toBe(14); // Leather 11 + Dex 3
    expect(c.initiative).toBe(5); // Dex 3 + Alert (Criminal) 2
    // Criminal: Sleight of Hand, Stealth; Rogue: Perception, Acrobatics, Deception, Insight.
    // Expertise in Stealth and Sleight of Hand: 3 + 2 × 2 = 7.
    expect(proficientSkills(c)).toEqual({
      acrobatics: 5,
      deception: 2,
      insight: 3,
      perception: 3,
      "sleight-of-hand": 7,
      stealth: 7,
    });
    expect(skill(c, "stealth").expertise).toBe(true);
    expect(attack(c, "Shortsword")).toMatchObject({ toHit: 5, damage: "1d6 + 3" });
    expect(attack(c, "Shortsword").mastery?.name).toBe("Vex");
    expect(attack(c, "Shortbow").notes).toContain(
      "Sneak Attack: +1d6 once per turn when it applies.",
    );
    // 2 daggers from each package; Dagger is third on the mastery list, so no mastery.
    expect(attack(c, "Dagger")).toMatchObject({ name: "Dagger (×4)" });
    expect(attack(c, "Dagger").mastery).toBeUndefined();
    // Thieves' Tools twice (Rogue and Criminal): the repeat becomes another tool.
    expect(c.proficiencies.tools).toEqual(["Thieves' Tools", "Smith's Tools"]);
    expect(c.proficiencies.languages).toEqual([
      "Common",
      "Halfling",
      "Elvish",
      "Thieves' Cant",
      "Dwarvish",
    ]);
  });

  it("Ranger (Human, Wayfarer, Druidic Warrior)", () => {
    const c = withShortlist("ranger", { fightingStyle: ["druidic-warrior"] }, () =>
      buildCharacter({
        archetype: "scoundrel",
        classId: "ranger",
        speciesId: "human",
        backgroundId: "wayfarer",
        ...DONE,
      }),
    );
    // Priority dex wis con str int cha → 15 14 13 12 10 8; Wayfarer (Dex Wis Cha): Dex +2, Wis +1.
    expect(scores(c)).toEqual({ str: 12, dex: 17, con: 13, int: 10, wis: 15, cha: 8 });
    // Wayfarer gives Lucky, so Human Versatile takes Alert. d10: (10 + 1) + (6 + 1) = 18.
    expect(c.hitPoints.max).toBe(18);
    expect(
      c.features.filter((f) => f.source === "feat" || f.source === "background").map((f) => f.name),
    ).toEqual(["Lucky", "Alert"]);
    expect(c.armorClass.value).toBe(15); // Studded Leather 12 + Dex 3
    expect(c.initiative).toBe(5); // Dex 3 + Alert 2
    // Wayfarer: Insight, Stealth; Ranger: Perception, Survival, Nature; Skillful: Animal Handling.
    // Deft Explorer expertise: Perception 2 + 4 = 6.
    expect(proficientSkills(c)).toEqual({
      "animal-handling": 4,
      insight: 4,
      nature: 2,
      perception: 6,
      stealth: 5,
      survival: 4,
    });
    expect(c.passivePerception).toBe(16);
    expect(attack(c, "Longbow")).toMatchObject({ toHit: 5, damage: "1d8 + 3" });
    expect(attack(c, "Longbow").mastery?.name).toBe("Slow");
    const ranger = c.spellcasting.find((b) => b.source === "class");
    // Wis 2 + proficiency 2: DC 8 + 4 = 12, attack +4.
    expect(ranger).toMatchObject({ ability: "wis", saveDc: 12, attackBonus: 4, slots: [2] });
    expect(ranger?.spells.map((s) => s.id)).toEqual([
      "cure-wounds",
      "entangle",
      "goodberry",
      "hunters-mark",
    ]);
    expect(ranger?.spells.at(-1)?.freeCasts).toBe(2);
    expect(attack(c, "Starry Wisp")).toMatchObject({
      toHit: 4,
      damage: "1d8",
      damageType: "Radiant",
    });
    // Common + 2 standard + Deft Explorer's 2.
    expect(c.proficiencies.languages).toEqual([
      "Common",
      "Elvish",
      "Dwarvish",
      "Halfling",
      "Draconic",
    ]);
  });

  it("Bard (Infernal Tiefling, Entertainer)", () => {
    const c = buildCharacter({
      archetype: "scoundrel",
      classId: "bard",
      speciesId: "tiefling",
      backgroundId: "entertainer",
      ...DONE,
    });
    // Priority cha dex con wis int str → 15 14 13 12 10 8; Entertainer (Str Dex Cha): Cha +2, Dex +1.
    expect(scores(c)).toEqual({ str: 8, dex: 15, con: 13, int: 10, wis: 12, cha: 17 });
    expect(c.hitPoints.max).toBe(15); // d8: (8 + 1) + (5 + 1)
    expect(c.armorClass.value).toBe(13); // Leather 11 + Dex 2
    // Entertainer: Acrobatics, Performance; Bard (any 3): Persuasion, Deception, Insight.
    // Expertise: Persuasion, Performance 3 + 4 = 7. Jack of All Trades: +1 to the rest.
    expect(proficientSkills(c)).toEqual({
      acrobatics: 4,
      deception: 5,
      insight: 3,
      performance: 7,
      persuasion: 7,
    });
    expect(skill(c, "perception")).toMatchObject({ bonus: 2, notes: ["+1 Jack of All Trades"] }); // 1 + 1
    expect(c.passivePerception).toBe(12);
    expect(c.features.find((f) => f.id === "bard-bardic-inspiration")?.uses).toEqual({
      max: 3,
      unit: "use",
    }); // Cha +3
    const bard = c.spellcasting.find((b) => b.source === "class");
    expect(bard).toMatchObject({ ability: "cha", saveDc: 13, attackBonus: 5, slots: [3] });
    expect(attack(c, "Vicious Mockery")).toMatchObject({
      save: { ability: "wis", dc: 13 },
      damage: "1d6",
    });
    // Infernal legacy: Fire Bolt and Thaumaturgy with the class's ability, Charisma.
    expect(c.spellcasting.find((b) => b.source === "species")).toMatchObject({
      ability: "cha",
      attackBonus: 5,
    });
    expect(attack(c, "Fire Bolt")).toMatchObject({ toHit: 5, damage: "1d10" });
    expect(c.resistances).toEqual(["Fire"]);
    // 3 Bard instruments, Entertainer's (a repeat lute becomes a lyre), Musician's 3 more.
    expect(c.proficiencies.tools).toHaveLength(7);
  });

  it("Sorcerer (Red Dragonborn, Noble)", () => {
    const c = buildCharacter({
      archetype: "mage",
      classId: "sorcerer",
      speciesId: "dragonborn",
      backgroundId: "noble",
      ...DONE,
    });
    // Priority cha con dex wis int str → 15 14 13 12 10 8; Noble (Str Int Cha): Cha +2, Int +1.
    expect(scores(c)).toEqual({ str: 8, dex: 13, con: 14, int: 11, wis: 12, cha: 17 });
    expect(c.hitPoints.max).toBe(14); // d6: (6 + 2) + (4 + 2)
    expect(c.armorClass.value).toBe(11); // 10 + Dex 1
    // Noble: History, Persuasion; Sorcerer: Deception, Insight; Skilled: Arcana, Intimidation, Religion.
    expect(Object.keys(proficientSkills(c))).toEqual([
      "arcana",
      "deception",
      "history",
      "insight",
      "intimidation",
      "persuasion",
      "religion",
    ]);
    expect(c.spellcasting[0]).toMatchObject({
      ability: "cha",
      saveDc: 13,
      attackBonus: 5,
      slots: [3],
    });
    expect(attack(c, "Shocking Grasp")).toMatchObject({
      toHit: 5,
      damage: "1d8",
      damageType: "Lightning",
    });
    expect(c.features.find((f) => f.id === "sorcerer-font-of-magic")?.uses).toEqual({
      max: 2,
      unit: "Sorcery Point",
    });
    expect(c.features.find((f) => f.id === "breath-weapon")?.uses).toEqual({
      max: 2,
      unit: "use",
    }); // Proficiency Bonus
    expect(c.resistances).toEqual(["Fire"]);
  });

  it("Druid (Forest Gnome, Hermit, Magician)", () => {
    const c = buildCharacter({
      archetype: "mage",
      classId: "druid",
      speciesId: "gnome",
      backgroundId: "hermit",
      ...DONE,
    });
    // Priority wis con dex int str cha → 15 14 13 12 10 8; Hermit (Con Wis Cha): Wis +2, Con +1.
    expect(scores(c)).toEqual({ str: 10, dex: 13, con: 15, int: 12, wis: 17, cha: 8 });
    expect(c.hitPoints.max).toBe(17); // d8: (8 + 2) + (5 + 2)
    expect(c.armorClass.value).toBe(14); // Leather 11 + Dex 1 + Shield 2
    // Magician: Arcana and Nature get Wis +3. Arcana 1 + 3 = 4 (not proficient).
    expect(skill(c, "arcana")).toMatchObject({ bonus: 4, proficient: false });
    expect(skill(c, "nature")).toMatchObject({ bonus: 4 });
    const druid = c.spellcasting.find((b) => b.source === "class");
    expect(druid?.cantrips).toHaveLength(3); // 2 + Magician's 1
    expect(druid?.spells.map((s) => s.id)).toEqual([
      "entangle",
      "healing-word",
      "thunderwave",
      "cure-wounds",
      "goodberry",
      "speak-with-animals",
      "find-familiar",
    ]);
    expect(druid).toMatchObject({ saveDc: 13, attackBonus: 5, slots: [3] });
    expect(c.features.find((f) => f.id === "druid-wild-shape")?.uses).toEqual({
      max: 2,
      unit: "use",
    });
    // Forest Gnome: Speak with Animals free a Proficiency Bonus number of times.
    expect(c.spellcasting.find((b) => b.source === "species")?.spells[0]?.freeCasts).toBe(2);
    expect(c.proficiencies.languages).toContain("Druidic");
    // The Druid's focus is a quarterstaff, and Hermit brings another: Str 0 + 2 = +2, 1d6.
    expect(attack(c, "Quarterstaff")).toMatchObject({
      name: "Quarterstaff",
      toHit: 2,
      damage: "1d6",
    });
  });

  it("Wizard (High Elf, Sage, Magic Initiate: Wizard)", () => {
    const c = buildCharacter({
      archetype: "mage",
      classId: "wizard",
      speciesId: "elf",
      backgroundId: "sage",
      ...DONE,
    });
    // Priority int con dex wis cha str → 15 14 13 12 10 8; Sage (Con Int Wis): Int +2, Con +1.
    expect(scores(c)).toEqual({ str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 });
    expect(c.hitPoints.max).toBe(14); // d6: (6 + 2) + (4 + 2)
    expect(c.armorClass.value).toBe(11); // 10 + Dex 1
    // Mage Armor is prepared: 13 + Dex 1 = 14 with no armor on.
    expect(c.armorClass.alternatives[0]?.value).toBe(14);
    // Sage: Arcana, History; Wizard: Investigation, Insight; Keen Senses: Perception. Scholar: Arcana.
    expect(proficientSkills(c)).toEqual({
      arcana: 7,
      history: 5,
      insight: 3,
      investigation: 5,
      perception: 3,
    });
    const wizard = c.spellcasting.find((b) => b.source === "class");
    expect(wizard).toMatchObject({ ability: "int", saveDc: 13, attackBonus: 5, slots: [3] });
    expect(wizard).not.toHaveProperty("spellbook");
    // High Elf and Magic Initiate spells use the class's Intelligence.
    expect(c.spellcasting.find((b) => b.source === "species")).toMatchObject({
      ability: "int",
      saveDc: 13,
    });
    expect(c.spellcasting.find((b) => b.source === "feat")?.spells[0]?.id).toBe("thunderwave");
  });

  it("Warlock (Orc, Charlatan, Agonizing Blast)", () => {
    const c = withShortlist(
      "warlock",
      { invocations: ["agonizing-blast", "armor-of-shadows", "pact-of-the-chain"] },
      () =>
        buildCharacter({
          archetype: "mage",
          classId: "warlock",
          speciesId: "orc",
          backgroundId: "charlatan",
          ...DONE,
        }),
    );
    // Priority cha con dex wis int str → 15 14 13 12 10 8; Charlatan (Dex Con Cha): Cha +2, Con +1.
    expect(scores(c)).toEqual({ str: 8, dex: 13, con: 15, int: 10, wis: 12, cha: 17 });
    expect(c.hitPoints.max).toBe(17); // d8: (8 + 2) + (5 + 2)
    expect(c.armorClass.value).toBe(14); // Armor of Shadows: 13 + Dex 1, better than Leather 12
    expect(c.armorClass.alternatives).toEqual([]);
    expect(c.features.map((f) => f.id)).not.toContain("armor-of-shadows");
    expect(c.spellcasting.flatMap((b) => b.spells.map((s) => s.id))).not.toContain("mage-armor");
    // Eldritch Blast: Cha 3 + 2 = +5; Agonizing Blast adds Cha 3 to the 1d10.
    expect(attack(c, "Eldritch Blast")).toMatchObject({
      toHit: 5,
      damage: "1d10 + 3",
      damageType: "Force",
    });
    const warlock = c.spellcasting.find((b) => b.source === "class");
    // Pact Magic at level 2: 2 slots of level 1.
    expect(warlock).toMatchObject({ saveDc: 13, slots: [2], pactSlotLevel: 1 });
    expect(warlock?.spells.map((s) => s.id)).toEqual([
      "hex",
      "hellish-rebuke",
      "armor-of-agathys",
      "find-familiar",
    ]);
    expect(c.features.find((f) => f.id === "adrenaline-rush")?.uses).toEqual({
      max: 2,
      unit: "use",
    });
    expect(c.darkvision).toBe(120);
  });

  it("Cleric (Dwarf, Acolyte, Thaumaturge)", () => {
    const c = buildCharacter({
      archetype: "healer",
      classId: "cleric",
      speciesId: "dwarf",
      backgroundId: "acolyte",
      ...DONE,
    });
    // Priority wis con dex str cha int → 15 14 13 12 10 8; Acolyte (Int Wis Cha): Wis +2, Cha +1.
    expect(scores(c)).toEqual({ str: 12, dex: 13, con: 14, int: 8, wis: 17, cha: 11 });
    expect(c.hitPoints.max).toBe(19); // d8: (8 + 2) + (5 + 2) + Dwarf 2
    expect(c.armorClass.value).toBe(16); // Chain Shirt 13 + Dex 1 (max 2) + Shield 2
    // Acolyte: Insight, Religion; Cleric: Medicine, Persuasion. Thaumaturge: Religion and Arcana
    // get Wis +3, so Religion = Int −1 + 2 + 3 = 4 and Arcana = −1 + 3 = 2.
    expect(proficientSkills(c)).toEqual({ insight: 5, medicine: 5, persuasion: 2, religion: 4 });
    expect(skill(c, "arcana").bonus).toBe(2);
    expect(attack(c, "Mace")).toMatchObject({ toHit: 3, damage: "1d6 + 1" }); // Str 1 + 2
    expect(attack(c, "Sacred Flame")).toMatchObject({
      save: { ability: "dex", dc: 13 },
      damage: "1d8",
    });
    expect(attack(c, "Toll the Dead")).toMatchObject({ damage: "1d8 or 1d12" });
    expect(c.spellcasting.find((b) => b.source === "class")?.cantrips).toHaveLength(4); // 3 + Thaumaturge
    expect(c.features.find((f) => f.id === "cleric-channel-divinity")?.uses).toEqual({
      max: 2,
      unit: "use",
    });
    expect(c.spellcasting.find((b) => b.source === "feat")).toMatchObject({
      ability: "wis",
      saveDc: 13,
    });
  });

  it("Paladin (Aasimar, Noble, Dueling)", () => {
    const c = buildCharacter({
      archetype: "healer",
      classId: "paladin",
      speciesId: "aasimar",
      backgroundId: "noble",
      ...DONE,
    });
    // Priority str con cha wis dex int → 15 14 13 12 10 8; Noble (Str Int Cha): Str +2, Cha +1.
    expect(scores(c)).toEqual({ str: 17, dex: 10, con: 14, int: 8, wis: 12, cha: 14 });
    expect(c.hitPoints.max).toBe(20); // d10: (10 + 2) + (6 + 2)
    expect(c.armorClass.value).toBe(18); // Chain Mail 16 + Shield 2
    // Longsword one-handed: Str 3 + 2 = +5; 1d8 + 3 + Dueling 2 = 1d8 + 5; Sap.
    expect(attack(c, "Longsword")).toMatchObject({ toHit: 5, damage: "1d8 + 5" });
    expect(attack(c, "Longsword").mastery?.name).toBe("Sap");
    // Javelins are thrown weapons, so Dueling isn't added.
    expect(attack(c, "Javelin")).toMatchObject({ damage: "1d6 + 3" });
    const paladin = c.spellcasting.find((b) => b.source === "class");
    expect(paladin).toMatchObject({ ability: "cha", saveDc: 12, attackBonus: 4, slots: [2] }); // Cha +2
    expect(paladin?.spells.at(-1)).toMatchObject({
      id: "divine-smite",
      freeCasts: 1,
    });
    expect(c.features.find((f) => f.id === "paladin-lay-on-hands")?.uses).toEqual({
      max: 10,
      unit: "Hit Point",
    });
    // Aasimar's Light cantrip uses Charisma.
    expect(c.spellcasting.find((b) => b.source === "species")).toMatchObject({ ability: "cha" });
    expect(c.resistances).toEqual(["Necrotic", "Radiant"]);
  });
});

describe("buildCharacter: the species sub-choice", () => {
  it("follows the class, and changes when the class does", () => {
    const wizard = buildCharacter({ classId: "wizard", speciesId: "elf" });
    expect(wizard.species?.name).toBe("High Elf");
    expect(wizard.speed.walk).toBe(30);
    // The lineage has no feature line (`applied`): its cantrip is in the species' spells.
    expect(wizard.spellcasting.find((b) => b.source === "species")?.cantrips[0]?.id).toBe(
      "prestidigitation",
    );
    // The same answers with another class: a Ranger's Elf is a Wood Elf, faster on foot.
    const ranger = buildCharacter({ classId: "ranger", speciesId: "elf" });
    expect(ranger.species?.name).toBe("Wood Elf");
    expect(ranger.speed.walk).toBe(35);
    expect(ranger.spellcasting.find((b) => b.source === "species")?.cantrips[0]?.id).toBe(
      "druidcraft",
    );
  });

  it("waits for a class without throwing", () => {
    const c = buildCharacter({ speciesId: "elf" });
    expect(c.species?.name).toBe("Elf");
    expect(c.features.map((f) => f.name)).toContain("Elven Lineage");
    expect(c.speed.walk).toBe(30);
    expect(c.missing).toContain("Pick what kind of hero you want to be.");
  });

  // One name per naming case: the sub-choice in front of the species, a sub-choice that
  // already says the species, and a sub-choice that stays a trait (or doesn't exist).
  it.each([
    ["sorcerer", "dragonborn", "Red Dragonborn"],
    ["rogue", "elf", "Drow Elf"],
    ["wizard", "elf", "High Elf"],
    ["ranger", "elf", "Wood Elf"],
    ["druid", "gnome", "Forest Gnome"],
    ["wizard", "gnome", "Rock Gnome"],
    ["bard", "tiefling", "Infernal Tiefling"],
    ["barbarian", "goliath", "Goliath"],
    ["fighter", "dwarf", "Dwarf"],
  ] as const)("a %s who picks %s is a %s", (classId, speciesId, name) => {
    expect(buildCharacter({ classId, speciesId }).species?.name).toBe(name);
  });

  it("gives every class a sub-choice for every species that has one", () => {
    for (const classId of CLASS_IDS) {
      for (const species of Object.values(CONTENT.species)) {
        const option = speciesOptionOf({ classId, speciesId: species.id });
        expect(option !== undefined, `${classId} ${species.id}`).toBe(species.option !== undefined);
      }
    }
  });
});

// The sheet makes a card for each feature line. Something whose whole effect is a number or a
// line the sheet already shows (`hidden` or `applied` in the curation) gets no line, but the
// number keeps it.
describe("buildCharacter: what a number already shows gets no feature line", () => {
  it("Barbarian (Human, Soldier): Tough, Unarmored Defense, Weapon Mastery, Skillful", () => {
    const c = buildCharacter({
      archetype: "warrior",
      classId: "barbarian",
      speciesId: "human",
      backgroundId: "soldier",
      ...DONE,
    });
    // Priority str con dex wis cha int → 15 14 13 12 10 8; Soldier (Str Dex Con): Str +2, Con +1.
    expect(scores(c)).toEqual({ str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 });
    // Soldier gives Savage Attacker, so Human Versatile takes Tough.
    // d12: (12 + 2) + (7 + 2) + Tough 4 = 27.
    expect(c.hitPoints.max).toBe(27);
    expect(c.armorClass.value).toBe(13); // Unarmored Defense: 10 + Dex 1 + Con 2
    // Soldier: Athletics, Intimidation; Barbarian: Perception, Survival; Skillful: Animal Handling.
    expect(proficientSkills(c)).toEqual({
      "animal-handling": 3,
      athletics: 5,
      intimidation: 2,
      perception: 3,
      survival: 3,
    });
    expect(attack(c, "Greataxe").mastery?.name).toBe("Cleave");
    expect(attack(c, "Handaxe").mastery?.name).toBe("Vex");
    expect(c.features.map((f) => f.name)).toEqual([
      "Rage",
      "Danger Sense",
      "Reckless Attack",
      "Resourceful",
      "Savage Attacker",
    ]);
  });

  it("Monk (Orc, Wayfarer): Unarmored Defense, Unarmored Movement, Darkvision", () => {
    const c = buildCharacter({
      archetype: "warrior",
      classId: "monk",
      speciesId: "orc",
      backgroundId: "wayfarer",
      ...DONE,
    });
    // Priority dex wis con str int cha → 15 14 13 12 10 8; Wayfarer (Dex Wis Cha): Dex +2, Wis +1.
    expect(scores(c)).toEqual({ str: 12, dex: 17, con: 13, int: 10, wis: 15, cha: 8 });
    expect(c.hitPoints.max).toBe(15); // d8: (8 + 1) + (5 + 1)
    expect(c.armorClass.value).toBe(15); // Unarmored Defense: 10 + Dex 3 + Wis 2
    expect(c.speed.walk).toBe(40); // Orc 30 + Unarmored Movement 10
    expect(c.darkvision).toBe(120);
    expect(c.features.map((f) => f.name)).toEqual([
      "Martial Arts",
      "Flurry of Blows",
      "Monk's Focus",
      "Patient Defense",
      "Step of the Wind",
      "Uncanny Metabolism",
      "Adrenaline Rush",
      "Relentless Endurance",
      "Lucky",
    ]);
  });
});

describe("buildCharacter: an option or a feat that is only a number gets no feature line", () => {
  it("Warlock (Human, Charlatan): Agonizing Blast, Skilled, Pact Magic, the invocations heading", () => {
    const c = withShortlist(
      "warlock",
      { invocations: ["agonizing-blast", "repelling-blast", "eldritch-mind"] },
      () =>
        buildCharacter({
          archetype: "mage",
          classId: "warlock",
          speciesId: "human",
          backgroundId: "charlatan",
          ...DONE,
        }),
    );
    // Priority cha con dex wis int str → 15 14 13 12 10 8; Charlatan (Dex Con Cha): Cha +2, Con +1.
    expect(scores(c)).toEqual({ str: 8, dex: 13, con: 15, int: 10, wis: 12, cha: 17 });
    // Charlatan gives Skilled, so Human Versatile takes Alert: Dex 1 + 2 = +3.
    expect(c.initiative).toBe(3);
    // Charlatan: Deception, Sleight of Hand; Warlock: Intimidation, Arcana; Skillful:
    // Investigation; Skilled: History, Nature, Religion.
    expect(proficientSkills(c)).toEqual({
      arcana: 2,
      deception: 5,
      history: 2,
      intimidation: 5,
      investigation: 2,
      nature: 2,
      religion: 2,
      "sleight-of-hand": 3,
    });
    // Eldritch Blast: Cha 3 + 2 = +5; Agonizing Blast adds Cha 3 to the 1d10.
    expect(attack(c, "Eldritch Blast")).toMatchObject({
      toHit: 5,
      damage: "1d10 + 3",
      notes: [],
    });
    expect(c.spellcasting[0]).toMatchObject({ saveDc: 13, slots: [2], pactSlotLevel: 1 });
    expect(c.features.map((f) => f.name)).toEqual([
      "Magical Cunning",
      "Repelling Blast",
      "Eldritch Mind",
      "Resourceful",
      "Alert",
    ]);
  });
});

describe("buildCharacter: partial characters", () => {
  it("builds from no answers at all", () => {
    const c = buildCharacter({});
    expect(scores(c)).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
    expect(c.hitPoints.max).toBe(0);
    expect(c.attacks).toEqual([]);
    expect(c.missing[0]).toBe("Pick what kind of hero you want to be.");
  });

  it("builds a class with no species or background yet", () => {
    const answers: Answers = { archetype: "healer", classId: "cleric" };
    const c = buildCharacter(answers);
    expect(c.hitPoints.max).toBe(17); // d8: (8 + 2) + (5 + 2), Con 14 unboosted
    expect(c.speed.walk).toBe(30);
    expect(c.missing).toContain("Pick a species.");
    expect(c.missing).toContain("Pick a background.");
  });
});
