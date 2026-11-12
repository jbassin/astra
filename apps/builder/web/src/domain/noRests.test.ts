// The one-shot has no rests (Josh's call, 2026-11-12): nothing the sheet shows may mention one,
// and nothing on it may depend on one. These tests build every class with every species and
// background and read all the text the sheet draws.

import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { CONTENT } from "./content";
import { buildCharacter, type Character } from "./engine";
import { attackRoll, sheetCards, slotLine, turnPlan } from "./sheet";
import { withShortlist } from "./testShortlist";

const DONE = { name: "Test", look: "Plain.", personality: "Calm." };

/** Every string the sheet draws for a character, except the player's own words. */
function shownText(c: Character): string[] {
  const plan = turnPlan(c);
  const items = [
    ...plan.action,
    ...plan.bonus,
    ...plan.reaction,
    ...plan.always,
    ...plan.actionSpells,
  ];
  return [
    ...sheetCards(c).flatMap((x) => [x.name, x.kind, x.when, x.roll, x.uses, x.text, x.meta]),
    ...items.flatMap((i) => [i.name, i.uses]),
    ...c.attacks.flatMap((a) => [
      a.name,
      a.range,
      attackRoll(a),
      a.mastery?.name,
      a.mastery?.summary,
      ...a.properties,
      ...a.notes,
    ]),
    ...c.spellcasting.flatMap((b) => [b.label, slotLine(b.slots, b.pactSlotLevel)]),
    ...c.armorClass.alternatives.map((a) => a.label),
    ...c.resistances,
    ...c.proficiencies.armor,
    ...c.proficiencies.weapons,
    ...c.proficiencies.tools,
    ...c.masteries,
    ...c.equipment.map((e) => e.name),
  ].filter((t): t is string => typeof t === "string");
}

describe("no text on the sheet mentions a rest", () => {
  const characters: Array<[string, Answers]> = [];
  for (const cls of Object.values(CONTENT.classes)) {
    for (const sp of Object.values(CONTENT.species)) {
      for (const bg of cls.backgrounds) {
        characters.push([
          `${cls.id} ${sp.id} ${bg}`,
          {
            archetype: cls.archetype,
            classId: cls.id,
            speciesId: sp.id,
            backgroundId: bg,
            ...DONE,
          },
        ]);
      }
    }
  }

  it("covers every combination", () => {
    expect(characters.length).toBeGreaterThan(300);
  });

  it("builds every character with no whole word 'rest' in any case", () => {
    const hits: string[] = [];
    for (const [name, answers] of characters) {
      for (const text of shownText(buildCharacter(answers))) {
        if (/\brest\b/i.test(text)) hits.push(`${name}: ${text}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("holds when every option the lists could pick is moved to the front", () => {
    const hits: string[] = [];
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
          for (const text of shownText(c)) if (/\brest\b/i.test(text)) hits.push(`${id}: ${text}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

const chip = (c: Character, name: string) => sheetCards(c).find((x) => x.name === name)?.uses;

function build(
  classId: keyof typeof CONTENT.classes,
  backgroundId: string,
  extra: Partial<Answers> = {},
) {
  return {
    archetype: CONTENT.classes[classId].archetype,
    classId,
    speciesId: "human",
    backgroundId,
    ...DONE,
    ...extra,
  } as Answers;
}

describe("how often a spell is cast, with no rests", () => {
  it("a cantrip, and a spell an option grants, are as often as you like", () => {
    const c = withShortlist(
      "warlock",
      { invocations: ["mask-of-many-faces", "pact-of-the-chain", "agonizing-blast"] },
      () => buildCharacter(build("warlock", "charlatan")),
    );
    expect(chip(c, "Disguise Self")).toBe("As often as you like");
    expect(chip(c, "Find Familiar")).toBe("As often as you like");
    expect(chip(c, "Eldritch Blast")).toBe("As often as you like");
    expect(chip(c, "Hex")).toBe("Spend a spell slot");
  });

  it("a free cast with spell slots reads 'n without a slot, or spend a spell slot'", () => {
    const c = buildCharacter(build("ranger", "wayfarer"));
    const uses = chip(c, "Hunter's Mark");
    const favored = c.spellcasting
      .find((b) => b.source === "class")
      ?.spells.find((s) => s.id === "hunters-mark")?.freeCasts;
    expect(favored).toBeGreaterThan(0);
    expect(uses).toBe(`${favored} without a slot, or spend a spell slot`);
  });

  it("a free cast with no spell slots at all reads as plain uses", () => {
    const withInitiate = Object.values(CONTENT.classes).flatMap((cls) =>
      cls.spellcasting
        ? []
        : cls.backgrounds
            .filter((b) => CONTENT.backgrounds[b]?.initiate)
            .map((b) => build(cls.id, b)),
    );
    expect(withInitiate.length).toBeGreaterThan(0);
    for (const a of withInitiate) {
      const c = buildCharacter(a);
      const spell = c.spellcasting.find((b) => b.source === "feat")?.spells[0];
      expect(spell?.freeCasts, a.classId).toBe(1);
      expect(chip(c, spell?.name ?? ""), a.classId).toBe("1 use");
    }
  });

  it("the Druid's Find Familiar costs a slot or a use of Wild Shape", () => {
    const c = buildCharacter(build("druid", "hermit"));
    expect(chip(c, "Find Familiar")).toBe("Spend a spell slot or a use of Wild Shape");
  });
});

describe("the sheet's counts", () => {
  it("gives a feature's uses as a number and a unit, worded as 'n use(s)'", () => {
    const c = buildCharacter(build("sorcerer", "noble", { speciesId: "dragonborn" }));
    expect(c.features.find((f) => f.id === "sorcerer-font-of-magic")?.uses).toEqual({
      max: 2,
      unit: "Sorcery Point",
    });
    expect(chip(c, "Font of Magic")).toBe("2 Sorcery Points");
    expect(c.features.find((f) => f.id === "breath-weapon")?.uses).toEqual({ max: 2, unit: "use" });
    expect(chip(c, "Breath Weapon")).toBe("2 uses");
    const paladin = buildCharacter(build("paladin", "noble"));
    expect(chip(paladin, "Lay on Hands")).toBe("10 Hit Points");
    expect(
      chip(buildCharacter(build("fighter", "soldier", { archetype: "warrior" })), "Action Surge"),
    ).toBe("1 use");
  });

  it("shows a species sub-choice's uses (a Goliath's giant boon)", () => {
    const c = buildCharacter(build("barbarian", "farmer", { speciesId: "goliath" }));
    const boon = c.features.find((f) => f.name.startsWith("Giant Ancestry"));
    expect(boon?.uses).toEqual({ max: 2, unit: "use" });
  });

  it("gives the Wizard no Arcane Recovery card", () => {
    const c = buildCharacter(build("wizard", "sage"));
    expect(c.features.map((f) => f.id)).not.toContain("wizard-arcane-recovery");
    expect(sheetCards(c).map((x) => x.name)).not.toContain("Arcane Recovery");
  });

  it("keeps the Wizard's spell block to its prepared spells", () => {
    const c = buildCharacter(build("wizard", "sage"));
    expect(c.spellcasting.find((b) => b.source === "class")).not.toHaveProperty("spellbook");
  });
});
