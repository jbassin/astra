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
      speciesOption: "wood-elf",
      backgroundId: "acolyte",
      options: { divineOrder: ["thaumaturge"] },
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
    ["an unknown option group", { options: { subclass: ["x"] } }],
    ["a spell pick (the builder chooses spells)", { cantrips: ["fire-bolt"] }],
    ["a malformed id", { options: { fightingStyle: ["Defense"] } }],
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
    expect(status({}, "options")).toMatchObject({ applicable: true, blockedBy: "class" });
    expect(status({}, "spells")).toBeUndefined();
    expect(applicableStepCount({})).toBe(8);
  });

  it("skips class choices for a Barbarian", () => {
    const a: Answers = { archetype: "warrior", classId: "barbarian" };
    expect(status(a, "options")).toMatchObject({ applicable: false });
    expect(applicableStepCount(a)).toBe(7);
    expect(nextStep(a)).toBe("species");
  });

  it("asks for the species sub-choice", () => {
    expect(status({ speciesId: "elf" }, "species")?.issues).toEqual(["Pick your elven lineage."]);
    expect(status({ speciesId: "elf", speciesOption: "drow" }, "species")?.complete).toBe(true);
    expect(status({ speciesId: "human" }, "species")?.complete).toBe(true);
  });

  it("finishes when every applicable step is answered", () => {
    const a: Answers = {
      archetype: "warrior",
      classId: "fighter",
      speciesId: "human",
      backgroundId: "soldier",
      options: { fightingStyle: ["defense"] },
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
      "options",
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
    speciesOption: "infernal",
    backgroundId: "acolyte",
    options: { divineOrder: ["thaumaturge"] },
  };

  it("keeps a consistent character as it is, without changing the input", () => {
    const before = structuredClone(cleric);
    expect(pruneAnswers(cleric, cleric)).toEqual(cleric);
    expect(cleric).toEqual(before);
  });

  it("clears class picks when the class changes", () => {
    const next = pruneAnswers({ ...cleric, classId: "paladin" }, cleric);
    expect(next.classId).toBe("paladin");
    expect(next.options).toBeUndefined();
    // Acolyte doesn't list Strength, so the Paladin can't keep it.
    expect(next.backgroundId).toBeUndefined();
  });

  it("clears the class when the archetype no longer offers it", () => {
    const next = pruneAnswers({ ...cleric, archetype: "mage" }, cleric);
    expect(next.classId).toBeUndefined();
    expect(next.options).toBeUndefined();
  });

  it("clears the sub-choice when the species changes", () => {
    expect(pruneAnswers({ ...cleric, speciesId: "elf" }, cleric).speciesOption).toBeUndefined();
    expect(pruneAnswers({ ...cleric, speciesOption: "drow" }).speciesOption).toBeUndefined();
  });

  it("drops option picks past the count", () => {
    expect(
      pruneAnswers({ ...cleric, options: { divineOrder: ["protector", "thaumaturge"] } }).options,
    ).toEqual({
      divineOrder: ["protector"],
    });
  });
});
