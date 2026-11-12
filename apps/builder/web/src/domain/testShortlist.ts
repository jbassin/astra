// Test-only: reorder a class's option shortlists inside `CONTENT` for the length of a callback,
// then put them back. The builder gives the first `count` of each list (`chosenOptions`), so
// this is how a test reaches options the shipped lists do not pick, the same way Josh would by
// reordering `content/classes.ts`. Never import this from production code.

import { CONTENT } from "./content";
import type { ClassId, OptionGroupKey } from "./contentTypes";

/** For each group key, the option ids to put first (the rest keep their order after them). */
export type Shortlist = Partial<Record<OptionGroupKey, string[]>>;

/**
 * Runs `fn` (synchronous) with the class's lists reordered; restores the lists afterwards, even
 * on a throw.
 */
export function withShortlist<T>(classId: ClassId, first: Shortlist, fn: () => T): T {
  const groups = CONTENT.classes[classId].optionGroups;
  const saved = groups.map((g) => g.choices);
  for (const g of groups) {
    const front = first[g.key];
    if (!front) continue;
    for (const id of front) {
      if (!g.choices.includes(id)) throw new Error(`${classId} ${g.key} has no option ${id}`);
    }
    g.choices = [...front, ...g.choices.filter((id) => !front.includes(id))];
  }
  const restore = () => {
    groups.forEach((g, i) => {
      g.choices = saved[i] ?? g.choices;
    });
  };
  try {
    return fn();
  } finally {
    restore();
  }
}
