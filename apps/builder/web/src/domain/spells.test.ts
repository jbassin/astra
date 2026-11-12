import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import {
  CONTENT,
  chosenOptions,
  speciesName,
  speciesOf,
  speciesOptionOf,
  spellPicks,
} from "./content";
import type { ClassContent } from "./contentTypes";
import { type Shortlist, withShortlist } from "./testShortlist";

const ids = (a: Answers) => chosenOptions(a).map((o) => o.id);

describe("chosenOptions", () => {
  it("gives nothing before a class is picked, and nothing to a class with no options", () => {
    expect(chosenOptions({})).toEqual([]);
    expect(chosenOptions({ classId: "barbarian" })).toEqual([]);
  });

  it("gives a Warlock the first three invocations without any answer", () => {
    expect(ids({ classId: "warlock" })).toEqual([
      "agonizing-blast",
      "repelling-blast",
      "armor-of-shadows",
    ]);
  });

  it("gives a Cleric the Thaumaturge and so one extra cantrip", () => {
    expect(ids({ classId: "cleric" })).toEqual(["thaumaturge"]);
    expect(spellPicks({ classId: "cleric" }).cantrips).toHaveLength(
      (CONTENT.classes.cleric.spellcasting?.cantripCount ?? 0) + 1,
    );
  });

  it("follows the shortlist's order, so reordering a list changes the pick", () => {
    withShortlist("cleric", { divineOrder: ["protector"] }, () => {
      expect(ids({ classId: "cleric" })).toEqual(["protector"]);
      expect(spellPicks({ classId: "cleric" }).cantrips).toHaveLength(
        CONTENT.classes.cleric.spellcasting?.cantripCount ?? 0,
      );
    });
    expect(ids({ classId: "cleric" })).toEqual(["thaumaturge"]);
  });

  it("restores the lists even when the callback throws", () => {
    expect(() =>
      withShortlist("fighter", { fightingStyle: ["great-weapon-fighting"] }, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(ids({ classId: "fighter" })).toEqual(["defense"]);
  });
});

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
    const picks = spellPicks({ classId: "cleric" });
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
    const cleric: Answers = { classId: "cleric", speciesId: "aasimar" };
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
    const picks = withShortlist("paladin", { fightingStyle: ["blessed-warrior"] }, () =>
      spellPicks({ classId: "paladin" }),
    );
    expect(picks.bonusCantrips).toEqual(["guidance", "sacred-flame"]);
  });
});

/** The shortlists that change spells, one at a time, plus the shipped one (`undefined`). */
function spellShortlists(cls: ClassContent): Array<Shortlist | undefined> {
  const out: Array<Shortlist | undefined> = [undefined];
  for (const g of cls.optionGroups) {
    for (const id of g.choices) {
      const o = CONTENT.options[id];
      if (o?.extraCantrips || o?.grantsCantrips) out.push({ [g.key]: [id] });
    }
  }
  return out;
}

function classCounts(a: Answers): { cantrips: number; spells: number } {
  const sc = a.classId ? CONTENT.classes[a.classId]?.spellcasting : undefined;
  if (!sc) return { cantrips: 0, spells: 0 };
  const extra = chosenOptions(a).reduce((n, o) => n + (o.extraCantrips ?? 0), 0);
  return { cantrips: sc.cantripCount > 0 ? sc.cantripCount + extra : 0, spells: sc.preparedCount };
}

/** How many spells of each kind the class table, options and background promise. */
function expectedCounts(a: Answers): Record<keyof ReturnType<typeof spellPicks>, number> {
  const grant = chosenOptions(a).find((o) => o.grantsCantrips)?.grantsCantrips;
  const initiate = a.backgroundId ? CONTENT.backgrounds[a.backgroundId]?.initiate : undefined;
  return {
    ...classCounts(a),
    bonusCantrips: grant?.count ?? 0,
    initiateCantrips: initiate?.cantripCount ?? 0,
    initiateSpell: initiate?.spellCount ?? 0,
  };
}

describe("every character gets full, repeat-free spell lists", () => {
  const characters: Array<[string, Answers, Shortlist | undefined]> = [];
  // The species sub-choice follows the class, so class and species cover it. Each class runs with
  // its shipped option picks and with every option that changes spells moved to the front.
  for (const cls of Object.values(CONTENT.classes)) {
    for (const sp of Object.values(CONTENT.species)) {
      for (const bg of cls.backgrounds) {
        for (const shortlist of spellShortlists(cls)) {
          const a: Answers = { classId: cls.id, speciesId: sp.id, backgroundId: bg };
          const species = speciesName(sp, speciesOptionOf(a));
          characters.push([
            `${cls.id}, ${species}, ${bg} ${JSON.stringify(shortlist)}`,
            a,
            shortlist,
          ]);
        }
      }
    }
  }

  it("covers every combination", () => {
    expect(characters.length).toBeGreaterThan(1000);
  });

  it.each(characters)("%s", (_, a, shortlist) => {
    const check = () => {
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
    };
    if (a.classId && shortlist) withShortlist(a.classId, shortlist, check);
    else check();
  });
});
