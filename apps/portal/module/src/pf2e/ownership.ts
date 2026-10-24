/**
 * Ownership accessors. Ownership is Foundry core data, not pf2e's, but it sits on the same
 * stored source the rest of this layer reads, so handlers read it here too.
 *
 * Foundry stores ownership in two forms (`CONST.DOCUMENT_OWNERSHIP_LEVELS`, verified
 * `common/constants.mjs:372-397`). A world or embedded document's `ownership` holds numeric
 * levels per user id, plus `"default"` for everyone else. A compendium pack's ownership
 * config (`CompendiumCollection#CONFIG_FIELD`) holds level names per role.
 */
import { type Pf2eSource, record } from "./data";

/** Foundry's ownership levels, by name. */
export const OWNERSHIP_LEVELS: ReadonlyMap<string, number> = new Map([
  ["INHERIT", -1],
  ["NONE", 0],
  ["LIMITED", 1],
  ["OBSERVER", 2],
  ["OWNER", 3],
]);

export const OBSERVER_LEVEL = 2;
export const OWNER_LEVEL = 3;

/** A document's stored per-user `ownership` levels, keyed by user id (and `"default"`), in
 * stored order; entries whose level is not a number are dropped. */
export function documentOwnership(src: Pf2eSource): ReadonlyMap<string, number> {
  const levels = new Map<string, number>();
  for (const [userId, level] of Object.entries(record(src.ownership))) {
    if (typeof level === "number") levels.set(userId, level);
  }
  return levels;
}

/** The numeric level for a pack-config level name; an absent or unknown name reads as
 * `INHERIT` (-1), the least visible reading. */
export function packOwnershipLevel(name: string | undefined): number {
  return (name !== undefined ? OWNERSHIP_LEVELS.get(name) : undefined) ?? -1;
}
