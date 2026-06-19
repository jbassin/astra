/**
 * @astra/ontology — typed reader over ontology-being's KDL (TS twin of astra-ontology).
 *
 *   import { loadBeing } from "@astra/ontology";
 *   const being = loadBeing();
 *   new Map(being.players.map((p) => [p.slug, p.player_id])); // preserved dice FKs
 *
 * The walk is explicit (named field reads) so the shape is pinned and `canonicalJson()`
 * matches Python's `canonical_json()` byte-for-byte.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Node, parse } from "@bgotink/kdl";
import { type Being, BeingSchema, type Campaign, type Role } from "./models";

export {
  type Being,
  BeingSchema,
  type Campaign,
  type Player,
  type PodcastPersona,
  type Role,
  type WealHost,
} from "./models";

function childrenNamed(node: Node, name: string): Node[] {
  return (node.children?.nodes ?? []).filter((c) => c.name.name === name);
}

function slug(node: Node): string {
  return String(node.getArgumentEntries()[0]?.getValue());
}

function scalar(node: Node, name: string): unknown {
  const entries = childrenNamed(node, name)[0]?.getArgumentEntries() ?? [];
  return entries.length ? entries[0]?.getValue() : undefined;
}

function argList(node: Node, name: string): string[] {
  const child = childrenNamed(node, name)[0];
  return child ? child.getArgumentEntries().map((e) => String(e.getValue())) : [];
}

function props(node: Node): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of node.getPropertyEntryMap()) out[key] = entry.getValue();
  return out;
}

function toRole(node: Node): Role {
  const p = props(node);
  const klass = p.class;
  return {
    player: String(p.player),
    character: String(p.character),
    character_class: klass === undefined ? null : String(klass),
    descriptions: childrenNamed(node, "desc").map((c) =>
      String(c.getArgumentEntries()[0]?.getValue()),
    ),
  };
}

function toCampaign(node: Node): Campaign {
  return {
    slug: slug(node),
    name: String(scalar(node, "name")),
    edition: String(scalar(node, "edition")),
    main: Boolean(scalar(node, "main")),
    roles: childrenNamed(node, "role").map(toRole),
  };
}

function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "ontology", "ontology-being"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** `<repo-root>/ontology/ontology-being/being.kdl`. */
export function defaultBeingFile(): string {
  return join(findRepoRoot(import.meta.dir), "ontology", "ontology-being", "being.kdl");
}

/** Parse `being.kdl` → the validated `Being` truth store. */
export function loadBeing(path?: string): Being {
  const doc = parse(readFileSync(path ?? defaultBeingFile(), "utf8"));
  const being: Being = {
    players: [],
    guest_color: "",
    campaigns: [],
    weal_hosts: [],
    podcast_personas: [],
  };

  for (const node of doc.nodes) {
    switch (node.name.name) {
      case "player":
        being.players.push({
          slug: slug(node),
          name: String(scalar(node, "name")),
          player_id: Number(scalar(node, "player-id")),
          snowflakes: argList(node, "snowflakes"),
          aliases: argList(node, "aliases"),
          is_dm: Boolean(scalar(node, "is-dm")),
          is_admin: Boolean(scalar(node, "is-admin")),
          color: String(scalar(node, "color")),
        });
        break;
      case "campaign":
        being.campaigns.push(toCampaign(node));
        break;
      case "weal-host":
        being.weal_hosts.push({
          slug: slug(node),
          name: String(scalar(node, "name")),
          color: String(scalar(node, "color")),
          avatar: String(scalar(node, "avatar")),
        });
        break;
      case "podcast-persona":
        being.podcast_personas.push({
          slug: slug(node),
          name: String(scalar(node, "name")),
          voice_id: String(scalar(node, "voice-id")),
          voice_name: String(scalar(node, "voice-name")),
          persona: String(scalar(node, "persona")),
        });
        break;
      case "guest-color":
        being.guest_color = String(node.getArgumentEntries()[0]?.getValue());
        break;
    }
  }

  return BeingSchema.parse(being);
}

/** Recursively sort object keys (arrays keep order) — matches Python's sort_keys. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
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
