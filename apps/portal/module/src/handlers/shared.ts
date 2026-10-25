/**
 * Helpers every handler module shares: the name-match ranking the search tools use and
 * name-to-actor resolution. The typed handler error is `BridgeError` from
 * `@astra/portal-shared`, the same class the server throws.
 */
import { BridgeError } from "@astra/portal-shared";

/** Default `search-compendium`/`search-world` result cap when the caller doesn't
 * specify one — generous enough for an LLM to scan, small enough not to flood context. */
export const DEFAULT_SEARCH_LIMIT = 25;

/** Ranks a substring match: an exact-prefix hit (`pos === 0`) always outranks any
 * later-position substring hit; ties break stably by name. */
export function matchRank(name: string, needle: string): number | undefined {
  const pos = name.toLowerCase().indexOf(needle);
  if (pos === -1) return undefined;
  return pos === 0 ? 0 : pos + 1;
}

export function byRankThenName<T extends { name: string }>(
  a: T & { _rank: number },
  b: T & { _rank: number },
): number {
  return a._rank - b._rank || a.name.localeCompare(b.name);
}

/** Case-insensitive exact-then-unambiguous-prefix name resolution, shared by
 * `query-player`'s `name` param. Throws typed `ambiguous-name` (additive `BridgeErrorCode`
 * member) naming every candidate when neither pass narrows to exactly one, or `not-found`
 * when nothing matches at all. */
export function resolveByName<T extends { name: string }>(candidates: T[], name: string): T {
  const needle = name.toLowerCase();
  const exact = candidates.filter((c) => c.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0] as T;
  if (exact.length > 1) throw ambiguousNameError(name, exact);
  const prefixed = candidates.filter((c) => c.name.toLowerCase().startsWith(needle));
  if (prefixed.length === 1) return prefixed[0] as T;
  if (prefixed.length > 1) throw ambiguousNameError(name, prefixed);
  throw new BridgeError("not-found", `no actor found matching name: "${name}"`);
}

function ambiguousNameError(name: string, candidates: { name: string }[]): BridgeError {
  const list = candidates.map((c) => c.name).join(", ");
  return new BridgeError(
    "ambiguous-name",
    `"${name}" matches ${candidates.length} actors: ${list} — retry with a uuid instead`,
  );
}
