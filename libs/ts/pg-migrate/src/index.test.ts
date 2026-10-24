import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { checksum, loadMigrations, MigrationError, parseMigrations, plan } from "./index";

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
