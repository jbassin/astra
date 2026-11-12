import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { CONTENT, speciesName, speciesOf, speciesOptionOf, spellPicks } from "./content";
import type { ClassContent, OptionContent } from "./contentTypes";

describe("spellPicks", () => {
  it("gives nothing before a class or background is chosen", () => {
    expect(spellPicks({ speciesId: "aasimar" })).toEqual({
      cantrips: [],
      spells: [],
      bonusCantrips: [],
      initiateCantrips: [],
      initiateSpell: [],
    });
  });

  it("takes each class list in order, with the Thaumaturge's extra cantrip", () => {
    const picks = spellPicks({ classId: "cleric", options: { divineOrder: ["thaumaturge"] } });
    expect(picks.cantrips).toEqual(["sacred-flame", "guidance", "toll-the-dead", "light"]);
    expect(picks.spells).toEqual([
      "bless",
      "healing-word",
      "guiding-bolt",
      "cure-wounds",
      "shield-of-faith",
    ]);
  });

  it("skips a cantrip the species already gives", () => {
    const cleric: Answers = {
      classId: "cleric",
      speciesId: "aasimar",
      options: { divineOrder: ["thaumaturge"] },
    };
    // Every Aasimar knows Light, so the next cantrip on the list takes its place.
    expect(spellPicks(cleric).cantrips).toEqual([
      "sacred-flame",
      "guidance",
      "toll-the-dead",
      "thaumaturgy",
    ]);
    // A Wizard's Elf is a High Elf, who knows Prestidigitation, and the Wizard's own cantrips
    // are Fire Bolt and Mage Hand: Magic Initiate (Sage) skips all three.
    const wizard: Answers = { classId: "wizard", speciesId: "elf", backgroundId: "sage" };
    expect(spellPicks(wizard).initiateCantrips).toEqual(["light", "minor-illusion"]);
  });

  it("skips Magic Initiate repeats of the species, the class cantrips and prepared spells", () => {
    const picks = spellPicks({
      classId: "cleric",
      speciesId: "tiefling",
      backgroundId: "acolyte",
      options: { divineOrder: ["thaumaturge"] },
    });
    // Guidance, Sacred Flame, Light and Toll the Dead are class cantrips; Thaumaturgy comes
    // with every Tiefling legacy. Bless, Cure Wounds, Healing Word, Guiding Bolt and Shield of
    // Faith are already prepared.
    expect(picks.initiateCantrips).toEqual(["spare-the-dying", "word-of-radiance"]);
    expect(picks.initiateSpell).toEqual(["sanctuary"]);
  });

  it("gives a non-caster the Magic Initiate spells of its background", () => {
    const picks = spellPicks({ classId: "monk", backgroundId: "guide" });
    expect(picks).toMatchObject({
      cantrips: [],
      spells: [],
      initiateCantrips: ["guidance", "produce-flame"],
      initiateSpell: ["goodberry"],
    });
  });

  it("gives a fighting style's cantrips", () => {
    const picks = spellPicks({
      classId: "paladin",
      options: { fightingStyle: ["blessed-warrior"] },
    });
    expect(picks.bonusCantrips).toEqual(["guidance", "sacred-flame"]);
  });
});

/** Every option pick that changes spells, one at a time, plus no pick at all. */
function spellOptionPicks(cls: ClassContent): Array<Answers["options"]> {
  const out: Array<Answers["options"]> = [undefined];
  for (const g of cls.optionGroups) {
    for (const id of g.choices) {
      const o = CONTENT.options[id];
      if (o?.extraCantrips || o?.grantsCantrips) out.push({ [g.key]: [id] });
    }
  }
  return out;
}

function optionsOf(a: Answers): OptionContent[] {
  return Object.values(a.options ?? {})
    .flat()
    .flatMap((id) => (CONTENT.options[id] ? [CONTENT.options[id]] : []));
}

function classCounts(a: Answers): { cantrips: number; spells: number } {
  const sc = a.classId ? CONTENT.classes[a.classId]?.spellcasting : undefined;
  if (!sc) return { cantrips: 0, spells: 0 };
  const extra = optionsOf(a).reduce((n, o) => n + (o.extraCantrips ?? 0), 0);
  return { cantrips: sc.cantripCount > 0 ? sc.cantripCount + extra : 0, spells: sc.preparedCount };
}

/** How many spells of each kind the class table, options and background promise. */
function expectedCounts(a: Answers): Record<keyof ReturnType<typeof spellPicks>, number> {
  const grant = optionsOf(a).find((o) => o.grantsCantrips)?.grantsCantrips;
  const initiate = a.backgroundId ? CONTENT.backgrounds[a.backgroundId]?.initiate : undefined;
  return {
    ...classCounts(a),
    bonusCantrips: grant?.count ?? 0,
    initiateCantrips: initiate?.cantripCount ?? 0,
    initiateSpell: initiate?.spellCount ?? 0,
  };
}

describe("every character gets full, repeat-free spell lists", () => {
  const characters: Array<[string, Answers]> = [];
  // The species sub-choice follows the class, so class and species cover it.
  for (const cls of Object.values(CONTENT.classes)) {
    for (const sp of Object.values(CONTENT.species)) {
      for (const bg of cls.backgrounds) {
        for (const options of spellOptionPicks(cls)) {
          const a: Answers = {
            classId: cls.id,
            speciesId: sp.id,
            backgroundId: bg,
            ...(options && { options }),
          };
          const species = speciesName(sp, speciesOptionOf(a));
          characters.push([`${cls.id}, ${species}, ${bg} ${JSON.stringify(options)}`, a]);
        }
      }
    }
  }

  it("covers every combination", () => {
    expect(characters.length).toBeGreaterThan(1000);
  });

  it.each(characters)("%s", (_, a) => {
    const picks = spellPicks(a);
    const want = expectedCounts(a);
    expect(picks.cantrips).toHaveLength(want.cantrips);
    expect(picks.spells).toHaveLength(want.spells);
    expect(picks.bonusCantrips).toHaveLength(want.bonusCantrips);
    expect(picks.initiateCantrips).toHaveLength(want.initiateCantrips);
    expect(picks.initiateSpell).toHaveLength(want.initiateSpell);

    const cantrips = [
      ...(speciesOf(a)?.cantrips ?? []),
      ...(speciesOptionOf(a)?.cantrips ?? []),
      ...picks.cantrips,
      ...picks.bonusCantrips,
      ...picks.initiateCantrips,
    ];
    expect(new Set(cantrips).size).toBe(cantrips.length);
    expect(picks.spells).not.toContain(picks.initiateSpell[0]);
  });
});
