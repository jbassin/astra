// The overlay's two shapes. The ingest body is weal-bot's roll message, validated with the
// shared wire schema (`@astra/weal-wire`), so the overlay accepts exactly what the bot builds.
// parseRollEvent() maps it to RollEvent, the camelCase event the SSE feed sends the browser.
// Crit/fumble are mirrored verbatim from the engine's goodness — the overlay does no rule logic.

import { RollMessageSchema } from "@astra/weal-wire";

export interface RollEvent {
  /** The wire version weal-bot sent. */
  v: number;
  /** Player display name. */
  user: string;
  /** The roll's plain source text (e.g. "2d6+3"). */
  expression: string;
  /** The roll total (0 for an atom roll). */
  total: number;
  /** The engine's headline (e.g. ":great"), shown over `total`; null when blank. */
  display: string | null;
  /** The engine graded the roll a crit. */
  isCrit: boolean;
  /** The engine graded the roll a fumble. */
  isFumble: boolean;
  /** ISO-8601 time the overlay received the roll. */
  ts: string;
}

/**
 * Validate an untrusted ingest body and map it to the feed event. Returns null for anything
 * the wire schema rejects (the caller answers 400).
 */
export function parseRollEvent(input: unknown, now: Date = new Date()): RollEvent | null {
  const parsed = RollMessageSchema.safeParse(input);
  if (!parsed.success) return null;
  const msg = parsed.data;
  return {
    v: msg.v,
    user: msg.user,
    expression: msg.expression,
    total: msg.total,
    display: msg.display === "" ? null : msg.display,
    isCrit: msg.is_crit,
    isFumble: msg.is_fumble,
    ts: now.toISOString(),
  };
}
