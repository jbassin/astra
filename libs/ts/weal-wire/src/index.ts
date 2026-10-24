// @astra/weal-wire — the one definition of the weal-bot → weal-overlay wire. weal-bot builds
// every roll message through `RollMessageSchema.parse` before it posts, and weal-overlay's
// ingest validates the body with the same schema, so neither side can drift from the other.

import { z } from "zod";

/** The ingest route on weal-overlay that weal-bot posts each roll to. */
export const INGEST_PATH = "/api/v1/roll";

/** The header that carries the shared `weal_token` secret on ingest. */
export const TOKEN_HEADER = "x-weal-token";

/**
 * The header's old name. weal-bot sends both names and weal-overlay accepts either, so the
 * two services can deploy in any order. Drop it once both run a release that knows
 * {@link TOKEN_HEADER}.
 */
export const LEGACY_TOKEN_HEADER = "x-eerie-token";

/** The token headers weal-bot sends: the token under both names. */
export function tokenHeaders(token: string): Record<string, string> {
  return { [TOKEN_HEADER]: token, [LEGACY_TOKEN_HEADER]: token };
}

/** The token an ingest request carries, read from either header name; null when absent. */
export function requestToken(headers: Headers): string | null {
  return headers.get(TOKEN_HEADER) ?? headers.get(LEGACY_TOKEN_HEADER);
}

/**
 * One roll, as weal-bot posts it. Unknown keys are stripped rather than rejected, so an
 * older bot that still sends the retired `value` field keeps working.
 */
export const RollMessageSchema = z.object({
  /** The wire version. */
  v: z.literal(1),
  /** The player's display name. */
  user: z.string().trim().min(1),
  /** The roll's plain source text, never the engine's markdown render. */
  expression: z.string(),
  /** The rolled total; 0 for a non-numeric (atom) roll. */
  total: z.number().finite(),
  /** The engine graded the roll a crit. */
  is_crit: z.boolean(),
  /** The engine graded the roll a fumble. */
  is_fumble: z.boolean(),
  /** The engine's headline for the roll (`24`, `:great`); the overlay shows it over `total`. */
  display: z.string(),
});

export type RollMessage = z.infer<typeof RollMessageSchema>;
