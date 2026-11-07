// Guards Josh's rule that every summary matches the rules text it summarizes: each number a
// summary states (dice like 1d10, distances, durations, counts) must also appear in that rules
// text. A number that is right but comes from elsewhere (the character's level, the general
// rules) goes in ALLOWED with the reason.

import { describe, expect, it } from "vitest";

import { CONTENT } from "./content";
import type { Summarized } from "./contentTypes";

/** id → numbers the summary may state that its own rules text doesn't, and why. */
const ALLOWED: Record<string, { numbers: string[]; why: string }> = {
  "fighter-second-wind": { numbers: ["2"], why: "1d10 + Fighter level; level 2" },
  "monk-uncanny-metabolism": {
    numbers: ["1d6", "2"],
    why: "Martial Arts die (1d6 at level 2) + Monk level",
  },
  "monk-martial-arts": {
    numbers: ["1d6"],
    why: "the Martial Arts die, from its sub-feature at level 1–2",
  },
  "paladin-lay-on-hands": { numbers: ["10"], why: "5 × Paladin level 2" },
  "wizard-arcane-recovery": { numbers: ["1"], why: "half of Wizard level 2, rounded up" },
  "barbarian-rage": { numbers: ["2"], why: "Rage Damage column at level 2 (+2)" },
  "druid-wild-shape": {
    numbers: ["1", "2"],
    why: "half Druid level 2 hours; Temporary HP = Druid level",
  },
  "sorcerer-font-of-magic": {
    numbers: ["1"],
    why: "a level 1 spell slot (from the Creating Spell Slots table)",
  },
  "divine-smite": { numbers: ["3d8"], why: "2d8 plus the extra 1d8 against Fiends and Undead" },
  "detect-magic": {
    numbers: ["10"],
    why: "a ritual takes 10 minutes longer (the general ritual rule)",
  },
  "armor-of-shadows": { numbers: ["13"], why: "Mage Armor's AC, from the Mage Armor spell" },
  "healing-hands": { numbers: ["2d4"], why: "a number of d4s equal to Proficiency Bonus 2" },
};

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\b\d+d\d+\b|\b\d+\b/g)].map((m) => m[0]);
}

/** Everything with a summary, with the rules text to check it against. A spell's range,
 * duration and casting time count as rules text; so do a species' own traits for its options
 * ("120 feet instead of 60"). */
function everything(): Array<{ item: Summarized; rules: string }> {
  const out: Array<{ item: Summarized; rules: string }> = [];
  const add = (item: Summarized, ...more: string[]): void => {
    out.push({ item, rules: item.rulesText.concat(more).join(" ") });
  };
  for (const c of Object.values(CONTENT.classes)) for (const f of c.features) add(f);
  for (const o of Object.values(CONTENT.options)) add(o);
  for (const s of Object.values(CONTENT.species)) {
    for (const t of s.traits) add(t);
    const base = s.traits.flatMap((t) => t.rulesText).concat(`${s.speed}`);
    for (const o of s.option?.choices ?? []) add(o, ...base);
  }
  for (const f of Object.values(CONTENT.feats)) add(f);
  for (const sp of Object.values(CONTENT.spells))
    add(sp, sp.range, sp.duration, sp.time, sp.components);
  for (const m of Object.values(CONTENT.masteries)) add(m);
  return out;
}

describe("summaries", () => {
  it("cover everything a player sees", () => {
    for (const { item } of everything()) expect(item.summary.trim(), item.id).not.toBe("");
  });

  it("state only numbers their rules text gives", () => {
    const problems: string[] = [];
    for (const { item, rules } of everything()) {
      const known = new Set(numbersIn(rules));
      const allowed = new Set(ALLOWED[item.id]?.numbers ?? []);
      for (const n of numbersIn(item.summary)) {
        if (!known.has(n) && !allowed.has(n))
          problems.push(`${item.id}: "${n}" in "${item.summary}"`);
      }
    }
    expect(problems).toEqual([]);
  });
});
