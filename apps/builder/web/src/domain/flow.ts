// The screens of the player's flow and where the player stands on each. A screen groups one or
// more steps from steps.ts (name, look and personality share the "About you" screen), and the
// flow ends on the character sheet. Pure, so the stepper, the tests and the DM page agree.

import type { Answers, StepKey } from "./character";
import { stepStatuses } from "./steps";

export const VIEWS = [
  { key: "archetype", label: "Kind of hero", steps: ["archetype"] },
  { key: "class", label: "Class", steps: ["class"] },
  { key: "species", label: "Species", steps: ["species"] },
  { key: "background", label: "Background", steps: ["background"] },
  { key: "options", label: "Class choices", steps: ["options"] },
  { key: "about", label: "About you", steps: ["name", "look", "personality"] },
  { key: "sheet", label: "Your sheet", steps: [] },
] as const satisfies ReadonlyArray<{ key: string; label: string; steps: readonly StepKey[] }>;

export type ViewKey = (typeof VIEWS)[number]["key"];

export interface ViewStatus {
  key: ViewKey;
  label: string;
  /** False when none of the screen's steps apply (a Barbarian has no class choices screen). */
  applicable: boolean;
  state: "done" | "todo" | "blocked";
  /** The screen to finish first, when this one is blocked. */
  blockedBy?: ViewKey;
  /** What is still missing on this screen, in plain words. */
  issues: string[];
}

function viewOfStep(step: StepKey): ViewKey {
  return VIEWS.find((v) => (v.steps as readonly StepKey[]).includes(step))?.key ?? "sheet";
}

/** Every screen in flow order, with whether it applies and whether it's done, to do or blocked. */
export function viewStatuses(answers: Answers): ViewStatus[] {
  const steps = stepStatuses(answers);
  const out: ViewStatus[] = VIEWS.filter((v) => v.key !== "sheet").map((v) => {
    const own = steps.filter((s) => (v.steps as readonly StepKey[]).includes(s.key));
    const applicable = own.some((s) => s.applicable);
    const blocker = own.find((s) => s.blockedBy)?.blockedBy;
    const done = own.every((s) => !s.applicable || s.complete);
    return {
      key: v.key,
      label: v.label,
      applicable,
      state: done ? "done" : blocker ? "blocked" : "todo",
      blockedBy: blocker && !done ? viewOfStep(blocker) : undefined,
      issues: own.flatMap((s) => (s.applicable && !s.complete ? s.issues : [])),
    };
  });
  const finished = out.every((v) => !v.applicable || v.state === "done");
  out.push({
    key: "sheet",
    label: "Your sheet",
    applicable: true,
    state: finished ? "done" : "todo",
    issues: [],
  });
  return out;
}

/** Where a reopened link starts: the first screen with something left to do, else the sheet. */
export function startView(answers: Answers): ViewKey {
  return viewStatuses(answers).find((v) => v.applicable && v.state !== "done")?.key ?? "sheet";
}

/** The next screen that applies after `current` (the sheet is always last). */
export function viewAfter(answers: Answers, current: ViewKey): ViewKey {
  const statuses = viewStatuses(answers);
  const at = statuses.findIndex((v) => v.key === current);
  return statuses.slice(at + 1).find((v) => v.applicable)?.key ?? "sheet";
}

/** The screen that applies before `current`, or `undefined` on the first. */
export function viewBefore(answers: Answers, current: ViewKey): ViewKey | undefined {
  const statuses = viewStatuses(answers);
  const at = statuses.findIndex((v) => v.key === current);
  return statuses.slice(0, Math.max(0, at)).findLast((v) => v.applicable)?.key;
}

/** The plain name of each answer a change can clear, in the order the sentence lists them. */
const CLEARABLE: Array<[keyof Answers, string]> = [
  ["classId", "your class"],
  ["speciesOption", "your species choice"],
  ["backgroundId", "your background"],
  ["options", "your class choices"],
];

function count(value: Answers[keyof Answers]): number {
  if (value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.values(value).flat().length;
  return value === "" ? 0 : 1;
}

/**
 * One plain line naming what `pruneAnswers` cleared, or `null` when it cleared nothing.
 * `before` is the answers with the player's change applied, `after` the pruned result.
 */
export function clearedSummary(before: Answers, after: Answers): string | null {
  const names: string[] = [];
  for (const [field, name] of CLEARABLE) {
    const lost = count(before[field]) > count(after[field]);
    if (lost && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return null;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
  return `That change cleared ${list}. Pick again when you get there.`;
}
