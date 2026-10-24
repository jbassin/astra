/**
 * @astra/ontology — typed reader over ontology-being's KDL (TS twin of astra-ontology).
 *
 *   import { loadBeing } from "@astra/ontology";
 *   const being = loadBeing();
 *   new Map(being.players.map((p) => [p.slug, p.player_id])); // preserved dice FKs
 *
 * The shared typed decoder (`@astra/config` `decodeKdl`) maps the KDL onto the schemas;
 * their markers pin the shape, so `canonicalJson()` matches Python's `canonical_json()`
 * byte-for-byte.
 */

import { join } from "node:path";

import { decodeKdl, findRepoRoot, loadKdl } from "@astra/config";

import { type Being, BeingSchema } from "./models";

export {
  type Being,
  BeingSchema,
  type Campaign,
  type HostLines,
  type Player,
  type PodcastPersona,
  type Role,
  type WealHost,
} from "./models";

/** `<repo-root>/ontology/ontology-being/being.kdl` (throws outside a checkout). */
export function defaultBeingFile(): string {
  return join(findRepoRoot(import.meta.dirname), "ontology", "ontology-being", "being.kdl");
}

/** Parse `being.kdl` → the validated `Being` truth store (`KdlDecodeError` names the node
 * when a required field is missing). */
export function loadBeing(path?: string): Being {
  return decodeKdl(BeingSchema, loadKdl(path ?? defaultBeingFile()));
}

/** Recursively sort object keys (arrays keep order) — matches Python's sort_keys. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Stable JSON (sorted keys, 2-space indent, trailing newline) — matches Python exactly. */
export function canonicalJson(being: Being): string {
  return `${JSON.stringify(sortKeysDeep(being), null, 2)}\n`;
}
