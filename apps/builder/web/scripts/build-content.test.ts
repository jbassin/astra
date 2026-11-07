// The content join must succeed on the committed import and curation, and must fail loudly on
// the mistakes it exists to catch. Each failing case edits a deep copy of the curation.

import { describe, expect, it } from "vitest";

import { CURATION, type Curation, joinContent, loadImported } from "./build-content";

const data = loadImported();

function withCuration(edit: (c: Curation) => void): () => unknown {
  const copy = structuredClone(CURATION);
  edit(copy);
  return () => joinContent(data, copy);
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
    expect(
      withCuration((c) => cls(c, "cleric").spells?.level1.push({ id: "magic-missile" })),
    ).toThrow(/"magic-missile" is not on the cleric list/);
  });

  it("fails on a curated id the import doesn't have", () => {
    expect(
      withCuration((c) => cls(c, "bard").spells?.cantrips?.push({ id: "fireball-of-doom" })),
    ).toThrow(/"fireball-of-doom" is not in the imported data/);
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

  it("fails when Magic Initiate cantrips could run out", () => {
    expect(
      withCuration((c) => {
        const sage = c.backgrounds.find((b) => b.id === "sage");
        if (sage?.initiate) sage.initiate.cantrips = sage.initiate.cantrips.slice(0, 5);
      }),
    ).toThrow(/wizard \+ sage: Magic Initiate cantrips can run out/);
  });
});
