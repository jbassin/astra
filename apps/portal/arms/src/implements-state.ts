// The active-set rules for the boss's Implements: pure, no Foundry. Every Implement starts active.
// Each threshold the boss's health bars cross (a bar at half, a bar empty) moves one Implement to
// the inactive set. implements.ts reads and writes the sets through token flags.

export const FLAG_SCOPE = "world";
/** Scene flag: the fight's bar and Implement token ids. */
export const IMPLEMENTS_KEY = "ikImplements";
/** Token flag on an Implement: present (true) while it is inactive. */
export const INACTIVE_KEY = "ikInactive";

/** One fight, as read from `flags.world.ikImplements` on a scene. */
export interface ImplementsConfig {
  /** The health bar token ids. Order does not matter: every bar has the same two thresholds. */
  readonly bars: readonly string[];
  readonly implements: readonly string[];
  readonly active: boolean;
}

export interface Hp {
  readonly value: number;
  readonly max: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === "string" && v !== ""))]
    : [];
}

/** A flag without bars or Implements is no fight (`null`). */
export function parseImplementsFlag(flag: unknown): ImplementsConfig | null {
  if (!isRecord(flag)) return null;
  const bars = ids(flag.bars);
  const implementIds = ids(flag.implements);
  if (bars.length === 0 || implementIds.length === 0) return null;
  return { bars, implements: implementIds, active: flag.active === true };
}

/** Thresholds crossed: each bar counts one at half its max or below, and one more at 0. */
export function thresholdsCrossed(bars: readonly Hp[]): number {
  let crossed = 0;
  for (const { value, max } of bars) {
    if (!(max > 0)) continue;
    if (value <= max / 2) crossed++;
    if (value <= 0) crossed++;
  }
  return crossed;
}

/** How many Implements should be inactive. At least one always stays active. */
export function inactiveTarget(bars: readonly Hp[], implementCount: number): number {
  return Math.max(0, Math.min(thresholdsCrossed(bars), implementCount - 1));
}

/** A random order of a copy; `random` is in [0, 1). */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length > 0) {
    const at = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    out.push(...pool.splice(at, 1));
  }
  return out;
}

/**
 * Move Implements between the sets until `target` are inactive: the ones moved are picked at
 * random from the set they leave, so the rest keep their state. Returns the new inactive set.
 */
export function adjust(
  all: readonly string[],
  inactive: readonly string[],
  target: number,
  random: () => number,
): string[] {
  const current = all.filter((id) => inactive.includes(id));
  if (current.length > target) {
    return shuffled(current, random).slice(0, Math.max(target, 0));
  }
  const active = all.filter((id) => !inactive.includes(id));
  return [...current, ...shuffled(active, random).slice(0, target - current.length)];
}

/** A fresh random inactive set of `target` Implements (the top-of-round reshuffle). */
export function reshuffle(all: readonly string[], target: number, random: () => number): string[] {
  return shuffled(all, random).slice(0, Math.max(target, 0));
}
