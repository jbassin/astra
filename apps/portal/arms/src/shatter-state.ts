// The shatter mechanic's state machine: pure, no Foundry. Four arms shimmer; each shimmering arm
// that is hit shatters; when enough have shattered, the round is "triggered" and every arm in the
// fight shatters. shatter.ts reads and writes these states through the token flags.

export type ArmState = "shimmer" | "shattered";

/** One shimmer round. Arms in neither list are normal. Values are never mutated. */
export interface Round {
  readonly shimmering: readonly string[];
  readonly shattered: readonly string[];
  /** Shattered arms that trigger the round; 0 when no arm shimmers, which never triggers. */
  readonly needed: number;
}

interface HitResult {
  readonly round: Round;
  /** The arm shattered because of this hit. */
  readonly shattered: boolean;
  /** This hit reached the threshold. */
  readonly triggered: boolean;
  /** Arms that were still shimmering when the round triggered; they shatter with the rest. */
  readonly released: readonly string[];
}

const EMPTY_ROUND: Round = { shimmering: [], shattered: [], needed: 0 };

/** Whether the round has reached its threshold (and so ignores hits until it is reset). */
export function isTriggered(round: Round): boolean {
  return round.needed > 0 && round.shattered.length >= round.needed;
}

/** A random order of a copy: repeatedly take one item from the pool; `random` is in [0, 1). */
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
 * Pick `shimmer` of the eligible arms at random (all of them when fewer are eligible). The
 * threshold is `needed`, but never more than the arms picked.
 */
export function pick(
  eligible: readonly string[],
  random: () => number,
  shimmer = 4,
  needed = 3,
): Round {
  const unique = [...new Set(eligible)];
  const chosen = shuffled(unique, random).slice(0, Math.max(shimmer, 0));
  return {
    shimmering: chosen,
    shattered: [],
    needed: Math.min(Math.max(needed, 0), chosen.length),
  };
}

/** Build a round from the arm states read off the tokens (the flags are the truth). */
export function fromStates(
  states: ReadonlyMap<string, ArmState | undefined>,
  neededCap = 3,
): Round {
  const shimmering: string[] = [];
  const shattered: string[] = [];
  for (const [id, state] of states) {
    if (state === "shimmer") shimmering.push(id);
    else if (state === "shattered") shattered.push(id);
  }
  return {
    shimmering,
    shattered,
    needed: Math.min(Math.max(neededCap, 0), shimmering.length + shattered.length),
  };
}

/**
 * Apply a hit on `armId`. A hit on a non-shimmering arm, or after the threshold, does nothing.
 * The hit that reaches the threshold shatters every arm in `allArms` too (the whole boss breaks),
 * so the triggered round's `shattered` is the hit arms followed by the rest of `allArms`.
 */
export function hit(round: Round, armId: string, allArms: readonly string[] = []): HitResult {
  const none: HitResult = { round, shattered: false, triggered: false, released: [] };
  if (isTriggered(round) || !round.shimmering.includes(armId)) return none;
  const shattered = [...round.shattered, armId];
  const shimmering = round.shimmering.filter((id) => id !== armId);
  const next: Round = { ...round, shimmering, shattered };
  if (!isTriggered(next)) return { round: next, shattered: true, triggered: false, released: [] };
  const rest = allArms.filter((id) => !shattered.includes(id));
  return {
    round: { ...next, shimmering: [], shattered: [...shattered, ...new Set(rest)] },
    shattered: true,
    triggered: true,
    released: shimmering,
  };
}

/** Every arm back to normal. */
export function reset(): Round {
  return EMPTY_ROUND;
}

/** The state each arm token should carry for this round (`undefined` is a normal arm). */
export function statesOf(
  round: Round,
  armIds: readonly string[],
): Map<string, ArmState | undefined> {
  return new Map(
    armIds.map((id) => [
      id,
      round.shimmering.includes(id)
        ? "shimmer"
        : round.shattered.includes(id)
          ? "shattered"
          : undefined,
    ]),
  );
}
