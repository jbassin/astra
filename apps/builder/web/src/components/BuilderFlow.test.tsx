// The flow, driven like a player: pick a whole character through to the sheet, change an
// earlier answer, and check what is (and isn't) preselected. `persist` is a spy, so these
// tests also see every answer the page would save.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Answers } from "@/domain/character";

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

/** The pick lists: fieldsets (a card's "full rules" disclosure is a group too). */
function lists(): HTMLElement[] {
  return screen.getAllByRole("group").filter((g) => g.tagName === "FIELDSET");
}

/** In every group with a "Pick N" counter, picks the first N choices that are still open. */
function pickEveryList() {
  for (const group of lists()) {
    const n = Number(/Pick (\d+)/.exec(group.textContent ?? "")?.[1] ?? 0);
    for (let i = 0; i < n; i++) {
      const open = [...group.querySelectorAll("input")].find((el) => !el.checked && !el.disabled);
      if (open) fireEvent.click(open);
    }
  }
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
    next();
    choose("radio", /^Fighter/);
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

  it("walks a Wizard through every spell list, Magic Initiate included", () => {
    const { last } = renderFlow();
    choose("radio", /^Mage/);
    next();
    choose("radio", /^Wizard/);
    next();
    choose("radio", /^Elf/);
    choose("radio", /^High Elf/);
    next();
    choose("radio", /^Sage/);
    next();
    expect(heading()).toBe("Pick your spells"); // a Wizard has no class choices screen
    expect(lists().map((g) => g.querySelector("legend")?.textContent)).toEqual([
      "Wizard cantrips",
      "Prepared level 1 spells",
      "Magic Initiate cantrips",
      "Magic Initiate level 1 spell",
    ]);
    pickEveryList();
    expect(screen.getAllByText(/Pick \d+ · \d+ picked/).map((el) => el.textContent)).toEqual([
      "Pick 3 · 3 picked",
      "Pick 5 · 5 picked",
      "Pick 2 · 2 picked",
      "Pick 1 · 1 picked",
    ]);
    next();
    fillAbout();
    next();
    expect(screen.queryByText("Still to choose")).toBeNull();
    expect(screen.getByText("Your spells")).toBeTruthy();
    expect(last().initiateSpell).toBeTruthy();
  });
});

describe("changing an earlier answer", () => {
  it("clears a Cleric's picks when the class changes, and says so", () => {
    renderFlow({
      archetype: "healer",
      classId: "cleric",
      options: { divineOrder: ["protector"] },
      cantrips: ["guidance"],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Class \(/ }));
    choose("radio", /^Paladin/);
    expect(
      screen.getByText(/That change cleared your class choices and your spells\./),
    ).toBeTruthy();
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
  it("marks recommended spells and preselects nothing", () => {
    renderFlow({ archetype: "mage", classId: "wizard" });
    fireEvent.click(screen.getByRole("button", { name: /^Spells/ }));
    expect(screen.getAllByText("Recommended").length).toBeGreaterThan(0);
    const inputs = screen.getAllByRole("checkbox");
    expect(inputs.some((el) => el instanceof HTMLInputElement && el.checked)).toBe(false);
  });

  it("shows class options with no recommendation and nothing picked", () => {
    renderFlow({ archetype: "warrior", classId: "fighter" });
    fireEvent.click(screen.getByRole("button", { name: /^Class choices/ }));
    expect(screen.queryByText("Recommended")).toBeNull();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(1);
    expect(radios.some((el) => el instanceof HTMLInputElement && el.checked)).toBe(false);
  });

  it("shows a spell's full rules without picking it", () => {
    const { persist } = renderFlow({ archetype: "mage", classId: "wizard" });
    fireEvent.click(screen.getByRole("button", { name: /^Spells/ }));
    const more = screen.getAllByText(/^Read the full rules: /)[0];
    if (!more) throw new Error("no full-rules disclosure");
    fireEvent.click(more);
    const input = more.closest(".choice")?.querySelector("input");
    expect(input?.checked).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("greys out a cantrip the species already teaches, with the reason", () => {
    renderFlow({
      archetype: "mage",
      classId: "wizard",
      speciesId: "elf",
      speciesOption: "high-elf",
    });
    fireEvent.click(screen.getByRole("button", { name: /^Spells/ }));
    const taken = screen.getAllByText("You already know this one.");
    expect(taken.length).toBeGreaterThan(0);
    const input = taken[0]?.closest("label")?.querySelector("input");
    expect(input?.disabled).toBe(true);
  });
});
