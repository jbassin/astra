/**
 * Host selection + goodness parity. `goodnessOf` is checked against the exact
 * integer-thirds boundaries of faerrin's `goodness.rs`; `hostSays` is checked to draw
 * from the correct bank, reading the real GSR lines from the ontology (K8).
 */

import { loadBeing, type WealHost } from "@astra/ontology";
import { describe, expect, test } from "vitest";
import { goodnessOf, hostSays, invertGoodness, type RollGoodness, rollGoodness } from "./hosts";
import type { Roll, RollRng } from "./roller";

function die(value: number, min: number, max: number): Roll {
  return { k: "Die", text: "x", value, min, max, dice: [], reroll: () => die(value, min, max) };
}

/** Deterministic RNG: always picks the first element. */
const firstRng: RollRng = { genRange: () => 0, choose: <T>(xs: T[]) => xs[0] as T };

describe("goodnessOf — integer thirds of [min,max] (d20: min1,max20)", () => {
  const cases: [number, RollGoodness][] = [
    [1, "fumble"],
    [2, "bad"],
    [6, "bad"],
    [7, "okay"],
    [13, "okay"],
    [14, "good"],
    [19, "good"],
    [20, "crit"],
  ];
  for (const [value, expected] of cases) {
    test(`${value} → ${expected}`, () => expect(goodnessOf(value, 1, 20)).toBe(expected));
  }
});

test("invertGoodness mirrors faerrin's table", () => {
  expect(invertGoodness("crit")).toBe("fumble");
  expect(invertGoodness("good")).toBe("bad");
  expect(invertGoodness("okay")).toBe("okay");
  expect(invertGoodness("bad")).toBe("good");
  expect(invertGoodness("fumble")).toBe("crit");
});

describe("hostSays draws from the right bank (real GSR ontology lines)", () => {
  const gsr = loadBeing().weal_hosts.find((h: WealHost) => h.slug === "gsr");
  if (gsr === undefined) throw new Error("gsr host missing from ontology");

  test("gsr has populated banks; knife is bankless", () => {
    expect(gsr.lines.crit.length).toBeGreaterThan(0);
    const knife = loadBeing().weal_hosts.find((h: WealHost) => h.slug === "knife");
    expect(knife?.lines.crit).toEqual([]);
  });

  test("a nat-20 → a GSR crit line", () => {
    const { host, line } = hostSays(gsr, die(20, 1, 20), firstRng);
    expect(host.slug).toBe("gsr");
    expect(line).toBe(gsr.lines.crit[0] as string);
    expect(rollGoodness(die(20, 1, 20))).toBe("crit");
  });

  test("a nat-1 → a GSR fumble line", () => {
    const { line } = hostSays(gsr, die(1, 1, 20), firstRng);
    expect(line).toBe(gsr.lines.fumble[0] as string);
  });
});
