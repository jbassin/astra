/**
 * Store logic — the save-guards over engine `standardDice` pairs, unit-tested
 * with a fake store. db.pg.test.ts runs the real
 * PostgresStore and its migrations against a throwaway Postgres.
 */

import { describe, expect, test } from "vitest";

import { diceToPersist, type FuncV2, MAX_POOL, saveDice, type WealStore } from "./db";

class FakeStore implements WealStore {
  readonly inserts: [number, number, number, number][] = [];
  statements = 0;
  insertDice(dice: readonly [number, number][], playerId: number, blameId: number): Promise<void> {
    this.statements += 1;
    for (const [base, value] of dice) this.inserts.push([base, value, playerId, blameId]);
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
  test("inserts exactly the persisted dice with player/blame ids, in one statement", async () => {
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
    expect(store.statements).toBe(1);
  });

  test("a junk pool sends no statement at all", async () => {
    const store = new FakeStore();
    const tooBig = Array.from({ length: MAX_POOL + 1 }, () => [6, 1] as [number, number]);
    await saveDice(store, tooBig, 1, 1);
    expect(store.statements).toBe(0);
  });
});
