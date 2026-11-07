// Where a player is in the flow. `stepStatuses` says, for every step, whether it applies to
// this character, whether it is done and what is still missing; `nextStep` is the first one
// left to do; `pruneAnswers` drops picks an upstream change made invalid. All pure, so the UI
// can call them on every change and the DM page can show the same progress.

import { type Answers, STEPS, type StepKey } from "./character";
import {
  backgroundOf,
  backgroundsForClass,
  classesForArchetype,
  classOf,
  optionRequirementIssues,
  pickedOptions,
  speciesCantripIds,
  speciesOf,
  spellPickLists,
} from "./content";

export interface StepStatus {
  key: StepKey;
  label: string;
  /** False when the step doesn't apply to this character (a Barbarian has no spells). */
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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
    case "species": {
      const species = speciesOf(answers);
      if (!species) return { applicable: true, complete: false, issues: ["Pick a species."] };
      if (species.option && !species.option.choices.some((c) => c.id === answers.speciesOption)) {
        return {
          applicable: true,
          complete: false,
          issues: [`Pick your ${species.option.label.toLowerCase()}.`],
        };
      }
      return { applicable: true, complete: true, issues: [] };
    }
    case "background": {
      if (!cls) return { applicable: true, complete: false, blockedBy: "class", issues: [] };
      const ok = backgroundsForClass(answers).some((b) => b.id === answers.backgroundId);
      return ok
        ? { applicable: true, complete: true, issues: [] }
        : { applicable: true, complete: false, issues: ["Pick a background."] };
    }
    case "options": {
      if (!cls) return { applicable: true, complete: false, blockedBy: "class", issues: [] };
      if (cls.optionGroups.length === 0) return { applicable: false, complete: true, issues: [] };
      const issues = cls.optionGroups.flatMap((g) => {
        const n = pickedOptions(answers, g).length;
        return n === g.count
          ? []
          : [`Pick ${g.count === 1 ? "one" : plural(g.count, "option")} for ${g.label}.`];
      });
      return { applicable: true, complete: issues.length === 0, issues };
    }
    case "spells": {
      if (!cls) return { applicable: true, complete: false, blockedBy: "class", issues: [] };
      const lists = spellPickLists(answers);
      if (lists.length === 0) return { applicable: false, complete: true, issues: [] };
      const issues = lists.flatMap((l) => {
        const valid = l.picked.filter((id) => l.choices.some((c) => c.id === id)).length;
        return valid === l.count ? [] : [`Pick ${l.count} for ${l.label} (${valid} so far).`];
      });
      issues.push(...optionRequirementIssues(answers));
      return { applicable: true, complete: issues.length === 0, issues };
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

/** Whether one step is complete (a step that doesn't apply counts as complete). */
export function isAnswered(answers: Answers, key: StepKey): boolean {
  return stepStatuses(answers).find((s) => s.key === key)?.complete ?? false;
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

function keepValid(
  ids: string[] | undefined,
  allowed: Set<string>,
  max: number,
  exclude = new Set<string>(),
): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (allowed.has(id) && !exclude.has(id) && !out.includes(id) && out.length < max) out.push(id);
  }
  return out;
}

/**
 * Drops choices that an upstream answer made invalid, and returns a new object (the input is
 * not changed). Pass the answers from before the change as `previous` so a change of class or
 * species clears the picks made for the old one even where the new one offers the same ids.
 *
 * - a class the archetype doesn't offer is cleared;
 * - a new (or cleared) class clears option picks and every class spell pick;
 * - option and spell picks keep only ids the current shortlists offer, up to the pick count;
 * - a background the class can't take is cleared, and with it the Magic Initiate picks;
 * - a new (or cleared) species clears the sub-choice, and a sub-choice it doesn't offer is cleared;
 * - a cantrip the species already teaches is dropped from every list, a cantrip picked in an
 *   earlier list (class, then fighting style, then Magic Initiate) is dropped from the later
 *   ones, and a Magic Initiate spell the class already prepares is dropped: a repeat would be
 *   wasted. The UI should grey those choices out (`unavailableSpellIds` in content.ts).
 */
export function pruneAnswers(answers: Answers, previous?: Answers): Answers {
  const next: Answers = { ...answers };
  if (next.options) next.options = { ...next.options };

  if (next.classId && !classesForArchetype(next.archetype).some((c) => c.id === next.classId)) {
    delete next.classId;
  }
  const classChanged = previous !== undefined && previous.classId !== next.classId;
  if (!next.classId || classChanged) {
    delete next.options;
    delete next.cantrips;
    delete next.spells;
    delete next.bonusCantrips;
  }

  const speciesChanged = previous !== undefined && previous.speciesId !== next.speciesId;
  const species = speciesOf(next);
  if (
    !species ||
    speciesChanged ||
    !species.option?.choices.some((c) => c.id === next.speciesOption)
  ) {
    delete next.speciesOption;
  }

  const cls = classOf(next);
  if (cls) {
    if (next.backgroundId && !cls.backgrounds.includes(next.backgroundId)) delete next.backgroundId;
    if (next.options) {
      const pruned: NonNullable<Answers["options"]> = {};
      for (const g of cls.optionGroups) {
        const picks = keepValid(next.options[g.key], new Set(g.choices), g.count);
        if (picks.length > 0) pruned[g.key] = picks;
      }
      next.options = pruned;
    }
  }

  // Spell picks: each list keeps only what it offers now, up to its count.
  const lists = spellPickLists(next);
  const listFor = (field: string) => lists.find((l) => l.field === field);
  const knownCantrips = new Set(speciesCantripIds(next));
  for (const field of ["cantrips", "spells", "bonusCantrips", "initiateCantrips"] as const) {
    const list = listFor(field);
    if (!list) {
      delete next[field];
      continue;
    }
    if (next[field] === undefined) continue;
    const exclude = field === "spells" ? undefined : knownCantrips;
    next[field] = keepValid(
      next[field],
      new Set(list.choices.map((c) => c.id)),
      list.count,
      exclude,
    );
    if (field !== "spells") for (const id of next[field] ?? []) knownCantrips.add(id);
  }
  const initiateSpell = listFor("initiateSpell");
  if (
    next.initiateSpell &&
    (!initiateSpell?.choices.some((c) => c.id === next.initiateSpell) ||
      next.spells?.includes(next.initiateSpell))
  ) {
    delete next.initiateSpell;
  }
  if (!backgroundOf(next)?.initiate) {
    delete next.initiateCantrips;
    delete next.initiateSpell;
  }
  return next;
}
