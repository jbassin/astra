/**
 * The real {@link PostgresStore} against a real Postgres. Opt-in: it runs only
 * when `WEAL_TEST_DATABASE_URL` names a throwaway database (CI never sets it).
 * It never truncates or deletes; it reads back only rows tagged with its own
 * random blame id. Start one with:
 *
 *   docker run --rm -d --name weal-pg-scratch -e POSTGRES_PASSWORD=x \
 *     -p 127.0.0.1:55432:5432 postgres:16-alpine
 *   WEAL_TEST_DATABASE_URL=postgres://postgres:x@127.0.0.1:55432/postgres \
 *     pnpm --filter @astra/weal-bot exec vitest run src/db.pg.test.ts
 *
 * Never point it at the live `weal-postgres`.
 */

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { PostgresStore, saveDice } from "./db";

const url = process.env.WEAL_TEST_DATABASE_URL;

describe.skipIf(url === undefined || url === "")("PostgresStore (real Postgres, opt-in)", () => {
  const blameId = 1_000_000 + Math.floor(Math.random() * 1_000_000);
  let store: PostgresStore;
  let sql: postgres.Sql;

  beforeAll(async () => {
    store = new PostgresStore(url ?? "");
    sql = postgres(url ?? "");
    await store.ensureSchema();
    await store.ensureSchema(); // idempotent
  });

  afterAll(async () => {
    await store.close();
    await sql.end();
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
      blameId,
    );
    const rows = await sql`
      select base, value, source, player_id, blame_id
      from dice where blame_id = ${blameId} order by id`;
    expect([...rows]).toEqual([
      { base: 20, value: 17, source: "discord", player_id: 42, blame_id: blameId },
      { base: 6, value: 4, source: "discord", player_id: 42, blame_id: blameId },
      { base: 6, value: 1, source: "discord", player_id: 42, blame_id: blameId },
    ]);
  });

  test("saved sources round-trip in id order with numeric ids", async () => {
    const name = `t${blameId}`;
    await store.insertFuncV2(name, "3");
    await store.insertFuncV2(name, "|x| x + 1");
    const mine = (await store.getAllFuncsV2()).filter((f) => f.name === name);
    expect(mine.map((f) => f.source)).toEqual(["3", "|x| x + 1"]);
    expect(typeof mine[0]?.id).toBe("number");
  });
});
