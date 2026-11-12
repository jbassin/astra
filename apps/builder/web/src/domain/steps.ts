// Where a player is in the flow. `stepStatuses` says, for every step, whether it applies to
// this character, whether it is done and what is still missing; `nextStep` is the first one
// left to do; `pruneAnswers` drops picks an upstream change made invalid. All pure, so the UI
// can call them on every change and the DM page can show the same progress.

import { type Answers, STEPS, type StepKey } from "./character";
import { backgroundsForClass, classesForArchetype, classOf, speciesOf } from "./content";

export interface StepStatus {
  key: StepKey;
  label: string;
  /** False when the step doesn't apply to this character (none is skipped today). */
  applicable: boolean;
  complete: boolean;
  /** A step that has to be answered first, when this one can't be started yet. */
  blockedBy?: StepKey;
  /** What is still missing or wrong, in plain words. Empty when complete. */
  issues: string[];
}

function filled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function statusOf(answers: Answers, key: StepKey): Omit<StepStatus, "key" | "label"> {
  const cls = classOf(answers);
  switch (key) {
    case "archetype":
      return answers.archetype
        ? { applicable: true, complete: true, issues: [] }
        : { applicable: true, complete: false, issues: ["Pick what kind of hero you want to be."] };
    case "class": {
      if (!answers.archetype)
        return { applicable: true, complete: false, blockedBy: "archetype", issues: [] };
      const ok = cls && classesForArchetype(answers.archetype).some((c) => c.id === cls.id);
      return ok
        ? { applicable: true, complete: true, issues: [] }
        : { applicable: true, complete: false, issues: ["Pick a class."] };
    }
    case "species":
      // The species alone: the builder picks its sub-choice from the class.
      return speciesOf(answers)
        ? { applicable: true, complete: true, issues: [] }
        : { applicable: true, complete: false, issues: ["Pick a species."] };
    case "background": {
      if (!cls) return { applicable: true, complete: false, blockedBy: "class", issues: [] };
      const ok = backgroundsForClass(answers).some((b) => b.id === answers.backgroundId);
      return ok
        ? { applicable: true, complete: true, issues: [] }
        : { applicable: true, complete: false, issues: ["Pick a background."] };
    }
    case "name":
      return filled(answers.name)
        ? { applicable: true, complete: true, issues: [] }
        : { applicable: true, complete: false, issues: ["Give your character a name."] };
    case "look":
      return filled(answers.look)
        ? { applicable: true, complete: true, issues: [] }
        : {
            applicable: true,
            complete: false,
            issues: ["Describe what your character looks like."],
          };
    case "personality":
      return filled(answers.personality)
        ? { applicable: true, complete: true, issues: [] }
        : {
            applicable: true,
            complete: false,
            issues: ["Say a little about your character's personality."],
          };
  }
}

/** Every step in flow order, with whether it applies, whether it's done and what's missing. */
export function stepStatuses(answers: Answers): StepStatus[] {
  return STEPS.map((s) => Object.assign({ key: s.key, label: s.label }, statusOf(answers, s.key)));
}

/** The first applicable step that isn't complete, or `null` when the character is finished. */
export function nextStep(answers: Answers): StepKey | null {
  return stepStatuses(answers).find((s) => s.applicable && !s.complete)?.key ?? null;
}

/** The keys of the complete, applicable steps, in flow order (the DM page's progress). */
export function answeredSteps(answers: Answers): StepKey[] {
  return stepStatuses(answers)
    .filter((s) => s.applicable && s.complete)
    .map((s) => s.key);
}

/** How many steps apply to this character (the DM page's "of N"). */
export function applicableStepCount(answers: Answers): number {
  return stepStatuses(answers).filter((s) => s.applicable).length;
}

/**
 * Drops choices that an upstream answer made invalid, and returns a new object (the input is
 * not changed).
 *
 * - a class the archetype doesn't offer is cleared;
 * - a background the class can't take is cleared.
 *
 * Spells, class options and the species sub-choice are never answers: the builder chooses them
 * (`spellPicks`, `chosenOptions` and `speciesOptionOf` in content.ts).
 */
export function pruneAnswers(answers: Answers): Answers {
  const next: Answers = { ...answers };

  if (next.classId && !classesForArchetype(next.archetype).some((c) => c.id === next.classId)) {
    delete next.classId;
  }
  const cls = classOf(next);
  if (cls && next.backgroundId && !cls.backgrounds.includes(next.backgroundId)) {
    delete next.backgroundId;
  }
  return next;
}
