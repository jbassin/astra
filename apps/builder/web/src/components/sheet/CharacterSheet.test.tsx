import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Answers } from "@/domain/character";
import { CONTENT } from "@/domain/content";
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
    expect(screen.getByText("Level 2 Orc Barbarian")).toBeTruthy();
    expect(screen.getByText("Soldier background")).toBeTruthy();
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

  it("lists a Cleric's spells by name with the save DC, and a card for each", () => {
    const c = buildCharacter(CLERIC);
    expect(c.missing).toEqual([]);
    render(<CharacterSheet character={c} />);
    const dc = c.spellcasting[0]?.saveDc;
    const dcStat = screen.getAllByText("Spell save DC")[0]?.parentElement;
    expect(dcStat?.textContent).toBe(`Spell save DC${dc}`);
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

describe("CharacterSheet: each thing is described once, on its card", () => {
  it("names a feature on the turn and says what it does on its card alone", () => {
    render(<CharacterSheet character={buildCharacter(BARBARIAN)} />);
    const rage = within(box("Your bonus action")).getByText("Rage").closest("li");
    expect(rage?.textContent).toBe(
      "Rage2 per Long Rest; regain one use when you finish a Short Rest.",
    );
    const always = box("Always on, or when it says");
    expect(within(always).getByText("Reckless Attack").closest("li")?.textContent).toBe(
      "Reckless Attack",
    );
    expect(always.querySelector("details")).toBeNull(); // names only, so no fold
    expect(screen.getAllByText(/fly into a Rage/)).toHaveLength(1);
    expect(screen.getAllByText(/you can attack recklessly/)).toHaveLength(1);
    // No list of features, and no card for what the numbers already show.
    expect(screen.queryByRole("heading", { name: "Features" })).toBeNull();
    for (const name of ["Unarmored Defense", "Weapon Mastery", "Darkvision"])
      expect(screen.queryByRole("heading", { name }), name).toBeNull();
    expect(screen.getByText("Darkvision 120 ft.")).toBeTruthy();
  });

  it("keeps the spells section to names, and puts each spell's gist on its card", () => {
    render(<CharacterSheet character={buildCharacter(CLERIC)} />);
    const block = box("Cleric spells");
    expect(within(block).getByText(/^3 level 1 spell slots/)).toBeTruthy();
    const names = [...block.querySelectorAll(".spell-names li")].map((li) => li.textContent);
    expect(names).toEqual([
      "Sacred Flame",
      "Guidance",
      "Toll the Dead",
      "Light",
      "Bless",
      "Healing Word",
      "Guiding Bolt",
      "Cure Wounds",
      "Shield of Faith",
    ]);
    // No uses, rolls or sentences here: they are on the cards.
    expect(block.textContent).not.toMatch(/Spend a spell slot|As often as you like|Roll a d20/);
    const bless = screen.getByRole("heading", { name: "Bless", level: 5 }).closest("article");
    expect(bless && within(bless).getByText(CONTENT.spells.bless?.gist ?? "")).toBeTruthy();
    expect(bless && within(bless).getByText("Spend a spell slot")).toBeTruthy();
    // Spellcasting and the Protector order show in the numbers and lines, not on cards.
    for (const name of ["Spellcasting", "Protector", "Magic Initiate"])
      expect(screen.queryByRole("heading", { name }), name).toBeNull();
  });
});

describe("CharacterSheet: pressing a name shows its card", () => {
  it("opens the Rage card from the bonus action box, and the close button closes it", () => {
    render(<CharacterSheet character={buildCharacter(BARBARIAN)} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const rage = within(box("Your bonus action")).getByRole("button", { name: "Rage" });
    fireEvent.click(rage);
    const dialog = screen.getByRole("dialog", { name: "Rage" });
    expect(within(dialog).getByRole("heading", { name: "Rage", level: 5 })).toBeTruthy();
    expect(within(dialog).getByText(/fly into a Rage/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(rage);
  });

  it("opens a spell's card from Your spells, and Esc closes it", () => {
    render(<CharacterSheet character={buildCharacter(CLERIC)} />);
    fireEvent.click(within(box("Cleric spells")).getByRole("button", { name: "Bless" }));
    const dialog = screen.getByRole("dialog", { name: "Bless" });
    expect(within(dialog).getByText(CONTENT.spells.bless?.gist ?? "")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a spell from the Cast a spell line, and a click on the backdrop closes it", () => {
    render(<CharacterSheet character={buildCharacter(CLERIC)} />);
    const line = screen.getByText("Cast a spell:").closest("li");
    const first = line && within(line).getAllByRole("button")[0];
    expect(first).toBeTruthy();
    if (first) fireEvent.click(first);
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.querySelector(".card-dialog-backdrop");
    expect(backdrop).toBeTruthy();
    if (backdrop) fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("makes an attack cantrip's name a button, but not a weapon attack's", () => {
    const wizard = buildCharacter({
      archetype: "mage",
      classId: "wizard",
      speciesId: "human",
      backgroundId: "sage",
      ...DONE,
    });
    expect(wizard.missing).toEqual([]);
    const { unmount } = render(<CharacterSheet character={wizard} />);
    const bolt = within(box("Your action")).getByRole("button", { name: "Fire Bolt" });
    fireEvent.click(bolt);
    expect(screen.getByRole("dialog", { name: "Fire Bolt" })).toBeTruthy();
    unmount();
    cleanup();
    render(<CharacterSheet character={buildCharacter(BARBARIAN)} />);
    const action = box("Your action");
    expect(within(action).getByText(/^Greataxe/)).toBeTruthy();
    expect(within(action).queryByRole("button", { name: /Greataxe/ })).toBeNull();
    expect(within(action).queryAllByRole("button")).toEqual([]);
  });

  it("keeps the open card per sheet", () => {
    render(
      <>
        <CharacterSheet character={buildCharacter(BARBARIAN)} />
        <CharacterSheet character={buildCharacter(BARBARIAN)} />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Rage" })[0] as HTMLElement);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
