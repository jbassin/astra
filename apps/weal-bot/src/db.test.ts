/**
 * Store logic — the save-guards over engine `standardDice` pairs (spec 0032
 * D32-17) and the schema, unit-tested with a fake store (no live Postgres).
 * The PostgresStore wire layer is exercised at the S7 live gate.
 */

import { describe, expect, test } from "vitest";

import {
  diceToPersist,
  type Func,
  type FuncV2,
  MAX_POOL,
  SCHEMA,
  saveDice,
  type WealStore,
} from "./db";

class FakeStore implements WealStore {
  readonly inserts: [number, number, number, number][] = [];
  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }
  insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void> {
    this.inserts.push([base, value, playerId, blameId]);
    return Promise.resolve();
  }
  getAllFuncs(): Promise<Func[]> {
    return Promise.resolve([]);
  }
  insertFunc(): Promise<void> {
    return Promise.resolve();
  }
  getAllFuncsV2(): Promise<FuncV2[]> {
    return Promise.resolve([]);
  }
  insertFuncV2(): Promise<void> {
    return Promise.resolve();
  }
}

describe("diceToPersist — save-guards over standardDice", () => {
  test("normal pool persists every sampled die", () => {
    expect(
      diceToPersist([
        [20, 5],
        [6, 3],
      ]),
    ).toEqual([
      [20, 5],
      [6, 3],
    ]);
  });

  test("base > 100 is dropped per-die (rest kept)", () => {
    expect(
      diceToPersist([
        [200, 5],
        [20, 3],
      ]),
    ).toEqual([[20, 3]]);
  });

  test("base == 100 is kept (boundary)", () => {
    expect(diceToPersist([[100, 7]])).toEqual([[100, 7]]);
  });

  test("pool of exactly MAX_POOL persists; one more is dropped wholesale", () => {
    const ok = Array.from({ length: MAX_POOL }, () => [6, 1] as [number, number]);
    expect(diceToPersist(ok)).toHaveLength(MAX_POOL);
    const tooBig = Array.from({ length: MAX_POOL + 1 }, () => [6, 1] as [number, number]);
    expect(diceToPersist(tooBig)).toEqual([]);
  });
});

describe("saveDice", () => {
  test("inserts exactly the persisted dice with player/blame ids", async () => {
    const store = new FakeStore();
    await saveDice(
      store,
      [
        [20, 5],
        [200, 9],
        [6, 2],
      ],
      42,
      7,
    );
    expect(store.inserts).toEqual([
      [20, 5, 42, 7],
      [6, 2, 42, 7],
    ]);
  });

  test("a junk pool inserts nothing", async () => {
    const store = new FakeStore();
    const tooBig = Array.from({ length: MAX_POOL + 1 }, () => [6, 1] as [number, number]);
    await saveDice(store, tooBig, 1, 1);
    expect(store.inserts).toEqual([]);
  });
});

describe("SCHEMA", () => {
  test("creates the dice + funcs tables and the index", () => {
    expect(SCHEMA).toContain("create table if not exists dice");
    expect(SCHEMA).toContain("create table if not exists funcs");
    expect(SCHEMA).toContain("dice_base_timestamp");
    expect(SCHEMA).toContain("player_id integer");
  });

  test("appends the D32-17 funcs_v2 table (v1 funcs untouched)", () => {
    expect(SCHEMA).toContain("create table if not exists funcs_v2");
    expect(SCHEMA).toContain("source text not null");
  });
});
