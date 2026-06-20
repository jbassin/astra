/**
 * The roller's public surface — TS port of `roller/src/lib.rs`. `roll(text, init, rng)`
 * parses + evaluates an input, then materializes dice into concrete rolls by drawing
 * faces from a {@link RollRng}.
 *
 * RNG note: faerrin clones the RNG per display item (`rng.clone()`), which makes the
 * dice in a list perfectly correlated — a non-deterministic artifact of `StdRng`. This
 * port draws each die independently from one RNG (the saner behavior). It only affects
 * the production random path (the parity harness gates the deterministic surfaces and
 * never compares raw RNG output, per spec K1/Risk 2); flagged for review.
 */

import {
  type DieRes,
  dieMax,
  dieMin,
  diePossibilities,
  dieRepr,
  dieValue,
  type RollRng,
} from "./die";
import { interpret } from "./eval";
import type { Die, Display } from "./types";
import { type Counter, counterToIter, counterToProb } from "./utils";

export type { DieRes, RollRng } from "./die";
export { interpret } from "./eval";
export { parse } from "./parser";
export { exprToJson, resFromJson, resToJson } from "./serde";
export type { Atom, BinOpr, Die, Display, Expr, Res, UnOpr } from "./types";
export { dieMax, dieMin, diePossibilities, dieRepr, dieValue };

export interface RollNumber {
  k: "Number";
  text: string;
  value: number;
}
export interface RollDie {
  k: "Die";
  text: string;
  value: number;
  max: number;
  min: number;
  dice: [number, number][];
  /** Re-roll this die from scratch (faerrin's `reroll` closure). */
  reroll: () => Roll;
}
export type Roll = RollNumber | RollDie;

export interface Lazy {
  name: string;
  roll: Roll;
}
export interface Save {
  name: string;
  payload: string;
}
export interface Plot {
  text: string;
  prob: [number, number][];
  avg: number;
  std: number;
}

/** The four roll buckets — faerrin's `Res { to_plot, to_roll, to_roll_lazy, to_save }`. */
export interface RollOutput {
  toPlot: Plot[];
  toRoll: Roll[];
  toRollLazy: Lazy[];
  toSave: Save[];
}

export type RollResult = { ok: true; value: RollOutput } | { ok: false; error: string };

// --- Rollable accessors (lib.rs `Rollable` trait) -----------------------------------

export const rollText = (r: Roll): string => r.text;
export const rollValue = (r: Roll): number => r.value;
export const rollMax = (r: Roll): number => (r.k === "Number" ? r.value : r.max);
export const rollMin = (r: Roll): number => (r.k === "Number" ? r.value : r.min);
export const rollDice = (r: Roll): [number, number][] => (r.k === "Number" ? [] : r.dice);
export const reroll = (r: Roll): Roll => (r.k === "Number" ? r : r.reroll());

function displayToRoll(x: Display, rng: RollRng): Roll[] {
  switch (x.k) {
    case "Number":
      return [{ k: "Number", text: x.n.toString(), value: x.n }];
    case "Die": {
      const die = x.die;
      const { value, repr, dice }: DieRes = dieValue(die, rng);
      return [
        {
          k: "Die",
          text: repr,
          value,
          min: dieMin(die),
          max: dieMax(die),
          dice,
          // biome-ignore lint/style/noNonNullAssertion: a Die always yields one roll.
          reroll: () => displayToRoll({ k: "Die", die }, rng)[0]!,
        },
      ];
    }
    case "List":
      return x.items.flatMap((item) => displayToRoll(item, rng));
  }
}

function avg(data: number[]): number {
  let s = 0;
  for (const v of data) s += v;
  return s / data.length;
}

function std(data: number[]): number {
  const a = avg(data);
  let variance = 0;
  for (const v of data) variance += (a - v) * (a - v);
  return Math.sqrt(variance / data.length);
}

function dieToPlot(d: Die): Plot {
  const pos: Counter = diePossibilities(d);
  const prob = counterToProb(pos);
  const iter = counterToIter(pos);
  return { text: dieRepr(d), prob, avg: avg(iter), std: std(iter) };
}

/** `roll` — the public entry: parse + eval + materialize against the RNG. */
export function roll(text: string, init: [string, string][], rng: RollRng): RollResult {
  const r = interpret(text, init);
  if (!r.ok) return { ok: false, error: r.error };
  const { cmd } = r;
  return {
    ok: true,
    value: {
      toRoll: cmd.display.flatMap((x) => displayToRoll(x, rng)),
      toPlot: cmd.plot.map(dieToPlot),
      toRollLazy: cmd.lazy.map(([name, die]) => ({
        name,
        // biome-ignore lint/style/noNonNullAssertion: a Die always yields one roll.
        roll: displayToRoll({ k: "Die", die }, rng)[0]!,
      })),
      toSave: cmd.save.map(([name, payload]) => ({ name, payload })),
    },
  };
}

/** A non-deterministic RNG for production (the seed is cosmetic per spec K10). */
export class EntropyRng implements RollRng {
  genRange(loInclusive: number, hiInclusive: number): number {
    return loInclusive + Math.floor(Math.random() * (hiInclusive - loInclusive + 1));
  }
  choose<T>(xs: T[]): T {
    // biome-ignore lint/style/noNonNullAssertion: callers pass non-empty arrays.
    return xs[Math.floor(Math.random() * xs.length)]!;
  }
}
