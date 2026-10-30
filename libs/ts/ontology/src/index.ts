/**
 * @astra/ontology — the typed `Being` (players, campaigns, hosts) for TS consumers.
 *
 *   import { loadBeing } from "@astra/ontology";
 *   const being = loadBeing();
 *   new Map(being.players.map((p) => [p.slug, p.player_id])); // preserved dice FKs
 *
 * Python (`astra_ontology`) is the one `being.kdl` parser: `just ontology-gen` writes
 * `being.canonical.json` from it, and `just ontology-check` fails when the JSON is stale.
 * This package reads only that JSON and validates it with the strict `BeingSchema`.
 * `sessions.kdl` (the per-session overrides) is the exception: `loadSessionOverrides`
 * parses it directly, the twin of `astra_ontology.sessions`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot } from "@astra/config";

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
export {
  defaultSessionsFile,
  loadSessionOverrides,
  loadSkippedSessions,
  parseSessionOverrides,
  type SessionOverride,
  SessionOverrideSchema,
  type SessionOverrides,
  SessionOverridesSchema,
  skippedKeys,
} from "./sessions";

/** `<repo-root>/ontology/ontology-being/being.canonical.json` (throws outside a checkout). */
export function defaultBeingFile(): string {
  return join(
    findRepoRoot(import.meta.dirname),
    "ontology",
    "ontology-being",
    "being.canonical.json",
  );
}

/** Read the generated `being.canonical.json` → the validated `Being` truth store. */
export function loadBeing(path?: string): Being {
  return BeingSchema.parse(JSON.parse(readFileSync(path ?? defaultBeingFile(), "utf8")));
}
