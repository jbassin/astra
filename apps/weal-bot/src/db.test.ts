/**
 * Store logic — the save-guards and schema, unit-tested with a fake store (no live
 * Postgres, per spec W12). The PostgresStore wire layer is exercised in the Phase-6
 * migration/integration run.
 */

import { describe, expect, test } from "vitest";

import { diceToPersist, type Func, MAX_POOL, SCHEMA, saveDie, type WealStore } from "./db";
import type { RollDie } from "./roller";

function rollDie(dice: [number, number][]): RollDie {
  const value = dice.reduce((s, [, v]) => s + v, 0);
  return { k: "Die", text: "x", value, min: 0, max: 0, dice, reroll: () => rollDie(dice) };
}

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
}

describe("diceToPersist — save-guards", () => {
  test("normal pool persists every die", () => {
    expect(
      diceToPersist(
        rollDie([
          [20, 5],
          [6, 3],
        ]),
      ),
    ).toEqual([
      [20, 5],
      [6, 3],
    ]);
  });

  test("base > 100 is dropped per-die (rest kept)", () => {
    expect(
      diceToPersist(
        rollDie([
          [200, 5],
          [20, 3],
        ]),
      ),
    ).toEqual([[20, 3]]);
  });

  test("base == 100 is kept (boundary)", () => {
    expect(diceToPersist(rollDie([[100, 7]]))).toEqual([[100, 7]]);
  });

  test("pool of exactly MAX_POOL persists; one more is dropped wholesale", () => {
    const ok = Array.from({ length: MAX_POOL }, () => [6, 1] as [number, number]);
    expect(diceToPersist(rollDie(ok))).toHaveLength(MAX_POOL);
    const tooBig = Array.from({ length: MAX_POOL + 1 }, () => [6, 1] as [number, number]);
    expect(diceToPersist(rollDie(tooBig))).toEqual([]);
  });
});

describe("saveDie", () => {
  test("inserts exactly the persisted dice with player/blame ids", async () => {
    const store = new FakeStore();
    await saveDie(
      store,
      rollDie([
        [20, 5],
        [200, 9],
        [6, 2],
      ]),
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
    await saveDie(store, rollDie(tooBig), 1, 1);
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
});
