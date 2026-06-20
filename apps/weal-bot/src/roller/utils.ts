/**
 * Roller helpers — TS port of `roller/src/utils.rs`. `Counter<isize>` becomes a
 * `Map<number, number>` (value → multiplicity). Iteration order: faerrin's `Counter`
 * is a hashmap (unordered) but every consumer either sums, sorts, or builds a product,
 * so order doesn't affect the deterministic surfaces the parity harness gates.
 */

import { type BinOpr, binOprModify, type Display, type Res } from "./types";

export type Counter = Map<number, number>;

export function counterAdd(c: Counter, value: number, by = 1): void {
  c.set(value, (c.get(value) ?? 0) + by);
}

export function counterFromValues(values: number[]): Counter {
  const c: Counter = new Map();
  for (const v of values) counterAdd(c, v);
  return c;
}

/** `cartesian_product_single` — all n-length tuples drawn from `vector`. */
export function cartesianProductSingle(vector: number[], n: number): number[][] {
  let r: number[][] = [[]];
  for (let i = 0; i < n; i++) {
    const next: number[][] = [];
    for (const v of r) for (const x of vector) next.push([...v, x]);
    r = next;
  }
  return r;
}

/** `list_to_string` — comma-joined, no spaces (used in die `repr`). */
export function listToString(l: number[]): string {
  return l.map((x) => x.toString()).join(",");
}

/** `combine_two_possibilities` — the multiset of `lhs opr rhs` over the product. */
export function combineTwoPossibilities(lhs: number[], opr: BinOpr, rhs: number[]): number[] {
  const out: number[] = [];
  for (const a of lhs) for (const b of rhs) out.push(binOprModify(opr, a, b));
  return out;
}

/** `counter_to_iter` — expand a counter back into a flat multiset. */
export function counterToIter(c: Counter): number[] {
  const out: number[] = [];
  for (const [t, count] of c) for (let i = 0; i < count; i++) out.push(t);
  return out;
}

/** `counter_to_prob` — sorted `(value, probability)` pairs (ascending by value). */
export function counterToProb(c: Counter): [number, number][] {
  let total = 0;
  for (const count of c.values()) total += count;
  return [...c.entries()]
    .map(([val, count]) => [val, count / total] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * `indices_of_k_greatest` — the indices of the k largest values. Sorted by value
 * descending; ties broken by index ascending (Rust's `BinaryHeap` tie order is
 * unspecified, so the parity harness uses distinct faces when it checks the kept-die
 * `repr` bolding; the *sum* of the kept dice is tie-invariant either way).
 */
export function indicesOfKGreatest(vec: number[], k: number): number[] {
  return vec
    .map((v, idx) => [idx, v] as [number, number])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, k)
    .map(([idx]) => idx);
}

/** `indices_of_k_least` — the indices of the k smallest values (tie: index asc). */
export function indicesOfKLeast(vec: number[], k: number): number[] {
  return vec
    .map((v, idx) => [idx, v] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .slice(0, k)
    .map(([idx]) => idx);
}

/** `res_to_disp` — project a `Res` into a `Display` (drops Unit/Sigil/Func/Builtin). */
export function resToDisp(r: Res): Display | null {
  switch (r.k) {
    case "Number":
      return { k: "Number", n: r.n };
    case "List": {
      const items: Display[] = [];
      for (const x of r.items) {
        const d = resToDisp(x);
        if (d !== null) items.push(d);
      }
      return { k: "List", items };
    }
    case "Die":
      return { k: "Die", die: r.die };
    default:
      return null;
  }
}
