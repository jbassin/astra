import { describe, expect, it } from "vitest";

import { type Answers, CharacterDoc } from "./character";
import { type SpellPickList, spellPickLists, unavailableSpellIds } from "./content";
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
      cantrips: ["guidance", "sacred-flame", "light", "toll-the-dead"],
      spells: ["bless", "healing-word", "guiding-bolt", "cure-wounds", "shield-of-faith"],
      initiateCantrips: ["thaumaturgy", "spare-the-dying"],
      initiateSpell: "sanctuary",
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
    ["a malformed id", { cantrips: ["Fire Bolt"] }],
    ["too many spells", { spells: Array.from({ length: 9 }, (_, i) => `s${i}`) }],
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
    expect(status({}, "spells")).toMatchObject({ applicable: true, blockedBy: "class" });
    expect(applicableStepCount({})).toBe(9);
  });

  it("skips class choices and spells for a Barbarian", () => {
    const a: Answers = { archetype: "warrior", classId: "barbarian" };
    expect(status(a, "options")).toMatchObject({ applicable: false });
    expect(status(a, "spells")).toMatchObject({ applicable: false });
    expect(applicableStepCount(a)).toBe(7);
    expect(nextStep(a)).toBe("species");
  });

  it("gives a non-caster spells when the background is Magic Initiate", () => {
    // Guide (Dexterity, Constitution, Wisdom) is open to a Monk and teaches Druid magic.
    const a: Answers = { archetype: "warrior", classId: "monk", backgroundId: "guide" };
    expect(status(a, "spells")).toMatchObject({ applicable: true, complete: false });
    expect(status(a, "spells")?.issues).toEqual([
      "Pick 2 for Magic Initiate cantrips (0 so far).",
      "Pick 1 for Magic Initiate level 1 spell (0 so far).",
    ]);
  });

  it("lists the spells a Magic Initiate Monk picks", () => {
    const lists: SpellPickList[] = spellPickLists({ classId: "monk", backgroundId: "guide" });
    expect(lists.map((l) => [l.field, l.count])).toEqual([
      ["initiateCantrips", 2],
      ["initiateSpell", 1],
    ]);
  });

  it("asks for the species sub-choice", () => {
    expect(status({ speciesId: "elf" }, "species")?.issues).toEqual(["Pick your elven lineage."]);
    expect(status({ speciesId: "elf", speciesOption: "drow" }, "species")?.complete).toBe(true);
    expect(status({ speciesId: "human" }, "species")?.complete).toBe(true);
  });

  it("counts a Thaumaturge's extra cantrip", () => {
    const a: Answers = {
      archetype: "healer",
      classId: "cleric",
      options: { divineOrder: ["thaumaturge"] },
      cantrips: ["guidance", "sacred-flame", "light"],
    };
    expect(status(a, "spells")?.issues).toContain("Pick 4 for Cleric cantrips (3 so far).");
  });

  it("flags Agonizing Blast without a damage cantrip", () => {
    const a: Answers = {
      archetype: "mage",
      classId: "warlock",
      options: { invocations: ["agonizing-blast", "eldritch-mind", "mask-of-many-faces"] },
      cantrips: ["prestidigitation", "mage-hand"],
      spells: ["hex", "charm-person", "expeditious-retreat"],
    };
    expect(status(a, "options")?.complete).toBe(true);
    expect(status(a, "spells")?.issues).toEqual([
      "Agonizing Blast needs a cantrip that deals damage, such as Eldritch Blast.",
    ]);
    expect(status({ ...a, cantrips: ["eldritch-blast", "mage-hand"] }, "spells")?.complete).toBe(
      true,
    );
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
    cantrips: ["guidance", "sacred-flame", "light", "toll-the-dead"],
    spells: ["bless", "healing-word", "guiding-bolt", "cure-wounds", "shield-of-faith"],
    initiateCantrips: ["spare-the-dying", "word-of-radiance"],
    initiateSpell: "sanctuary",
  };

  it("keeps a consistent character as it is, without changing the input", () => {
    const before = structuredClone(cleric);
    expect(pruneAnswers(cleric, cleric)).toEqual(cleric);
    expect(cleric).toEqual(before);
  });

  it("clears class picks when the class changes, even to one with the same spells", () => {
    const next = pruneAnswers({ ...cleric, classId: "paladin" }, cleric);
    expect(next.classId).toBe("paladin");
    expect(next.options).toBeUndefined();
    expect(next.cantrips).toBeUndefined();
    expect(next.spells).toBeUndefined();
    // Acolyte doesn't list Strength, so the Paladin can't keep it, nor its Magic Initiate picks.
    expect(next.backgroundId).toBeUndefined();
    expect(next.initiateCantrips).toBeUndefined();
    expect(next.initiateSpell).toBeUndefined();
  });

  it("clears the class when the archetype no longer offers it", () => {
    const next = pruneAnswers({ ...cleric, archetype: "mage" }, cleric);
    expect(next.classId).toBeUndefined();
    expect(next.cantrips).toBeUndefined();
  });

  it("clears the sub-choice when the species changes", () => {
    expect(pruneAnswers({ ...cleric, speciesId: "elf" }, cleric).speciesOption).toBeUndefined();
    expect(pruneAnswers({ ...cleric, speciesOption: "drow" }).speciesOption).toBeUndefined();
  });

  it("drops the extra cantrip when the order no longer gives one", () => {
    const next = pruneAnswers({ ...cleric, options: { divineOrder: ["protector"] } }, cleric);
    expect(next.cantrips).toEqual(["guidance", "sacred-flame", "light"]);
  });

  it("drops picks the shortlist doesn't offer and extra picks past the count", () => {
    const next = pruneAnswers({
      ...cleric,
      spells: [...(cleric.spells ?? []), "bane", "magic-missile"],
    });
    expect(next.spells).toEqual(cleric.spells);
    expect(
      pruneAnswers({ ...cleric, options: { divineOrder: ["protector", "thaumaturge"] } }).options,
    ).toEqual({
      divineOrder: ["protector"],
    });
  });

  it("drops repeats of cantrips and spells the character already has", () => {
    const next = pruneAnswers({
      ...cleric,
      speciesOption: "chthonic",
      initiateCantrips: ["guidance", "thaumaturgy"],
      initiateSpell: "bless",
    });
    // Guidance is already a class cantrip; Thaumaturgy comes with every Tiefling legacy.
    expect(next.initiateCantrips).toEqual([]);
    expect(next.initiateSpell).toBeUndefined();
    expect(unavailableSpellIds(next, "initiateCantrips")).toEqual([
      "thaumaturgy",
      "chill-touch",
      "guidance",
      "sacred-flame",
      "light",
      "toll-the-dead",
    ]);
  });
});
