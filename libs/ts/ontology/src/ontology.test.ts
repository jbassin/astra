import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, loadBeing } from "./index";

function repoRoot(): string {
  let dir = resolve(import.meta.dir);
  for (;;) {
    if (existsSync(join(dir, "ontology", "ontology-being"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("repo root not found");
    dir = parent;
  }
}

const CANONICAL = join(repoRoot(), "ontology", "ontology-being", "being.canonical.json");

describe("@astra/ontology", () => {
  test("players preserve player_id + identity", () => {
    const being = loadBeing();
    expect(being.players.map((p) => p.player_id)).toEqual([1, 2, 3, 4, 5]);
    const josh = being.players.find((p) => p.slug === "josh");
    expect(josh?.is_dm).toBe(true);
    expect(josh?.color).toBe("rgb(232,184,232)"); // aether theme.scss set (I5)
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
    expect(bySlug.get("observatory-slipped")?.world).toBe("sedecium");
    expect(being.campaigns.filter((c) => c.world === "faerrin").length).toBe(5);
  });

  test("canonicalJson matches the committed snapshot (py↔ts parity gate)", () => {
    const being = loadBeing();
    expect(canonicalJson(being)).toBe(readFileSync(CANONICAL, "utf8"));
  });
});
