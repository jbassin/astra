// The content join must succeed on the committed import and curation, and must fail loudly on
// the mistakes it exists to catch. Each failing case edits a deep copy of the curation.

import { describe, expect, it } from "vitest";

import { CURATION, type Curation, joinContent, loadImported } from "./build-content";
import { unshownRolls } from "./spell-rolls";

const data = loadImported();

function withCuration(edit: (c: Curation) => void): () => unknown {
  const copy = structuredClone(CURATION);
  edit(copy);
  return () => joinContent(data, copy);
}

/** Drops a curated entry's activation, as a careless edit would. */
function unset(o: object): void {
  Reflect.deleteProperty(o, "activation");
}

function cls(c: Curation, id: string) {
  const found = c.classes.find((x) => x.id === id);
  if (!found) throw new Error(`no class ${id}`);
  return found;
}

describe("joinContent", () => {
  it("joins the committed import and curation", () => {
    const content = joinContent(data);
    expect(Object.keys(content.classes)).toHaveLength(12);
    expect(content.source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("reads level 2 pick counts from the class table", () => {
    const { classes } = joinContent(data);
    expect(classes.cleric.spellcasting).toMatchObject({
      cantripCount: 3,
      preparedCount: 5,
      slots: [3],
    });
    expect(classes.warlock.spellcasting).toMatchObject({
      cantripCount: 2,
      preparedCount: 3,
      slots: [2],
      pactSlotLevel: 1,
    });
    expect(classes.warlock.optionGroups[0]).toMatchObject({ key: "invocations", count: 3 });
    expect(classes.sorcerer.optionGroups[0]).toMatchObject({ key: "metamagic", count: 2 });
    expect(classes.paladin.spellcasting).toMatchObject({ preparedCount: 3, slots: [2] });
    expect(classes.fighter.masteries.count).toBe(3);
    expect(classes.rogue.expertise.count).toBe(2);
    expect(classes.ranger.expertise.count).toBe(1);
    expect(classes.wizard.spellcasting?.spellbookSize).toBe(8);
  });

  it("offers each class only backgrounds that list its primary ability", () => {
    const { classes, backgrounds } = joinContent(data);
    for (const c of Object.values(classes)) {
      for (const b of c.backgrounds) expect(backgrounds[b].abilities).toContain(c.primary);
    }
  });

  it("fails on a feature with no summary", () => {
    expect(withCuration((c) => delete cls(c, "fighter").features["fighter-second-wind"])).toThrow(
      /feature "fighter-second-wind" has no summary/,
    );
  });

  it("fails on a spell that isn't on the class list", () => {
    expect(withCuration((c) => cls(c, "cleric").spells?.level1.push("magic-missile"))).toThrow(
      /"magic-missile" is not on the cleric list/,
    );
  });

  it("fails on a curated id the import doesn't have", () => {
    expect(withCuration((c) => cls(c, "bard").spells?.cantrips?.push("fireball-of-doom"))).toThrow(
      /"fireball-of-doom" is not in the imported data/,
    );
  });

  it("fails on a shortlist smaller than the pick count", () => {
    expect(
      withCuration((c) => {
        const g = cls(c, "warlock").optionGroups?.[0];
        if (g) g.choices = g.choices.slice(0, 3);
      }),
    ).toThrow(/3 choices for 3 picks/);
  });

  it("fails when a species trait has no summary", () => {
    expect(
      withCuration((c) => {
        const elf = c.species.find((s) => s.id === "elf");
        if (elf) delete elf.traits.trance;
      }),
    ).toThrow(/trait "trance" has no summary/);
  });

  it("fails on a shown feature, trait, option or feat with no activation", () => {
    expect(
      withCuration((c) => unset(cls(c, "fighter").features["fighter-second-wind"] ?? {})),
    ).toThrow(/class fighter fighter-second-wind: no activation/);
    expect(
      withCuration((c) => unset(c.species.find((s) => s.id === "elf")?.traits.trance ?? {})),
    ).toThrow(/species elf trance: no activation/);
    expect(withCuration((c) => unset(c.options.protection ?? {}))).toThrow(
      /option protection: no activation/,
    );
    expect(withCuration((c) => unset(c.feats.lucky ?? {}))).toThrow(/feat lucky: no activation/);
  });

  it("fails on a missing or over-long gist on anything a player picks from cards", () => {
    const long = "x".repeat(91);
    expect(
      withCuration((c) => {
        const o = c.options.protection;
        if (o) o.gist = "";
      }),
    ).toThrow(/option protection: no gist/);
    expect(
      withCuration((c) => {
        const s = c.cantrips["fire-bolt"];
        if (s) s.gist = long;
      }),
    ).toThrow(/spell fire-bolt: gist has 91 characters \(max 90\)/);
    expect(
      withCuration((c) => {
        const red = c.species.find((s) => s.id === "dragonborn")?.option?.choices.red;
        if (red) Reflect.deleteProperty(red, "gist");
      }),
    ).toThrow(/species dragonborn red: no gist/);
  });

  it("takes each spell's activation from its 5etools casting time", () => {
    const { spells } = joinContent(data);
    expect(spells["hellish-rebuke"]?.activation).toBe("reaction");
    expect(spells["healing-word"]?.activation).toBe("bonus");
    expect(spells["fire-bolt"]?.activation).toBe("action");
    expect(spells["find-familiar"]?.activation).toBe("minute"); // 1 hour
  });

  it("gives every spell that deals damage or heals its dice", () => {
    const { spells } = joinContent(data);
    expect(spells["hellish-rebuke"]).toMatchObject({
      damage: "2d10",
      damageType: "Fire",
      damageOn: "save",
      halfOnSave: true,
      save: "dex",
    });
    expect(spells["cure-wounds"]).toMatchObject({ healing: "2d8", healingAddsModifier: true });
    expect(spells["magic-missile"]).toMatchObject({ damage: "1d4 + 1", damageOn: "auto" });
    expect(spells["divine-smite"]).toMatchObject({ damage: "2d8", damageOn: "weapon-hit" });
    expect(spells["sacred-flame"]).toMatchObject({ damage: "1d8", damageOn: "save" });
    expect(spells["sacred-flame"]?.halfOnSave).toBeUndefined();
    for (const s of Object.values(spells)) expect(unshownRolls(s), s.id).toEqual([]);
  });

  it("fails when a spell's rules text rolls dice its sheet entry leaves out", () => {
    expect(withCuration((c) => delete c.spellRolls["divine-smite"])).toThrow(
      /spell divine-smite: its rules text rolls 1d8/,
    );
    expect(
      unshownRolls({
        rulesText: ["It makes a Dexterity saving throw, taking 2d10 Fire damage on a failed save."],
      }),
    ).toEqual([expect.stringMatching(/rolls 2d10/)]);
    // Dice that aren't damage or healing (Bless's 1d4) don't count.
    expect(
      unshownRolls({ rulesText: ["The target adds 1d4 to the attack roll or save."] }),
    ).toEqual([]);
  });

  it("fails on a curated spell roll for a spell nobody can pick", () => {
    expect(withCuration((c) => (c.spellRolls.fireball = { note: "Boom." }))).toThrow(
      /spell roll "fireball" .* is never used/,
    );
  });

  it("fails when Magic Initiate cantrips could run out", () => {
    expect(
      withCuration((c) => {
        const sage = c.backgrounds.find((b) => b.id === "sage");
        if (sage?.initiate) sage.initiate.cantrips = sage.initiate.cantrips.slice(0, 4);
      }),
    ).toThrow(/wizard \+ sage: Magic Initiate cantrips can run out/);
  });
});
