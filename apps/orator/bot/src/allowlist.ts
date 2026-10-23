/**
 * Operator allowlist (M1). Lark used a flat `LARK_ALLOWED_USER_IDS` env string;
 * astra derives the allowlist from the ontology (config single-source, principle #2):
 * the union of every `is_admin` player's Discord snowflakes, plus an optional
 * additive `orator.allowedUserIds` override (comma/whitespace-separated) for
 * non-player operators.
 *
 * The result is a plain `Set<string>` consumed at the OAuth login gate and the
 * API-key user binding (see `auth` / lark's `config.allowlist`). Pure + dependency-
 * free so it unit-tests without Discord, config files, or the ontology reader.
 */
import type { Being } from "@astra/ontology";

/** Snowflakes of every admin player in the ontology (the operator set's spine). */
export function adminSnowflakes(being: Being): string[] {
  return being.players.filter((p) => p.is_admin).flatMap((p) => p.snowflakes);
}

/**
 * Parse the optional `orator.allowedUserIds` override: comma/whitespace-separated
 * Discord user IDs. Blank entries are dropped; order is irrelevant (membership).
 */
export function parseOverride(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** Build the operator allowlist: ontology admin snowflakes ∪ the config override. */
export function buildAllowlist(being: Being, override?: string): Set<string> {
  return new Set([...adminSnowflakes(being), ...parseOverride(override)]);
}

/** Whether a Discord user ID is a permitted operator (allowlist membership). */
export function isAllowed(userId: string, allowlist: Set<string>): boolean {
  return allowlist.has(userId);
}
