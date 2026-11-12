import { describe, expect, it } from "vitest";

import { type Answers, CharacterDoc } from "./character";
import {
  answeredSteps,
  applicableStepCount,
  nextStep,
  pruneAnswers,
  type StepStatus,
  stepStatuses,
} from "./steps";

const status = (answers: Answers, key: string): StepStatus | undefined =>
  stepStatuses(answers).find((s) => s.key === key);

describe("the Answers schema", () => {
  it("still parses a slice 1 document", () => {
    const doc = {
      schemaVersion: 1,
      updatedAt: "2026-11-06T12:00:00.000Z",
      answers: { archetype: "mage", name: "Ada", look: "Tall." },
    };
    expect(CharacterDoc.parse(doc)).toEqual(doc);
  });

  it("parses a full set of answers", () => {
    const answers: Answers = {
      archetype: "healer",
      classId: "cleric",
      speciesId: "elf",
      backgroundId: "acolyte",
      name: "Ada",
      look: "Tall.",
      personality: "Kind.",
    };
    expect(
      CharacterDoc.parse({ schemaVersion: 1, updatedAt: "2026-11-06T12:00:00.000Z", answers })
        .answers,
    ).toEqual(answers);
  });

  it.each([
    ["an unknown field", { nickname: "x" }],
    ["an unknown class", { classId: "artificer" }],
    ["class option picks (the builder chooses them)", { options: { fightingStyle: ["defense"] } }],
    ["a spell pick (the builder chooses spells)", { cantrips: ["fire-bolt"] }],
    ["a species sub-choice (the builder picks it from the class)", { speciesOption: "drow" }],
    ["an overlong personality", { personality: "x".repeat(2001) }],
  ])("rejects %s", (_, answers) => {
    const doc = { schemaVersion: 1, updatedAt: "2026-11-06T12:00:00.000Z", answers };
    expect(CharacterDoc.safeParse(doc).success).toBe(false);
  });
});

describe("stepStatuses and nextStep", () => {
  it("starts at the archetype, with later steps waiting on earlier ones", () => {
    expect(nextStep({})).toBe("archetype");
    expect(status({}, "class")).toMatchObject({ complete: false, blockedBy: "archetype" });
    expect(status({}, "options")).toBeUndefined();
    expect(status({}, "spells")).toBeUndefined();
    expect(applicableStepCount({})).toBe(7);
  });

  it("has the same steps for every class, with no class choices step", () => {
    for (const [archetype, classId] of [
      ["warrior", "barbarian"],
      ["warrior", "fighter"],
      ["mage", "warlock"],
    ] as const) {
      const a: Answers = { archetype, classId };
      expect(status(a, "options")).toBeUndefined();
      expect(applicableStepCount(a)).toBe(7);
      expect(nextStep(a)).toBe("species");
    }
  });

  it("completes the species step on the species alone", () => {
    expect(status({}, "species")).toMatchObject({ complete: false, issues: ["Pick a species."] });
    // An Elf has lineages, but the builder picks one from the class: nothing more to answer.
    expect(status({ speciesId: "elf" }, "species")).toMatchObject({ complete: true, issues: [] });
    expect(status({ classId: "wizard", speciesId: "elf" }, "species")?.complete).toBe(true);
    expect(status({ speciesId: "human" }, "species")?.complete).toBe(true);
  });

  it("finishes when every applicable step is answered", () => {
    const a: Answers = {
      archetype: "warrior",
      classId: "fighter",
      speciesId: "human",
      backgroundId: "soldier",
      name: "Brom",
      look: "Big.",
      personality: "Loud.",
    };
    expect(nextStep(a)).toBeNull();
    expect(answeredSteps(a)).toEqual([
      "archetype",
      "class",
      "species",
      "background",
      "name",
      "look",
      "personality",
    ]);
  });
});

describe("pruneAnswers", () => {
  const cleric: Answers = {
    archetype: "healer",
    classId: "cleric",
    speciesId: "tiefling",
    backgroundId: "acolyte",
  };

  it("keeps a consistent character as it is, without changing the input", () => {
    const before = structuredClone(cleric);
    expect(pruneAnswers(cleric)).toEqual(cleric);
    expect(cleric).toEqual(before);
  });

  it("clears a background the new class can't take when the class changes", () => {
    const next = pruneAnswers({ ...cleric, classId: "paladin" });
    expect(next.classId).toBe("paladin");
    // Acolyte doesn't list Strength, so the Paladin can't keep it.
    expect(next.backgroundId).toBeUndefined();
    // The species stays: its sub-choice is derived from the class, so there is nothing to clear.
    expect(next.speciesId).toBe("tiefling");
  });

  it("clears the class when the archetype no longer offers it", () => {
    const next = pruneAnswers({ ...cleric, archetype: "mage" });
    expect(next.classId).toBeUndefined();
  });
});
