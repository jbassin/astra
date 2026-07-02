/**
 * Die parity (spec K1 surfaces 2–4):
 *   - eval-given-faces: inject a deterministic face sequence, check value/repr/dice;
 *   - plot math: possibilities → prob/avg/std (exact);
 *   - property tests: every rolled value ∈ [min, max]; guards reject bad input.
 * RNG output itself is never compared (Rust StdRng ≠ TS RNG, spec Risk 2).
 */

import { describe, expect, test } from "vitest";

import {
  dieConst,
  dieFromBase,
  dieFromBinOp,
  dieMax,
  dieMin,
  diePossibilities,
  dieRepr,
  dieTakeHighest,
  dieValue,
  RollError,
  type RollRng,
} from "./die";
import { EntropyRng, roll } from "./index";
import type { Die } from "./types";
import { counterToProb } from "./utils";

/** Scripted RNG: `genRange` replays `faces` in order; `choose` replays `picks` (indices). */
class FaceRng implements RollRng {
  private gi = 0;
  private ci = 0;
  constructor(
    private readonly faces: number[],
    private readonly picks: number[] = [],
  ) {}
  genRange(): number {
    const f = this.faces[this.gi++];
    if (f === undefined) throw new Error("FaceRng: ran out of faces");
    return f;
  }
  choose<T>(xs: T[]): T {
    const idx = this.picks[this.ci++];
    if (idx === undefined) throw new Error("FaceRng: ran out of picks");
    return xs[idx]!;
  }
}

describe("die: eval given injected faces", () => {
  test("d20 → 20", () => {
    expect(dieValue(dieFromBase(1, 20), new FaceRng([20]))).toEqual({
      value: 20,
      repr: "d20 ⟪20⟫",
      dice: [[20, 20]],
    });
  });
  test("2d20 → 3,5", () => {
    expect(dieValue(dieFromBase(2, 20), new FaceRng([3, 5]))).toEqual({
      value: 8,
      repr: "2d20 ⟪3,5=8⟫",
      dice: [
        [20, 3],
        [20, 5],
      ],
    });
  });
  test("constant", () => {
    expect(dieValue(dieConst(5), new FaceRng([]))).toEqual({ value: 5, repr: "5", dice: [] });
  });
  test("d20 + 3", () => {
    const d = dieFromBinOp(dieFromBase(1, 20), "Add", dieConst(3));
    expect(dieValue(d, new FaceRng([7]))).toEqual({
      value: 10,
      repr: "d20 ⟪7⟫ + 3",
      dice: [[20, 7]],
    });
  });
  test("take-highest(1, 2d20) bolds the kept die", () => {
    const d = dieTakeHighest(1, dieFromBase(2, 20));
    expect(dieValue(d, new FaceRng([5, 18]))).toEqual({
      value: 18,
      repr: "max(1,2d20) ⟪5,__**18**__=18⟫",
      dice: [
        [20, 5],
        [20, 18],
      ],
    });
  });
});

describe("die: plot / distribution math", () => {
  test("d6 distribution", () => {
    const prob = counterToProb(diePossibilities(dieFromBase(1, 6)));
    expect(prob).toEqual([
      [1, 1 / 6],
      [2, 1 / 6],
      [3, 1 / 6],
      [4, 1 / 6],
      [5, 1 / 6],
      [6, 1 / 6],
    ]);
  });
  test("2d6 sum distribution (symmetric, peak at 7)", () => {
    const prob = counterToProb(diePossibilities(dieFromBase(2, 6)));
    expect(prob.map(([v]) => v)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // 36 ordered outcomes; 7 occurs 6 times.
    const seven = prob.find(([v]) => v === 7);
    expect(seven?.[1]).toBeCloseTo(6 / 36, 12);
    // Probabilities sum to 1.
    expect(prob.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 12);
  });
  test("d20 avg + std via the public plot path", () => {
    const r = roll("plot(d20)", [], new EntropyRng());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.toPlot).toHaveLength(1);
    const plot = r.value.toPlot[0];
    expect(plot?.text).toBe("d20");
    expect(plot?.avg).toBeCloseTo(10.5, 12);
    // population std of 1..20 = sqrt(399/12) ≈ 5.7663
    expect(plot?.std).toBeCloseTo(Math.sqrt(399 / 12), 12);
  });
});

describe("die: min/max", () => {
  test("2d6 bounds", () => {
    const d = dieFromBase(2, 6);
    expect(dieMin(d)).toBe(2);
    expect(dieMax(d)).toBe(12);
  });
  test("d20 + 3 bounds", () => {
    const d = dieFromBinOp(dieFromBase(1, 20), "Add", dieConst(3));
    expect(dieMin(d)).toBe(4);
    expect(dieMax(d)).toBe(23);
  });
});

describe("die: property — rolled value always in [min, max]", () => {
  const dice: Die[] = [
    dieFromBase(1, 4),
    dieFromBase(1, 6),
    dieFromBase(1, 20),
    dieFromBase(3, 6),
    dieFromBinOp(dieFromBase(2, 8), "Add", dieConst(5)),
    dieTakeHighest(2, dieFromBase(4, 6)),
  ];
  const rng = new EntropyRng();
  for (const d of dice) {
    test(dieRepr(d), () => {
      const lo = dieMin(d);
      const hi = dieMax(d);
      for (let i = 0; i < 500; i++) {
        const { value } = dieValue(d, rng);
        expect(value).toBeGreaterThanOrEqual(lo);
        expect(value).toBeLessThanOrEqual(hi);
      }
    });
  }
});

describe("die: error guards", () => {
  test("take-highest count must be < quantity", () => {
    expect(() => dieTakeHighest(2, dieFromBase(2, 20))).toThrow(RollError);
  });
  test("take-highest needs a quantified die", () => {
    expect(() => dieTakeHighest(1, dieConst(5))).toThrow(RollError);
  });
  test("d(0, 20) rejected via roll()", () => {
    const r = roll("d(0, 20)", [], new EntropyRng());
    expect(r.ok).toBe(false);
  });
  test("d(2, 6) builds 2d6 via roll()", () => {
    const r = roll("d(2, 6)", [], new EntropyRng());
    expect(r.ok).toBe(true);
  });
});
