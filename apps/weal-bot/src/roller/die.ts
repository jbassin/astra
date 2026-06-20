/**
 * Die construction, distribution math, and rolling — TS port of `roller/src/die.rs`.
 * Pure except `dieValue`, whose randomness is funneled through the {@link RollRng}
 * seam so the parity harness can inject deterministic faces (spec K1 surface 2).
 */

import { type BinOpr, binOprDisplay, binOprModify, type Die } from "./types";
import {
  type Counter,
  cartesianProductSingle,
  combineTwoPossibilities,
  counterAdd,
  counterToIter,
  indicesOfKGreatest,
  indicesOfKLeast,
  listToString,
} from "./utils";

/** The randomness seam. `genRange` is inclusive on both ends (Rust `1..=base`). */
export interface RollRng {
  /** Uniform integer in `[loInclusive, hiInclusive]` — Rust `gen_range(1..=base)`. */
  genRange(loInclusive: number, hiInclusive: number): number;
  /** Uniform choice from a non-empty array — Rust `slice.choose(rng)`. */
  choose<T>(xs: T[]): T;
}

export interface DieRes {
  value: number;
  repr: string;
  dice: [number, number][];
}

export const dieConst = (c: number): Die => ({ k: "Constant", c });
export const dieFromBase = (count: number, base: number): Die => ({ k: "Base", count, base });
export const dieFromSequence = (count: number, sequence: number[]): Die => ({
  k: "Seq",
  count,
  values: [...sequence],
});
export const dieFromBinOp = (lhs: Die, opr: BinOpr, rhs: Die): Die => ({
  k: "BinOp",
  lhs,
  opr,
  rhs,
});

/** `Die::count` — only Base/Seq carry a quantity. */
export function dieCount(d: Die): number | null {
  return d.k === "Base" || d.k === "Seq" ? d.count : null;
}

export function dieTakeHighest(collect: number, die: Die): Die {
  const c = dieCount(die);
  if (c === null) throw new RollError("Die must have a valid quantity!");
  if (c <= collect) throw new RollError("Requested take count must be less than quantity of die!");
  return { k: "TakeHighest", collect, die };
}

export function dieTakeLowest(collect: number, die: Die): Die {
  const c = dieCount(die);
  if (c === null) throw new RollError("Die must have a valid quantity!");
  if (c <= collect) throw new RollError("Requested take count must be less than quantity of die!");
  return { k: "TakeLowest", collect, die };
}

/** A roller-domain error — carries the same message text faerrin returns as `Err`. */
export class RollError extends Error {}

/** `Die::as_single` — the single-die form (count 1) for take-highest/lowest expansion. */
function dieAsSingle(d: Die): Die | null {
  switch (d.k) {
    case "Constant":
      return { k: "Constant", c: d.c };
    case "Base":
      return { k: "Base", count: 1, base: d.base };
    case "Seq":
      return { k: "Seq", count: 1, values: [...d.values] };
    default:
      return null;
  }
}

/** `Die::possibilities` — the full multiset of outcomes (the plot/distribution base). */
export function diePossibilities(d: Die): Counter {
  switch (d.k) {
    case "Constant": {
      const c: Counter = new Map();
      counterAdd(c, d.c);
      return c;
    }
    case "Base": {
      if (d.count === 1) {
        const c: Counter = new Map();
        for (let v = 1; v <= d.base; v++) counterAdd(c, v);
        return c;
      }
      const face: number[] = [];
      for (let v = 1; v <= d.base; v++) face.push(v);
      let acc = face;
      for (let i = 2; i <= d.count; i++) acc = combineTwoPossibilities(acc, "Add", face);
      return counterFromList(acc);
    }
    case "Seq": {
      if (d.count === 1) return counterFromList(d.values);
      let acc = [...d.values];
      for (let i = 2; i <= d.count; i++) acc = combineTwoPossibilities(acc, "Add", d.values);
      return counterFromList(acc);
    }
    case "BinOp": {
      const lhs = counterToIter(diePossibilities(d.lhs));
      const rhs = counterToIter(diePossibilities(d.rhs));
      return counterFromList(combineTwoPossibilities(lhs, d.opr, rhs));
    }
    case "TakeHighest":
    case "TakeLowest": {
      const { count, single } = quantified(d.die);
      const faces = counterToIter(diePossibilities(single));
      const keepHighest = d.k === "TakeHighest";
      return counterFromList(
        cartesianProductSingle(faces, count).map((x) =>
          sum([...x].sort((a, b) => (keepHighest ? b - a : a - b)).slice(0, d.collect)),
        ),
      );
    }
  }
}

/** The (count, single-die) of a quantified Die — guaranteed by take-h/l construction. */
function quantified(d: Die): { count: number; single: Die } {
  const count = dieCount(d);
  const single = dieAsSingle(d);
  if (count === null || single === null) throw new RollError("Die must have a valid quantity!");
  return { count, single };
}

