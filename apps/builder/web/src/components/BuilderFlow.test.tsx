// The flow, driven like a player: pick a whole character through to the sheet, change an
// earlier answer, and check what is (and isn't) preselected. `persist` is a spy, so these
// tests also see every answer the page would save.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Answers, PlayState } from "@/domain/character";
import { backgroundsForClass, CONTENT } from "@/domain/content";

import { BuilderFlow } from "./BuilderFlow";

afterEach(cleanup);

function renderFlow(initial: Answers = {}) {
  const persist = vi.fn<(v: { answers: Answers; play: PlayState }) => void>();
  render(<BuilderFlow initial={initial} persist={persist} title="Hi" intro="Intro" />);
  const last = (): Answers => persist.mock.lastCall?.[0].answers ?? initial;
  return { persist, last };
}

function choose(role: "radio" | "checkbox", name: RegExp) {
  fireEvent.click(screen.getByRole(role, { name }));
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
}

function heading(): string {
  return screen.getByRole("heading", { level: 2 }).textContent ?? "";
}

/** How many `<details>` fold-outs the screen has (the choice screens have none). */
function foldOuts(): number {
  return screen.getByRole("main").querySelectorAll("details").length;
}

function fillAbout() {
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ada" } });
  fireEvent.change(screen.getByRole("textbox", { name: /look like/ }), {
    target: { value: "Tall." },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /What are they like/ }), {
    target: { value: "Kind." },
  });
}

describe("picking a whole character", () => {
  it("walks a Fighter through every screen to a finished sheet", () => {
    const { last } = renderFlow();
    expect(heading()).toMatch(/kind of hero/);
    choose("radio", /^Warrior/);
    expect(foldOuts()).toBe(0);
    next();
    choose("radio", /^Fighter/);
    expect(foldOuts()).toBe(0);
    next();
    choose("radio", /^Human/);
    next();
    choose("radio", /^Soldier/);
    next();
    // No class choices screen and no spells screen: the builder picks both.
    expect(heading()).toBe("Tell us about your hero");
    fillAbout();
    next();
    expect(heading()).toBe("Your character sheet");
    expect(screen.getByText("On your turn")).toBeTruthy();
    expect(screen.getAllByText(/Roll a d20 \+ \d+ to hit\./).length).toBeGreaterThan(0);
    expect(last()).toMatchObject({ classId: "fighter" });
    expect(Object.keys(last())).not.toContain("options");
  });

  it("walks a Wizard straight from background to About you, spells chosen for them", () => {
    const { last } = renderFlow();
    choose("radio", /^Mage/);
    next();
    choose("radio", /^Wizard/);
    next();
    // One pick: the Elf card already names the lineage the builder gives a Wizard.
    choose("radio", /^High Elf/);
    next();
    choose("radio", /^Sage/);
    next();
    // Nobody has a class choices or a spells screen.
    expect(heading()).toBe("Tell us about your hero");
    fillAbout();
    next();
    expect(screen.queryByText("Still to choose")).toBeNull();
    expect(screen.getByText("Level 2 High Elf Wizard")).toBeTruthy();
    expect(last()).toMatchObject({ classId: "wizard", speciesId: "elf" });
    expect(screen.getByText("Your spells")).toBeTruthy();
    expect(screen.getAllByText("Magic Missile").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Magic Initiate spells").length).toBeGreaterThan(0);
    expect(Object.keys(last())).not.toContain("cantrips");
  });
});

describe("changing an earlier answer", () => {
  it("clears a background the new class can't take when the class changes, and says so", () => {
    renderFlow({ archetype: "healer", classId: "cleric", backgroundId: "acolyte" });
    fireEvent.click(screen.getByRole("button", { name: /^Class \(/ }));
    choose("radio", /^Paladin/);
    expect(screen.getByText(/That change cleared your background\./)).toBeTruthy();
  });

  it("resumes at the first unfinished screen and marks the rail", () => {
    renderFlow({ archetype: "warrior", classId: "barbarian" });
    expect(heading()).toBe("Pick your species");
    const rail = screen.getByRole("navigation", { name: "Steps" });
    expect(within(rail).getByRole("button", { name: /Class \(done\)/ })).toBeTruthy();
    expect(within(rail).getByRole("button", { name: /Species \(to do\)/ })).toBeTruthy();
    expect(within(rail).queryByRole("button", { name: /Spells/ })).toBeNull();
  });
});

describe("what the player sees on the pick screens", () => {
  it("has no class choices screen: a Fighter goes from Background to About you", () => {
    renderFlow({ archetype: "warrior", classId: "fighter", speciesId: "human" });
    choose("radio", /^Soldier/);
    expect(screen.queryByRole("button", { name: /^Class choices/ })).toBeNull();
    next();
    expect(heading()).toBe("Tell us about your hero");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toBe("Pick your background");
  });

  it("names each species for the player's class, with no second pick and nothing to open", () => {
    renderFlow({ archetype: "mage", classId: "wizard" });
    expect(heading()).toBe("Pick your species");
    expect(screen.getByRole("radio", { name: /^High Elf/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Brass Dragonborn/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Goliath/ })).toBeTruthy();
    choose("radio", /^High Elf/);
    // Still the ten species and nothing else: no lineage list, no "what it gives you".
    expect(screen.getAllByRole("radio")).toHaveLength(Object.keys(CONTENT.species).length);
    expect(foldOuts()).toBe(0);
  });

  it("names the plain species until a class is picked", () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /^Species \(/ }));
    expect(screen.getByRole("radio", { name: /^Elf/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /^High Elf/ })).toBeNull();
  });

  it("shows a background as its name and story, with no talent text", () => {
    const fighter: Answers = { archetype: "warrior", classId: "fighter", speciesId: "human" };
    renderFlow(fighter);
    expect(heading()).toBe("Pick your background");
    const backgrounds = backgroundsForClass(fighter);
    expect(backgrounds.length).toBeGreaterThan(1);
    for (const b of backgrounds) {
      const card = screen.getByRole("radio", { name: new RegExp(`^${b.name}`) }).closest("label");
      expect(card?.textContent).toBe(`${b.name}${b.story}`);
    }
    expect(screen.queryByText(/Special talent/)).toBeNull();
    expect(foldOuts()).toBe(0);
  });

  it("folds the greeting away once the player moves on, and back on the first screen", () => {
    renderFlow();
    const main = screen.getByRole("main");
    expect(main.hasAttribute("data-compact")).toBe(false);
    choose("radio", /^Warrior/);
    next();
    expect(main.hasAttribute("data-compact")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(main.hasAttribute("data-compact")).toBe(false);
  });
});
