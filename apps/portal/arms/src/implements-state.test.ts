import { describe, expect, it } from "vitest";

import {
  adjust,
  inactiveTarget,
  parseImplementsFlag,
  reshuffle,
  thresholdsCrossed,
} from "./implements-state";

const SIX = ["a", "b", "c", "d", "e", "f"];
/** A seeded generator, so the random picks are repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("parseImplementsFlag", () => {
  it("reads bars, implements and active", () => {
    expect(
      parseImplementsFlag({ bars: ["x", "x"], implements: ["a", 3, ""], active: true }),
    ).toEqual({ bars: ["x"], implements: ["a"], active: true });
  });

  it.each([
    undefined,
    null,
    {},
    { bars: ["x"] },
    { implements: ["a"] },
    { bars: [], implements: ["a"] },
  ])("is no fight without bars and implements: %j", (flag) =>
    expect(parseImplementsFlag(flag)).toBeNull(),
  );
});

describe("thresholdsCrossed", () => {
  it("counts half and empty for each bar", () => {
    const full = { value: 260, max: 260 };
    expect(thresholdsCrossed([full, full, full])).toBe(0);
    expect(thresholdsCrossed([{ value: 131, max: 260 }, full, full])).toBe(0);
    expect(thresholdsCrossed([{ value: 130, max: 260 }, full, full])).toBe(1);
    expect(thresholdsCrossed([{ value: 0, max: 260 }, full, full])).toBe(2);
    expect(thresholdsCrossed([{ value: 0, max: 260 }, { value: 100, max: 260 }, full])).toBe(3);
  });

  it("ignores a bar with no max", () => {
    expect(thresholdsCrossed([{ value: 0, max: 0 }])).toBe(0);
  });
});

describe("inactiveTarget", () => {
  it("keeps one Implement active when every threshold is crossed", () => {
    const empty = { value: 0, max: 260 };
    expect(inactiveTarget([empty, empty, empty], 6)).toBe(5);
  });
});

describe("adjust", () => {
  it("adds one random active Implement and keeps the inactive ones", () => {
    const next = adjust(SIX, ["b"], 2, seeded(1));
    expect(next).toHaveLength(2);
    expect(next).toContain("b");
  });

  it("returns some of the inactive ones when the target drops", () => {
    const next = adjust(SIX, ["b", "c", "d"], 1, seeded(2));
    expect(next).toHaveLength(1);
    expect(["b", "c", "d"]).toContain(next[0]);
  });

  it("ignores ids that are not Implements", () => {
    expect(adjust(SIX, ["zz"], 0, seeded(3))).toEqual([]);
  });
});

describe("reshuffle", () => {
  it("draws a new set of the same size from every Implement", () => {
    const next = reshuffle(SIX, 3, seeded(4));
    expect(next).toHaveLength(3);
    expect(new Set(next).size).toBe(3);
    for (const id of next) expect(SIX).toContain(id);
  });

  it("varies with the random source", () => {
    const sets = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => reshuffle(SIX, 2, seeded(s)).sort().join()),
    );
    expect(sets.size).toBeGreaterThan(1);
  });
});