/** `Die::repr` — the canonical display string (byte-exact with faerrin). */
export function dieRepr(d: Die): string {
  switch (d.k) {
    case "Constant":
      return d.c.toString();
    case "Base":
      return d.count === 1 ? `d${d.base}` : `${d.count}d${d.base}`;
    case "Seq":
      return d.count === 1
        ? `d{${listToString(d.values)}}`
        : `${d.count}d{${listToString(d.values)}}`;
    case "BinOp":
      return `${dieRepr(d.lhs)} ${binOprDisplay(d.opr)} ${dieRepr(d.rhs)}`;
    case "TakeHighest":
      return `max(${d.collect},${dieRepr(d.die)})`;
    case "TakeLowest":
      return `min(${d.collect},${dieRepr(d.die)})`;
  }
}

/** `Die::value` — roll the die, drawing faces from {@link RollRng}. */
export function dieValue(d: Die, rng: RollRng): DieRes {
  switch (d.k) {
    case "Constant":
      return { value: d.c, repr: d.c.toString(), dice: [] };
    case "Base": {
      if (d.count === 1) {
        const value = rng.genRange(1, d.base);
        return { value, repr: `${dieRepr(d)} ⟪${value}⟫`, dice: [[d.base, value]] };
      }
      const values: number[] = [];
      for (let i = 1; i <= d.count; i++) values.push(rng.genRange(1, d.base));
      const value = sum(values);
      return {
        value,
        repr: `${dieRepr(d)} ⟪${listToString(values)}=${value}⟫`,
        dice: values.map((x) => [d.base, x] as [number, number]),
      };
    }
    case "Seq": {
      if (d.count === 1) {
        const value = rng.choose(d.values);
        return { value, repr: `${dieRepr(d)} ⟪${value}⟫`, dice: [] };
      }
      const values: number[] = [];
      for (let i = 1; i <= d.count; i++) values.push(rng.choose(d.values));
      const value = sum(values);
      return { value, repr: `${dieRepr(d)} ⟪${listToString(values)}=${value}⟫`, dice: [] };
    }
    case "BinOp": {
      const { lhs, opr, rhs } = d;
      if (lhs.k === "Constant" && rhs.k === "Constant") {
        return {
          value: binOprModify(opr, lhs.c, rhs.c),
          repr: `${lhs.c} ${binOprDisplay(opr)} ${rhs.c}`,
          dice: [],
        };
      }
      if (rhs.k === "Constant") {
        const l = dieValue(lhs, rng);
        return {
          value: binOprModify(opr, l.value, rhs.c),
          repr: `${l.repr} ${binOprDisplay(opr)} ${rhs.c}`,
          dice: l.dice,
        };
      }
      if (lhs.k === "Constant") {
        const r = dieValue(rhs, rng);
        return {
          value: binOprModify(opr, lhs.c, r.value),
          repr: `${lhs.c} ${binOprDisplay(opr)} ${r.repr}`,
          dice: r.dice,
        };
      }
      const l = dieValue(lhs, rng);
      const r = dieValue(rhs, rng);
      return {
        value: binOprModify(opr, l.value, r.value),
        repr: `${l.repr} ${binOprDisplay(opr)} ${r.repr}`,
        dice: [...l.dice, ...r.dice],
      };
    }
    case "TakeHighest":
    case "TakeLowest": {
      const { count, single } = quantified(d.die);
      const values: number[] = [];
      const dicePer: [number, number][][] = [];
      for (let i = 0; i < count; i++) {
        const r = dieValue(single, rng);
        values.push(r.value);
        dicePer.push(r.dice);
      }
      const indices =
        d.k === "TakeHighest"
          ? indicesOfKGreatest(values, d.collect)
          : indicesOfKLeast(values, d.collect);
      const kept = new Set(indices);
      const value = sum(values.filter((_, i) => kept.has(i)));
      const shown = values.map((v, i) => (kept.has(i) ? `__**${v}**__` : v.toString())).join(",");
      return {
        value,
        repr: `${dieRepr(d)} ⟪${shown}=${value}⟫`,
        dice: dicePer.flat(),
      };
    }
  }
}

/** `Die::max` — the maximum possible value (no rolling). */
export function dieMax(d: Die): number {
  switch (d.k) {
    case "Constant":
      return d.c;
    case "Base":
      return d.count * d.base;
    case "Seq":
      return d.count * Math.max(...d.values);
    case "BinOp":
      return binOprModify(d.opr, dieMax(d.lhs), dieMax(d.rhs));
    case "TakeHighest":
    case "TakeLowest": {
      const { single } = quantified(d.die);
      return d.collect * dieMax(single);
    }
  }
}

/** `Die::min` — the minimum possible value (no rolling). */
export function dieMin(d: Die): number {
  switch (d.k) {
    case "Constant":
      return d.c;
    case "Base":
      return d.count;
    case "Seq":
      return d.count * Math.min(...d.values);
    case "BinOp":
      return binOprModify(d.opr, dieMin(d.lhs), dieMin(d.rhs));
    case "TakeHighest":
    case "TakeLowest": {
      const { single } = quantified(d.die);
      return d.collect * dieMin(single);
    }
  }
}

function counterFromList(values: number[]): Counter {
  const c: Counter = new Map();
  for (const v of values) counterAdd(c, v);
  return c;
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
