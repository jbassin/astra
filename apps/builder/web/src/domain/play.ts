// What a player marks while playing, and what the sheet marks it on. A tracker is one limited
// thing (the spell slots, a feature's uses, a spell's free casts) with a stable id; the saved
// `PlayState` counts how many of each are used. Pure and defensive: every read clamps, so a
// saved number the character no longer supports (a new max) never shows a wrong count.

import type { PlayState } from "./character";
import type { Character, FeatureLine, SpellcastingBlock, SpellEntry } from "./engine";

export interface Tracker {
  /** The key in `PlayState.spent`: `slots`, `use-<feature id>` or `cast-<spell id>`. */
  id: string;
  /** What it counts, for a screen reader: "Rage", "Level 1 spell slots". */
  label: string;
  max: number;
  /** What one is called: "use", "Sorcery Point", "spell slot". */
  unit: string;
}

/** A tracker with more than this many is a number to step up and down, not a row of pips. */
export const MAX_PIPS = 6;

/** The class's spell slots (or a Warlock's pact slots), or `undefined` when there are none. */
export function slotTracker(b: SpellcastingBlock): Tracker | undefined {
  const max = b.slots?.[0] ?? 0;
  if (max <= 0) return undefined;
  return {
    id: "slots",
    label: `Level ${b.pactSlotLevel ?? 1} spell slots`,
    max,
    unit: "spell slot",
  };
}

export function featureTracker(f: FeatureLine): Tracker | undefined {
  if (!f.uses || f.uses.max <= 0) return undefined;
  return { id: `use-${f.id}`, label: f.name, max: f.uses.max, unit: f.uses.unit };
}

/** A spell's free casts; a cantrip, an at-will spell and a spell with a cost have none to mark. */
export function spellTracker(s: SpellEntry): Tracker | undefined {
  if (s.level === 0 || s.atWill || s.cost || !s.freeCasts) return undefined;
  return { id: `cast-${s.id}`, label: s.name, max: s.freeCasts, unit: "use" };
}

/** Every tracker the sheet shows for a character, each once. */
export function trackersOf(c: Character): Tracker[] {
  const out = new Map<string, Tracker>();
  const add = (t: Tracker | undefined) => t && !out.has(t.id) && out.set(t.id, t);
  for (const b of c.spellcasting) {
    add(slotTracker(b));
    for (const s of [...b.cantrips, ...b.spells]) add(spellTracker(s));
  }
  for (const f of c.features) add(featureTracker(f));
  return [...out.values()];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/** The current Hit Points: the saved number held to 0..max, full when none is saved. */
export function currentHp(max: number, play: PlayState | undefined): number {
  const hp = play?.hp;
  return hp === undefined || !Number.isFinite(hp) ? max : clamp(hp, 0, max);
}

/** How many of a tracker are used, held to 0..max. */
function spentOf(t: Tracker, play: PlayState | undefined): number {
  const n = play?.spent?.[t.id];
  return n === undefined || !Number.isFinite(n) ? 0 : clamp(n, 0, t.max);
}

/** How many of a tracker are left. */
export function leftOf(t: Tracker, play: PlayState | undefined): number {
  return t.max - spentOf(t, play);
}

/** Drops what is back at its default, so an untouched character saves no play state. */
function tidy(hp: number | undefined, spent: Record<string, number>): PlayState {
  const kept = Object.fromEntries(Object.entries(spent).filter(([, n]) => n > 0));
  return {
    ...(hp !== undefined && { hp }),
    ...(Object.keys(kept).length > 0 && { spent: kept }),
  };
}

/** A new state with the Hit Points set (held to 0..max); full Hit Points are not stored. */
export function withHp(play: PlayState | undefined, max: number, hp: number): PlayState {
  const next = clamp(hp, 0, max);
  return tidy(next >= max ? undefined : next, play?.spent ?? {});
}

/** A new state with `spent` of the tracker used (held to 0..max); none used is not stored. */
export function withSpent(play: PlayState | undefined, t: Tracker, spent: number): PlayState {
  return tidy(play?.hp, { ...play?.spent, [t.id]: clamp(spent, 0, t.max) });
}

/** A new state with `left` of the tracker left. */
export function withLeft(play: PlayState | undefined, t: Tracker, left: number): PlayState {
  return withSpent(play, t, t.max - clamp(left, 0, t.max));
}
