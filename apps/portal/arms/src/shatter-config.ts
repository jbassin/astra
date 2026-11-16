/** The shatter fight's scene flag, validated at the edge, and the window rule. */

export const FLAG_SCOPE = "world";
export const FIGHT_KEY = "ikShatterFight";
export const SHATTER_KEY = "ikShatter";
/** Set on each Shattered effect item this module creates. */
export const EFFECT_FLAG = "ikShatterEffect";

/** Where combat stood at the third shatter; the window ends at that turn a round later. */
export interface ShatterWindow {
  readonly combat: string;
  readonly round: number;
  readonly turn: number;
}

/** One fight, as read from `flags.world.ikShatterFight` on a scene. */
export interface FightConfig {
  readonly arms: readonly string[];
  readonly shimmer: number;
  readonly needed: number;
  readonly weakness: number;
  /** Uuids of the Shattered effects on the arm actors; empty outside a Shattered window. */
  readonly effectUuids: readonly string[];
  /** Null when the effects were applied outside combat (then only deleting them resets). */
  readonly window: ShatterWindow | null;
  readonly active: boolean;
}

export const FIGHT_DEFAULTS = { shimmer: 4, needed: 3, weakness: 10 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.round(value)
    : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v !== "")
    : [];
}

function parseWindow(value: unknown): ShatterWindow | null {
  if (!isRecord(value)) return null;
  const { combat, round, turn } = value;
  if (typeof combat !== "string" || typeof round !== "number" || typeof turn !== "number") {
    return null;
  }
  return Number.isFinite(round) && Number.isFinite(turn) ? { combat, round, turn } : null;
}

/** A flag without any arm id is no fight (`null`); other bad fields fall back to defaults. */
export function parseFightFlag(flag: unknown): FightConfig | null {
  if (!isRecord(flag)) return null;
  const arms = [...new Set(strings(flag.arms))];
  if (arms.length === 0) return null;
  return {
    arms,
    shimmer: count(flag.shimmer, FIGHT_DEFAULTS.shimmer),
    needed: count(flag.needed, FIGHT_DEFAULTS.needed),
    weakness: count(flag.weakness, FIGHT_DEFAULTS.weakness),
    effectUuids: strings(flag.effectUuids),
    window: parseWindow(flag.window),
    active: flag.active === true,
  };
}

export function parseShatterFlag(flag: unknown): "shimmer" | "shattered" | undefined {
  return isRecord(flag) && (flag.state === "shimmer" || flag.state === "shattered")
    ? flag.state
    : undefined;
}

/** Whether combat has come back to the window's turn index, a round on (or later). */
export function windowEnded(
  window: ShatterWindow,
  combat: { round: number; turn: number },
): boolean {
  return (
    combat.round > window.round + 1 ||
    (combat.round === window.round + 1 && combat.turn >= window.turn)
  );
}
