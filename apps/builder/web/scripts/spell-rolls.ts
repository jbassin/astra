// The check that a spell's sheet entry carries every damage or healing roll its rules text
// makes. scripts/build-content.ts runs it on every spell it builds.

import type { SpellContent } from "../src/domain/contentTypes";

/** Dice like "2d10" or "1d4 + 1". */
const DICE = /\b\d+d\d+(?: \+ \d+)?\b/g;
/** A sentence about damage or healing (not Bless's 1d4 on a roll). */
const DAMAGE_OR_HEALING = /\bdamage\b|\bHit Points?\b|\bregains?\b|\brestores?\b/i;

/**
 * The damage and healing rolls a spell's sheet entry leaves out: every roll in a sentence of
 * its rules text that deals damage or heals, and every `extra` roll (the importer's structured
 * ones), must appear in its damage, healing or roll note. Empty when nothing is missing.
 */
export function unshownRolls(
  s: Pick<SpellContent, "rulesText" | "damage" | "healing" | "rollNote">,
  extra: string[] = [],
): string[] {
  const shown = [s.damage, s.healing, s.rollNote].filter(Boolean).join(" | ");
  const shownDice = new Set(shown.match(DICE) ?? []);
  const wanted = new Set(extra);
  for (const sentence of s.rulesText.join(" ").split(/(?<=[.!?])\s+/)) {
    if (!DAMAGE_OR_HEALING.test(sentence)) continue;
    for (const d of sentence.match(DICE) ?? []) wanted.add(d);
  }
  return [...wanted]
    .filter((d) => !shownDice.has(d))
    .map(
      (d) =>
        `its rules text rolls ${d} for damage or healing, but the sheet shows no ${d} ` +
        "(add it to content/spells/rolls.ts as a note)",
    );
}
