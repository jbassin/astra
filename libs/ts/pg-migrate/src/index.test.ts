import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type postgres from "postgres";
import { describe, expect, test } from "vitest";

import { checksum, loadMigrations, migrate, MigrationError, parseMigrations, plan } from "./index";

const files = (...names: string[]) => names.map((file) => ({ file, sql: `-- ${file}` }));

describe("parseMigrations", () => {
  test("orders by version and checksums each file", () => {
    const ms = parseMigrations(files("0002_add_col.sql", "0001_initial.sql"));
    expect(ms.map((m) => [m.version, m.name])).toEqual([
      [1, "initial"],
      [2, "add_col"],
    ]);
    expect(ms[0]?.checksum).toBe(checksum("-- 0001_initial.sql"));
  });

  test("ignores files that are not .sql", () => {
    expect(parseMigrations(files("0001_initial.sql", "README.md"))).toHaveLength(1);
  });

  test.each([["0001-initial.sql"], ["001_initial.sql"], ["0001_Initial.sql"], ["initial.sql"]])(
    "refuses the badly named %s",
    (name) => {
      expect(() => parseMigrations(files(name))).toThrow(MigrationError);
    },
  );

  test("refuses a gap, a duplicate, and a start other than 0001", () => {
    expect(() => parseMigrations(files("0001_a.sql", "0003_c.sql"))).toThrow(/0002 belongs/);
    expect(() => parseMigrations(files("0001_a.sql", "0001_b.sql"))).toThrow(/0002 belongs/);
    expect(() => parseMigrations(files("0002_b.sql"))).toThrow(/0001 belongs/);
  });
});

describe("loadMigrations", () => {
  test("reads a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-migrate-"));
    writeFileSync(join(dir, "0001_initial.sql"), "create table t (id int);");
    const [m] = loadMigrations(dir);
    expect(m?.sql).toBe("create table t (id int);");
  });

  test("refuses an empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-migrate-"));
    expect(() => loadMigrations(dir)).toThrow(/no migration files/);
  });
});

describe("plan", () => {
  const ms = parseMigrations(files("0001_a.sql", "0002_b.sql", "0003_c.sql"));
  const row = (i: number) => {
    const m = ms[i];
    if (!m) throw new Error("no migration");
    return { version: m.version, name: m.name, checksum: m.checksum };
  };

  test("a fresh database has every migration pending", () => {
    expect(plan(ms, []).pending.map((m) => m.version)).toEqual([1, 2, 3]);
  });

  test("applied migrations are skipped", () => {
    expect(plan(ms, [row(0), row(1)]).pending.map((m) => m.version)).toEqual([3]);
  });

  test("refuses an applied migration whose file changed", () => {
    expect(() => plan(ms, [{ ...row(0), checksum: "0".repeat(64) }])).toThrow(
      /0001_a.sql changed after it was applied/,
    );
  });

  test("refuses an applied migration whose file was renamed", () => {
    expect(() => plan(ms, [{ ...row(0), name: "old" }])).toThrow(/applied as old/);
  });

  test("refuses an applied version with no file below the newest file", () => {
    expect(() => plan(ms.slice(0, 1).concat(ms.slice(2)), [row(0), row(1)])).toThrow();
  });

  test("refuses a pending migration below an applied one", () => {
    expect(() => plan(ms, [row(0), row(2)])).toThrow(/0002_b.sql is pending but version 3/);
  });

  test("allows a database that is ahead of the files, and reports it", () => {
    const { pending, ahead } = plan(ms.slice(0, 2), [row(0), row(1), row(2)]);
    expect(pending).toEqual([]);
    expect(ahead.map((r) => r.version)).toEqual([3]);
  });
});

// A scripted connection: each statement answers no rows or throws, so the cleanup paths a dead
// connection would take run without one. (postgres.js hangs on a reserved connection whose
// backend was terminated, so a real-Postgres version of these tests is not practical.)
function fakeSql(fail: (stmt: string) => boolean) {
  const ran: string[] = [];
  let released = false;
  const conn = {
    unsafe: (stmt: string) => {
      ran.push(stmt);
      if (fail(stmt)) return Promise.reject(new Error(`failed: ${stmt}`));
      return Promise.resolve([]);
    },
    release: () => {
      released = true;
    },
  };
  const sql = { reserve: () => Promise.resolve(conn) } as unknown as postgres.Sql;
  return { sql, ran, released: () => released };
}

describe("migrate cleanup", () => {
  const ms = parseMigrations([{ file: "0001_boom.sql", sql: "boom" }]);

  test("a failed rollback and unlock don't replace the migration's error", async () => {
    const f = fakeSql((s) => s === "boom" || s === "rollback" || s.includes("advisory_unlock"));
    const err = await migrate(f.sql, ms).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationError);
    expect((err as MigrationError).message).toMatch(/^0001_boom.sql failed and was rolled back/);
    expect((err as MigrationError).suppressed.map(String)).toEqual([
      "Error: failed: rollback",
      expect.stringContaining("advisory_unlock"),
    ]);
    expect(f.released()).toBe(true);
  });

  test("a lock timeout fails with a lock message and skips the unlock", async () => {
    const f = fakeSql((s) => s.includes("advisory_lock("));
    await expect(migrate(f.sql, ms, { lockTimeoutMs: 50 })).rejects.toThrow(
      /could not take the migration lock within 50 ms/,
    );
    expect(f.ran).toContain("set lock_timeout = 50");
    expect(f.ran.some((s) => s.includes("advisory_unlock"))).toBe(false);
  });

  test("after a clean run, a failed unlock still fails the run", async () => {
    const f = fakeSql((s) => s.includes("advisory_unlock"));
    await expect(
      migrate(f.sql, parseMigrations([{ file: "0001_ok.sql", sql: "ok" }])),
    ).rejects.toThrow(/cleanup after migrating failed/);
  });
});
