/**
 * The real {@link PostgresStore} and its migrations against a real Postgres. Runs only when
 * ASTRA_TEST_DATABASE_URL names a throwaway server: `just pg-test` starts one, and the CI
 * pg-test job uses a `services: postgres` container. Each suite works in its own scratch
 * database (@astra/pg-migrate/testing). Never point it at the live `weal-postgres`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createScratchDatabase,
  type ScratchDatabase,
  TEST_DATABASE_URL,
} from "@astra/pg-migrate/testing";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { MIGRATIONS_DIR, PostgresStore, saveDice } from "./db";

describe.skipIf(TEST_DATABASE_URL === undefined)("PostgresStore (real Postgres)", () => {
  let db: ScratchDatabase;
  let store: PostgresStore;
  let sql: postgres.Sql;

  beforeAll(async () => {
    db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
    store = new PostgresStore(db.url);
    sql = postgres(db.url);
    const first = await store.migrate();
    expect(first.applied.map((m) => m.file)).toEqual(["0001_initial.sql", "0002_drop_funcs.sql"]);
    const second = await store.migrate();
    expect(second.applied).toEqual([]);
  });

  afterAll(async () => {
    await store.close();
    await sql.end();
    await db.drop();
  });

  test("the migrations create the two tables and the dice index", async () => {
    const tables = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`;
    expect(tables.map((r) => r.table_name as string)).toEqual([
      "dice",
      "funcs_v2",
      "schema_migrations",
    ]);
    const idx = await sql`select indexname from pg_indexes where tablename = 'dice'`;
    expect(idx.map((r) => r.indexname as string)).toContain("dice_base_timestamp");
  });

  test("one roll's dice land as rows in one insert, guards applied", async () => {
    await saveDice(
      store,
      [
        [20, 17],
        [6, 4],
        [6, 1],
        [1000, 5], // over MAX_BASE: dropped
      ],
      42,
      7,
    );
    const rows = await sql`
      select base, value, source, player_id, blame_id from dice order by id`;
    expect([...rows]).toEqual([
      { base: 20, value: 17, source: "discord", player_id: 42, blame_id: 7 },
      { base: 6, value: 4, source: "discord", player_id: 42, blame_id: 7 },
      { base: 6, value: 1, source: "discord", player_id: 42, blame_id: 7 },
    ]);
  });

  test("saved sources round-trip in id order with numeric ids", async () => {
    await store.insertFuncV2("smite", "3");
    await store.insertFuncV2("smite", "|x| x + 1");
    const all = await store.getAllFuncsV2();
    expect(all.map((f) => f.source)).toEqual(["3", "|x| x + 1"]);
    expect(typeof all[0]?.id).toBe("number");
  });
});

// The live upgrade path: a database built by the old boot-time `create table if not exists`
// block, with rows in it and the dead v1 `funcs` table beside them, adopts 0001 without changing
// anything, and 0002 drops only `funcs`.
describe.skipIf(TEST_DATABASE_URL === undefined)("migrations over a pre-ledger database", () => {
  test("0001 only records itself, 0002 drops v1 funcs, and the other rows stay", async () => {
    const db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
    const sql = postgres(db.url, { onnotice: () => {} });
    const store = new PostgresStore(db.url);
    try {
      await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, "0001_initial.sql"), "utf8"));
      await sql`insert into dice (base, value, player_id, blame_id) values (20, 5, 1, 1)`;
      await sql`insert into funcs_v2 (name, source) values ('bonus', '3')`;
      await sql`create table funcs (id bigserial primary key, name text not null, payload text not null)`;
      await sql`insert into funcs (name, payload) values ('adv', '{}')`;
      const r = await store.migrate();
      expect(r.applied.map((m) => m.file)).toEqual(["0001_initial.sql", "0002_drop_funcs.sql"]);
      const [n] = await sql`select count(*)::int as n from dice`;
      expect(n?.n).toBe(1);
      const [saved] = await sql`select count(*)::int as n from funcs_v2`;
      expect(saved?.n).toBe(1);
      const [v1] =
        await sql`select to_regclass('public.funcs') as t, to_regclass('public.funcs_id_seq') as s`;
      expect(v1).toEqual({ t: null, s: null });
    } finally {
      await store.close();
      await sql.end();
      await db.drop();
    }
  });
});
