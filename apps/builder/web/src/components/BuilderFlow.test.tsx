// The flow, driven like a player: pick a whole character through to the sheet, change an
// earlier answer, and check what is (and isn't) preselected. `persist` is a spy, so these
// tests also see every answer the page would save.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Answers } from "@/domain/character";
import { backgroundsForClass, CONTENT } from "@/domain/content";

import { BuilderFlow } from "./BuilderFlow";

afterEach(cleanup);

function renderFlow(initial: Answers = {}) {
  const persist = vi.fn<(a: Answers) => void>();
  render(<BuilderFlow initial={initial} persist={persist} title="Hi" intro="Intro" />);
  const last = (): Answers => persist.mock.lastCall?.[0] ?? initial;
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
    expect(heading()).toBe("Make your class choices");
    choose("radio", /^Defense/);
    next();
    expect(heading()).toBe("Tell us about your hero"); // a Fighter has no spells screen
    fillAbout();
    next();
    expect(heading()).toBe("Your character sheet");
    expect(screen.getByText("On your turn")).toBeTruthy();
    expect(screen.getAllByText(/Roll a d20 \+ \d+ to hit\./).length).toBeGreaterThan(0);
    expect(last()).toMatchObject({ classId: "fighter", options: { fightingStyle: ["defense"] } });
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
    // A Wizard has no class choices, and nobody has a spells screen.
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
  it("clears a Cleric's class choices when the class changes, and says so", () => {
    renderFlow({
      archetype: "healer",
      classId: "cleric",
      options: { divineOrder: ["protector"] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Class \(/ }));
    choose("radio", /^Paladin/);
    expect(screen.getByText(/That change cleared your class choices\./)).toBeTruthy();
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
  it("shows class options with no recommendation and nothing picked", () => {
    renderFlow({ archetype: "warrior", classId: "fighter" });
    fireEvent.click(screen.getByRole("button", { name: /^Class choices/ }));
    expect(screen.queryByText("Recommended")).toBeNull();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(1);
    expect(radios.some((el) => el instanceof HTMLInputElement && el.checked)).toBe(false);
    expect(foldOuts()).toBe(0);
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
