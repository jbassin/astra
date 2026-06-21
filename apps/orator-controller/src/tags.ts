/**
 * The fixed six tag buttons on the tag page. FIVE resolve to a real orator tag by (case-insensitive)
 * name; **"other" is a catch-all** for tracks in the collection that carry none of the five.
 * Colors come from orator (resolved by name); a named key with no orator tag renders dim.
 *
 * Their fixed key positions live in grid.ts (right two columns).
 */

export type TagKey = "explore" | "stealth" | "other" | "battle" | "calm" | "dungeon";

/** Tag page opened when you press a collection. */
export const DEFAULT_TAG_KEY: TagKey = "calm";

/** The five keys that map to a orator tag by name (lowercase = the lookup key). "other" is special. */
export const NAMED_TAG_KEYS = ["explore", "stealth", "battle", "calm", "dungeon"] as const;

/** Capitalised label for a tag button. */
export function tagLabel(key: TagKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}
