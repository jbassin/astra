import type { Being } from "@astra/ontology";
import { describe, expect, test } from "vitest";

import { adminSnowflakes, buildAllowlist, isAllowed, parseOverride } from "./allowlist";

function being(players: Partial<Being["players"][number]>[]): Being {
  return {
    players: players.map((p, i) => ({
      slug: p.slug ?? `p${i}`,
      name: p.name ?? `P${i}`,
      player_id: p.player_id ?? i + 1,
      snowflakes: p.snowflakes ?? [],
      aliases: p.aliases ?? [],
      is_dm: p.is_dm ?? false,
      is_admin: p.is_admin ?? false,
      color: p.color ?? "rgb(0,0,0)",
    })),
    guest_color: "",
    campaigns: [],
    weal_hosts: [],
    podcast_personas: [],
  };
}

describe("adminSnowflakes", () => {
  test("collects snowflakes from admin players only", () => {
    const b = being([
      { is_admin: true, snowflakes: ["111", "222"] },
      { is_admin: false, snowflakes: ["333"] },
      { is_admin: true, snowflakes: ["444"] },
    ]);
    expect(adminSnowflakes(b).sort()).toEqual(["111", "222", "444"]);
  });

  test("empty when no admins", () => {
    expect(adminSnowflakes(being([{ is_admin: false, snowflakes: ["1"] }]))).toEqual([]);
  });
});

describe("parseOverride", () => {
  test("splits on commas and whitespace, drops blanks", () => {
    expect(parseOverride(" 1, 2  3 ,,4 ")).toEqual(["1", "2", "3", "4"]);
  });

  test("undefined / empty → []", () => {
    expect(parseOverride(undefined)).toEqual([]);
    expect(parseOverride("")).toEqual([]);
  });
});

describe("buildAllowlist", () => {
  test("unions admin snowflakes with the override and dedups", () => {
    const b = being([{ is_admin: true, snowflakes: ["111", "222"] }]);
    const set = buildAllowlist(b, "222, 999");
    expect([...set].sort()).toEqual(["111", "222", "999"]);
    expect(isAllowed("111", set)).toBe(true);
    expect(isAllowed("555", set)).toBe(false);
  });

  test("no override → just the ontology admins", () => {
    const b = being([{ is_admin: true, snowflakes: ["111"] }]);
    expect([...buildAllowlist(b)]).toEqual(["111"]);
  });
});
