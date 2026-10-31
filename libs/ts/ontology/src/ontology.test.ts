import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { defaultBeingFile, loadBeing } from "./index";

/** Recursively sort object keys (arrays keep order), as Python's `sort_keys=True` does. */
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

function writeTemp(text: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "being-")), "being.canonical.json");
  writeFileSync(file, text);
  return file;
}

describe("@astra/ontology", () => {
  test("players preserve player_id + identity", () => {
    const being = loadBeing();
    expect(being.players.map((p) => p.player_id)).toEqual([1, 2, 3, 4, 5]);
    const josh = being.players.find((p) => p.slug === "josh");
    expect(josh?.is_dm).toBe(true);
    expect(josh?.color).toBe("rgb(232,184,232)"); // the aether theme.scss color
    const jorge = being.players.find((p) => p.slug === "jorge");
    expect(jorge?.snowflakes).toEqual(["712150290169593856", "753011285003730955"]);
  });

  test("GM is per-campaign; host types stay distinct", () => {
    const being = loadBeing();
    const fey = being.campaigns.find((c) => c.slug === "fey-in-the-mists");
    const gm = fey?.roles.find((r) => r.character === "Gamemaster");
    expect(gm?.player).toBe("tanner");
    const hostSlugs = new Set(being.weal_hosts.map((h) => h.slug));
    const personaSlugs = new Set(being.podcast_personas.map((p) => p.slug));
    expect([...hostSlugs].filter((s) => personaSlugs.has(s))).toEqual([]);
    expect(being.weal_hosts.find((h) => h.slug === "gsr")?.color).toBe("#276C4C");
  });

  test("each campaign declares its world", () => {
    const being = loadBeing();
    const bySlug = new Map(being.campaigns.map((c) => [c.slug, c]));
    expect(bySlug.get("through-a-song-darkly")?.world).toBe("faerrin");
    expect(bySlug.get("fey-in-the-mists")?.world).toBe("finnegan's ring");
    expect(bySlug.get("observatory-slipped")?.world).toBe("ushas");
    expect(bySlug.get("deep-eyes")?.world).toBe("althane");
    expect(being.campaigns.filter((c) => c.world === "faerrin").length).toBe(7);
    expect(bySlug.get("urth")?.world).toBe("urth");
    expect(being.astra_worlds).toEqual(["faerrin", "althane", "ushas", "urth"]);
  });

  test("the schema keeps every field of the generated JSON (py↔ts shape parity)", () => {
    // Re-serializing the parsed Being must reproduce the file byte for byte: a field the
    // schema drops, renames or defaults shows up here as a diff.
    const text = readFileSync(defaultBeingFile(), "utf8");
    expect(`${JSON.stringify(sortKeysDeep(loadBeing()), null, 2)}\n`).toBe(text);
  });

  test("a field Python added but the schema lacks fails loudly", () => {
    const raw = JSON.parse(readFileSync(defaultBeingFile(), "utf8"));
    raw.players[0].nickname = "jb";
    expect(() => loadBeing(writeTemp(JSON.stringify(raw)))).toThrow(/nickname/);
  });

  test("a missing field fails loudly, never as undefined", () => {
    const raw = JSON.parse(readFileSync(defaultBeingFile(), "utf8"));
    delete raw.players[0].name;
    expect(() => loadBeing(writeTemp(JSON.stringify(raw)))).toThrow(/name/);
  });
});
