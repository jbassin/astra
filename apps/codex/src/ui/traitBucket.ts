/**
 * D29-46 — the trait-pill color-bucket lookup. `TraitPill` only ever
 * receives `{name: string}` (no category), so the bucket must be derivable
 * from the name alone. This is codex's disclosed 3-bucket SIMPLIFICATION of
 * the style-tokens doc's 4-bucket scheme (the doc's own purple/oxblood-maroon
 * /umber/amber buckets were derived from Færrin's bespoke trait vocabulary,
 * with a hand-picked 4th "mental/emotion/concentrate/archetype" maroon
 * cluster that has no clean equivalent in real PF2e's trait taxonomy — that
 * 4th bucket is dropped):
 *
 *   - rarity names (common/uncommon/rare/unique)              -> amber
 *   - the 4 casting traditions + the 4 alignment traits       -> purple
 *   - everything else (the default fallback)                  -> umber
 *
 * Matching is case-insensitive on the trimmed name — `TraitPill` usually
 * receives an already-humanized display string (e.g. "Uncommon", "Arcane"),
 * not the raw lowercase-hyphenated corpus token.
 */
export type TraitBucket = "purple" | "amber" | "umber";

const RARITY_NAMES: ReadonlySet<string> = new Set(["common", "uncommon", "rare", "unique"]);

const TRADITION_AND_ALIGNMENT_NAMES: ReadonlySet<string> = new Set([
  "arcane",
  "divine",
  "occult",
  "primal",
  "lawful",
  "chaotic",
  "good",
  "evil",
]);

export function traitBucket(name: string): TraitBucket {
  const key = name.trim().toLowerCase();
  if (RARITY_NAMES.has(key)) return "amber";
  if (TRADITION_AND_ALIGNMENT_NAMES.has(key)) return "purple";
  return "umber";
}
