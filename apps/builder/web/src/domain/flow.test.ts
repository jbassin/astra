import { describe, expect, it } from "vitest";

import type { Answers } from "./character";
import { clearedSummary, startView, viewAfter, viewBefore, viewStatuses } from "./flow";
import { pruneAnswers } from "./steps";

const state = (answers: Parameters<typeof viewStatuses>[0]) =>
  Object.fromEntries(viewStatuses(answers).map((v) => [v.key, v.applicable ? v.state : "n/a"]));

describe("viewStatuses", () => {
  it("blocks the screens that need a class until there is one", () => {
    expect(state({})).toMatchObject({
      archetype: "todo",
      class: "blocked",
      species: "todo",
      background: "blocked",
      options: "blocked",
      about: "todo",
      sheet: "todo",
    });
    expect(viewStatuses({}).find((v) => v.key === "class")?.blockedBy).toBe("archetype");
  });

  it("drops the screens a class doesn't have (a Barbarian has no class choices)", () => {
    expect(state({ archetype: "warrior", classId: "barbarian" })).toMatchObject({
      class: "done",
      options: "n/a",
    });
  });

  it("marks About you done only when name, look and personality are all filled", () => {
    expect(state({ name: "Ada", look: "Tall." }).about).toBe("todo");
    expect(state({ name: "Ada", look: "Tall.", personality: "Kind." }).about).toBe("done");
  });
});

describe("moving through the flow", () => {
  it("resumes at the first screen with something left to do", () => {
    expect(startView({})).toBe("archetype");
    expect(startView({ archetype: "mage" })).toBe("class");
    const done = {
      archetype: "warrior",
      classId: "barbarian",
      speciesId: "human",
      backgroundId: "soldier",
      name: "Ada",
      look: "Tall.",
      personality: "Kind.",
    } as const;
    expect(startView(done)).toBe("sheet");
  });

  it("skips screens that don't apply in both directions", () => {
    const barbarian = { archetype: "warrior", classId: "barbarian" } as const;
    expect(viewAfter(barbarian, "background")).toBe("about");
    expect(viewBefore(barbarian, "about")).toBe("background");
    expect(viewBefore(barbarian, "archetype")).toBeUndefined();
    expect(viewAfter(barbarian, "about")).toBe("sheet");
  });
});

describe("clearedSummary", () => {
  it("names what a class change cleared", () => {
    const before: Answers = {
      archetype: "mage",
      classId: "sorcerer",
      options: { metamagic: ["quickened-spell", "distant-spell"] },
    };
    const merged: Answers = { ...before, classId: "warlock" };
    const after = pruneAnswers(merged, before);
    expect(clearedSummary(merged, after)).toBe(
      "That change cleared your class choices. Pick again when you get there.",
    );
  });

  it("lists several things, and says nothing when nothing was cleared", () => {
    const before: Answers = {
      archetype: "warrior",
      classId: "fighter",
      backgroundId: "soldier",
      options: { fightingStyle: ["defense"] },
    };
    const merged: Answers = { ...before, archetype: "mage" };
    expect(clearedSummary(merged, pruneAnswers(merged, before))).toBe(
      "That change cleared your class and your class choices. Pick again when you get there.",
    );
    expect(clearedSummary(before, pruneAnswers(before, before))).toBeNull();
  });
});
