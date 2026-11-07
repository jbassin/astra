import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Answers } from "@/domain/character";
import { buildCharacter } from "@/domain/engine";

import { CharacterSheet } from "./CharacterSheet";

afterEach(cleanup);

const DONE = { name: "Brakka", look: "Broad.", personality: "Loud." };

const BARBARIAN: Answers = {
  archetype: "warrior",
  classId: "barbarian",
  speciesId: "orc",
  backgroundId: "soldier",
  ...DONE,
};

const CLERIC: Answers = {
  archetype: "healer",
  classId: "cleric",
  speciesId: "human",
  backgroundId: "acolyte",
  options: { divineOrder: ["protector"] },
  cantrips: ["sacred-flame", "guidance", "thaumaturgy"],
  spells: ["cure-wounds", "healing-word", "bless", "shield-of-faith", "guiding-bolt"],
  initiateCantrips: ["light", "spare-the-dying"],
  initiateSpell: "sanctuary",
  ...DONE,
};

function box(title: string): HTMLElement {
  const el = screen.getByRole("heading", { name: title }).parentElement;
  if (!el) throw new Error(`no box ${title}`);
  return el;
}

describe("CharacterSheet", () => {
  it("lays out a Barbarian's turn: attacks, Rage as a bonus action, no spells", () => {
    const c = buildCharacter(BARBARIAN);
    expect(c.missing).toEqual([]);
    render(<CharacterSheet character={c} />);
    expect(screen.getByRole("heading", { name: "Brakka" })).toBeTruthy();
    expect(screen.getByText("Level 2 Orc Barbarian · Soldier background")).toBeTruthy();
    const action = box("Your action");
    const greataxe = c.attacks.find((a) => a.name.startsWith("Greataxe"));
    expect(greataxe).toBeTruthy();
    expect(
      within(action).getByText(
        `Roll a d20 + ${greataxe?.toHit} to hit. On a hit, roll ${greataxe?.damage} Slashing damage.`,
      ),
    ).toBeTruthy();
    expect(within(action).getByText(/^Mastery, Cleave:/)).toBeTruthy();
    expect(within(box("Your bonus action")).getByText("Rage")).toBeTruthy();
    expect(screen.queryByText("Your spells")).toBeNull();
    expect(screen.getByText(String(c.hitPoints.max))).toBeTruthy();
    expect(screen.getAllByRole("article").filter((a) => a.classList.contains("card")).length).toBe(
      c.features.length,
    );
  });

  it("lists a Cleric's spells with their rolls and save DC, and a card for each", () => {
    const c = buildCharacter(CLERIC);
    expect(c.missing).toEqual([]);
    render(<CharacterSheet character={c} />);
    const dc = c.spellcasting[0]?.saveDc;
    expect(screen.getAllByText(new RegExp(`Spell save DC ${dc}`)).length).toBeGreaterThan(0);
    expect(within(box("Your bonus action")).getByText("Healing Word")).toBeTruthy();
    expect(
      screen.getAllByText(
        `The target makes a Dexterity save against DC ${dc}. If it fails, it takes 1d8 Radiant damage.`,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Sanctuary", level: 5 })).toBeTruthy();
    expect(screen.getByText("Things you’re good at")).toBeTruthy();
  });

  it("lists what's left to choose instead of numbers", () => {
    render(<CharacterSheet character={buildCharacter({ archetype: "mage", classId: "wizard" })} />);
    expect(screen.getByText("Still to choose")).toBeTruthy();
    expect(screen.getByText("Pick a species.")).toBeTruthy();
    expect(screen.queryByText("On your turn")).toBeNull();
    expect(screen.queryByText("Hit Points")).toBeNull();
  });
});
