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
      about: "todo",
      sheet: "todo",
    });
    expect(viewStatuses({}).find((v) => v.key === "class")?.blockedBy).toBe("archetype");
  });

  it("lists no class choices screen, for any class", () => {
    expect(viewStatuses({}).map((v) => v.key)).toEqual([
      "archetype",
      "class",
      "species",
      "background",
      "about",
      "sheet",
    ]);
    const a: Answers = { archetype: "warrior", classId: "fighter" };
    expect(viewStatuses(a).map((v) => v.key)).not.toContain("options");
    expect(startView({ ...a, speciesId: "human", backgroundId: "soldier" })).toBe("about");
  });

  it("marks About you done only when name, look and personality are all filled", () => {
    expect(state({ name: "Ada", look: "Tall." }).about).toBe("todo");
    expect(state({ name: "Ada", look: "Tall.", personality: "Kind." }).about).toBe("done");
  });
});

describe("moving through the flow", () => {
  it("goes from Background straight to About you, whatever the class", () => {
    for (const classId of ["fighter", "barbarian", "warlock"] as const) {
      const a: Answers = { archetype: "warrior", classId, backgroundId: "soldier" };
      expect(viewAfter(a, "background")).toBe("about");
      expect(viewBefore(a, "about")).toBe("background");
    }
  });

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

  it("has no screen before the first or after the sheet", () => {
    const barbarian = { archetype: "warrior", classId: "barbarian" } as const;
    expect(viewBefore(barbarian, "archetype")).toBeUndefined();
    expect(viewAfter(barbarian, "about")).toBe("sheet");
  });
});

describe("clearedSummary", () => {
  it("names what a class change cleared", () => {
    const before: Answers = { archetype: "healer", classId: "cleric", backgroundId: "acolyte" };
    const merged: Answers = { ...before, classId: "paladin" };
    expect(clearedSummary(merged, pruneAnswers(merged))).toBe(
      "That change cleared your background. Pick again when you get there.",
    );
  });

  it("names a cleared class, and says nothing when nothing was cleared", () => {
    const before: Answers = { archetype: "warrior", classId: "fighter", backgroundId: "soldier" };
    const merged: Answers = { ...before, archetype: "mage" };
    expect(clearedSummary(merged, pruneAnswers(merged))).toBe(
      "That change cleared your class. Pick again when you get there.",
    );
    expect(clearedSummary(before, pruneAnswers(before))).toBeNull();
  });
});
