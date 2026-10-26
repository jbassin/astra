/**
 * The runner against a real Postgres. Runs only when ASTRA_TEST_DATABASE_URL is set
 * (`just pg-test`, or the CI pg-test job); see ./testing.ts.
 */
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { migrate, MigrationError, parseMigrations } from "./index";
import { createScratchDatabase, type ScratchDatabase, TEST_DATABASE_URL } from "./testing";

const m1 = { file: "0001_initial.sql", sql: "create table t (id int primary key);" };
const m2 = { file: "0002_add_note.sql", sql: "alter table t add column note text;" };

describe.skipIf(TEST_DATABASE_URL === undefined)("migrate (real Postgres)", () => {
  let db: ScratchDatabase;
  let sql: postgres.Sql;

  beforeEach(async () => {
    db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
    sql = postgres(db.url, { onnotice: () => {} });
  });

  afterEach(async () => {
    // Bounded: after a killed connection postgres.js 3.4.9 keeps that connection's dead query
    // and a plain `end()` waits on it for ever.
    await sql.end({ timeout: 2 });
    await db.drop();
  });

  const columns = async () =>
    (
      await sql`select column_name from information_schema.columns
                where table_name = 't' order by ordinal_position`
    ).map((r) => r.column_name as string);

  test("applies pending migrations in order and records each one", async () => {
    const r = await migrate(sql, parseMigrations([m1, m2]));
    expect(r.applied.map((m) => m.file)).toEqual(["0001_initial.sql", "0002_add_note.sql"]);
    expect(r.alreadyApplied).toBe(0);
    expect(await columns()).toEqual(["id", "note"]);
    const ledger = await sql`select version, name from schema_migrations order by version`;
    expect([...ledger]).toEqual([
      { version: 1, name: "initial" },
      { version: 2, name: "add_note" },
    ]);
  });

  test("a second run applies nothing", async () => {
    await migrate(sql, parseMigrations([m1]));
    const r = await migrate(sql, parseMigrations([m1, m2]));
    expect(r.applied.map((m) => m.version)).toEqual([2]);
    expect(r.alreadyApplied).toBe(1);
    const again = await migrate(sql, parseMigrations([m1, m2]));
    expect(again.applied).toEqual([]);
  });

  test("refuses to run when an applied migration's file changed", async () => {
    await migrate(sql, parseMigrations([m1]));
    const edited = { ...m1, sql: `${m1.sql}\n-- edited` };
    await expect(migrate(sql, parseMigrations([edited, m2]))).rejects.toThrow(
      /0001_initial.sql changed after it was applied/,
    );
    expect(await columns()).toEqual(["id"]); // 0002 did not run
  });

  test("a failing migration rolls back alone and earlier ones stay applied", async () => {
    const bad = { file: "0002_bad.sql", sql: "alter table t add column x int; select 1/0;" };
    await expect(migrate(sql, parseMigrations([m1, bad]))).rejects.toThrow(MigrationError);
    expect(await columns()).toEqual(["id"]); // column x rolled back
    const ledger = await sql`select version from schema_migrations`;
    expect(ledger.map((r) => r.version as number)).toEqual([1]);
    // The lock was released: a fixed file applies.
    const r = await migrate(sql, parseMigrations([m1, m2]));
    expect(r.applied.map((m) => m.version)).toEqual([2]);
  });

  test("concurrent runners apply each migration once", async () => {
    const slow = {
      file: "0002_slow.sql",
      sql: "select pg_sleep(0.3); alter table t add column note text;",
    };
    const other = postgres(db.url, { onnotice: () => {} });
    try {
      const ms = parseMigrations([m1, slow]);
      const [a, b] = await Promise.all([migrate(sql, ms), migrate(other, ms)]);
      // One runner did all the work; the other waited on the lock and found nothing pending.
      expect([a.applied.length, b.applied.length].sort((x, y) => x - y)).toEqual([0, 2]);
      expect(await columns()).toEqual(["id", "note"]);
    } finally {
      await other.end();
    }
  });

  test("a lock held by another session fails after the timeout instead of hanging", async () => {
    const holder = await sql.reserve();
    try {
      await holder.unsafe("select pg_advisory_lock(hashtext('astra.schema_migrations'))");
      const started = Date.now();
      await expect(migrate(sql, parseMigrations([m1]), { lockTimeoutMs: 300 })).rejects.toThrow(
        /could not take the migration lock within 300 ms/,
      );
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(await columns()).toEqual([]); // nothing ran
      await holder.unsafe("select pg_advisory_unlock(hashtext('astra.schema_migrations'))");
    } finally {
      holder.release();
    }
    // With the lock free again, the same run succeeds.
    expect((await migrate(sql, parseMigrations([m1]))).applied).toHaveLength(1);
  });

  test("a connection killed mid-migration fails the run instead of hanging", async () => {
    const slow = {
      file: "0002_slow.sql",
      sql: "select pg_sleep(30); alter table t add column note text;",
    };
    const killer = postgres(db.url, { max: 1, onnotice: () => {} });
    try {
      await migrate(sql, parseMigrations([m1]));
      const run = migrate(sql, parseMigrations([m1, slow])).then(
        () => undefined,
        (e: unknown) => e,
      );
      // Wait until the migration is inside pg_sleep, then terminate its backend.
      await vi.waitFor(
        async () => {
          const rows = await killer`select pg_terminate_backend(pid) as ok from pg_stat_activity
            where datname = current_database() and query like 'select pg_sleep(30)%'`;
          expect(rows.some((r) => r.ok === true)).toBe(true);
        },
        { timeout: 5_000, interval: 50 },
      );
      const started = Date.now();
      const err = await run;
      expect(err).toBeInstanceOf(MigrationError);
      expect(String(err)).toMatch(
        /^MigrationError: the database connection was lost while migrating;.*0002_slow.sql failed/,
      );
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      await killer.end();
    }
    // The pool recovers: a fresh connection sees 0002 unapplied and can apply a fixed file.
    expect(await columns()).toEqual(["id"]);
    const r = await migrate(sql, parseMigrations([m1, m2]));
    expect(r.applied.map((m) => m.version)).toEqual([2]);
  }, 30_000);

  test("an `if not exists` migration over an existing schema only records itself", async () => {
    await sql.unsafe("create table t (id int primary key)");
    const adopt = { file: "0001_initial.sql", sql: "create table if not exists t (id int);" };
    const r = await migrate(sql, parseMigrations([adopt]));
    expect(r.applied.map((m) => m.version)).toEqual([1]);
    expect(await columns()).toEqual(["id"]);
  });
});
