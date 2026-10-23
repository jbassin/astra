// The wire contract from @astra/weal-bot — v1 only (0009 K7/W7: the v0 legacy shape
// is dropped, since weal-bot ships v1 from day one). parseRollEvent() validates +
// normalizes an untrusted ingest body into the internal RollEvent (camelCase). Crit/
// fumble are mirrored verbatim from weal-bot's RollGoodness — the overlay does no rule
// logic. Tolerant by design: a missing timestamp/expression is filled, never rejected.

export interface RollEvent {
  /** schema version weal-bot claimed (defaults to 1). */
  v: number;
  /** player display name. */
  user: string;
  /** rendered dice expression (e.g. "2d6+3"), or null. */
  expression: string | null;
  /** the roll total. */
  total: number;
  /** individual die faces, or null when not provided. */
  dice: number[] | null;
  /** flat modifier, or null when not provided. */
  modifier: number | null;
  /** weal v2 display headline (e.g. ":great") — preferred over total when present. */
  display: string | null;
  /** mirrored from weal-bot's RollGoodness::Crit. */
  isCrit: boolean;
  /** mirrored from weal-bot's RollGoodness::Fumble. */
  isFumble: boolean;
  /** ISO-8601 timestamp; stamped on ingest if weal-bot didn't send one. */
  ts: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function asFiniteNumber(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/**
 * Validate + normalize an untrusted ingest body. Returns null for anything that isn't a
 * usable roll (caller answers 400). The v1 contract requires `user` + a finite `total`.
 */
export function parseRollEvent(input: unknown): RollEvent | null {
  if (!isRecord(input)) return null;

  const user = typeof input.user === "string" ? input.user.trim() : "";
  if (!user) return null;

  const total = asFiniteNumber(input.total);
  if (total === null) return null;

  const expression = typeof input.expression === "string" ? input.expression : null;

  const display = typeof input.display === "string" && input.display !== "" ? input.display : null;

  const dice = Array.isArray(input.dice)
    ? input.dice.filter((d): d is number => asFiniteNumber(d) !== null)
    : null;

  const modifier = asFiniteNumber(input.modifier);

  // Accept both snake_case (the wire) and camelCase (defensive).
  const isCrit = input.is_crit === true || input.isCrit === true;
  const isFumble = input.is_fumble === true || input.isFumble === true;

  const ts =
    typeof input.ts === "string" && input.ts.length > 0 ? input.ts : new Date().toISOString();

  const v = asFiniteNumber(input.v) ?? 1;

  return { v, user, expression, display, total, dice, modifier, isCrit, isFumble, ts };
}
