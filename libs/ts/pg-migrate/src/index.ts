/**
 * The numbered-migration runner for astra's Postgres stores (orator-backend, weal-bot).
 *
 * A migration is one `NNNN_name.sql` file in an app's `migrations/` directory. The runner
 * applies the pending ones in version order, each in its own transaction, and records each
 * in a `schema_migrations` table with the sha256 of its file. A session advisory lock makes
 * concurrent runners against one database take turns. It refuses to run when an applied
 * migration's file changed, was renamed or is missing, or when a pending migration sorts
 * below one already applied.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getTracer } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
import type postgres from "postgres";

/** One migration file, read and checksummed. */
export interface Migration {
  /** The `NNNN` prefix as a number (1 for `0001_initial.sql`). */
  version: number;
  /** The part between the prefix and `.sql` (`initial`). */
  name: string;
  /** The file name (`0001_initial.sql`), for error messages. */
  file: string;
  sql: string;
  /** sha256 hex of the file's bytes. */
  checksum: string;
}

/** A row of `schema_migrations`. */
export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

export interface MigrateResult {
  /** The migrations this run applied, in order. */
  applied: Migration[];
  /** How many migrations were already applied before this run. */
  alreadyApplied: number;
  /**
   * Applied versions above the newest file: the database is ahead of this code (an older image
   * after a newer one migrated). The runner allows it, as Flyway does for future migrations;
   * the caller should log a WARN.
   */
  ahead: AppliedMigration[];
}

/** Any refusal or failure of the runner. The message names the file and the fix. */
export class MigrationError extends Error {
  override name = "MigrationError";
}

const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** The `schema_migrations` ledger. Created on first run; never altered by a migration. */
const LEDGER_DDL = `create table if not exists schema_migrations (
  version    integer     primary key,
  name       text        not null,
  checksum   text        not null,
  applied_at timestamptz not null default now()
)`;

/** One fixed lock id for every astra database; advisory locks are scoped to one database. */
const LOCK_SQL = "select pg_advisory_lock(hashtext('astra.schema_migrations'))";
const UNLOCK_SQL = "select pg_advisory_unlock(hashtext('astra.schema_migrations'))";

export function checksum(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Parse migration files (name + contents) into ordered migrations. Every `.sql` file must be
 * named `NNNN_name.sql` (lower-case name), and the versions must run 1, 2, 3, … with no gap or
 * duplicate. Other files are ignored.
 */
export function parseMigrations(files: readonly { file: string; sql: string }[]): Migration[] {
  const out: Migration[] = [];
  for (const { file, sql } of files) {
    if (!file.endsWith(".sql")) continue;
    const m = FILE_RE.exec(file);
    if (!m) {
      throw new MigrationError(
        `migration file ${file} is not named NNNN_name.sql (four digits, lower-case name)`,
      );
    }
    out.push({ version: Number(m[1]), name: m[2] ?? "", file, sql, checksum: checksum(sql) });
  }
  out.sort((a, b) => a.version - b.version);
  for (const [i, mig] of out.entries()) {
    if (mig.version !== i + 1) {
      throw new MigrationError(
        `migration versions must run 0001, 0002, … with no gap or duplicate; ` +
          `found ${mig.file} where version ${String(i + 1).padStart(4, "0")} belongs`,
      );
    }
  }
  return out;
}

/** Read and parse every `NNNN_name.sql` file in `dir` (see {@link parseMigrations}). */
export function loadMigrations(dir: string): Migration[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));
  if (files.length === 0) throw new MigrationError(`no migration files in ${dir}`);
  return parseMigrations(files);
}

/**
 * Check the ledger against the files. Returns the pending migrations and the applied versions
 * the files don't know (only allowed above the newest file). Throws on any other mismatch.
 */
export function plan(
  migrations: readonly Migration[],
  applied: readonly AppliedMigration[],
): { pending: Migration[]; ahead: AppliedMigration[] } {
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const newest = migrations.at(-1)?.version ?? 0;
  const ahead: AppliedMigration[] = [];
  for (const row of applied) {
    const mig = byVersion.get(row.version);
    if (!mig) {
      if (row.version > newest) {
        ahead.push(row);
        continue;
      }
      throw new MigrationError(
        `schema_migrations has version ${row.version} (${row.name}) but no file for it exists`,
      );
    }
    if (mig.name !== row.name) {
      throw new MigrationError(
        `${mig.file} was applied as ${row.name}; never rename an applied migration`,
      );
    }
    if (mig.checksum !== row.checksum) {
      throw new MigrationError(
        `${mig.file} changed after it was applied (checksum ${row.checksum.slice(0, 12)}… ` +
          `in schema_migrations, ${mig.checksum.slice(0, 12)}… on disk); never edit an ` +
          `applied migration, add a new one`,
      );
    }
  }
  const appliedVersions = new Set(applied.map((r) => r.version));
  const pending = migrations.filter((m) => !appliedVersions.has(m.version));
  const highestApplied = Math.max(0, ...appliedVersions);
  const early = pending.find((m) => m.version < highestApplied);
  if (early) {
    throw new MigrationError(
      `${early.file} is pending but version ${highestApplied} is already applied; ` +
        `renumber it above the newest applied migration`,
    );
  }
  return { pending, ahead };
}

/** One log line for a run; the caller logs it at WARN when `ahead` is non-empty. */
export function describeResult(r: MigrateResult): string {
  const parts = [
    r.applied.length > 0
      ? `applied ${r.applied.length} migration(s): ${r.applied.map((m) => m.file).join(", ")}`
      : "schema up to date",
    `${r.alreadyApplied} already applied`,
  ];
  if (r.ahead.length > 0) {
    parts.push(
      `database is ahead of this code: version(s) ${r.ahead.map((a) => a.version).join(", ")} ` +
        `have no file here`,
    );
  }
  return `schema_migrations: ${parts.join("; ")}`;
}

/**
 * Apply every pending migration to the database `sql` points at. Holds one connection and a
 * session advisory lock for the whole run, so a second runner waits and then finds nothing to
 * do. Each migration runs in its own transaction together with its ledger row: a failure rolls
 * that migration back, leaves the earlier ones applied, and throws.
 */
export function migrate(
  sql: postgres.Sql,
  migrations: readonly Migration[],
): Promise<MigrateResult> {
  return getTracer("astra.pg-migrate").startActiveSpan("db.migrate", async (span) => {
    const conn = await sql.reserve();
    try {
      // `if not exists` raises a NOTICE on every boot; keep it out of the logs.
      await conn.unsafe("set client_min_messages = warning");
      await conn.unsafe(LOCK_SQL);
      try {
        await conn.unsafe(LEDGER_DDL);
        const applied = (await conn.unsafe(
          "select version, name, checksum from schema_migrations order by version",
        )) as unknown as AppliedMigration[];
        const { pending, ahead } = plan(migrations, applied);
        span.setAttribute("db.migrations.already_applied", applied.length);
        span.setAttribute("db.migrations.pending", pending.length);
        for (const mig of pending) {
          await conn.unsafe("begin");
          try {
            await conn.unsafe(mig.sql);
            await conn.unsafe(
              "insert into schema_migrations (version, name, checksum) values ($1, $2, $3)",
              [mig.version, mig.name, mig.checksum],
            );
            await conn.unsafe("commit");
          } catch (err) {
            await conn.unsafe("rollback");
            throw new MigrationError(`${mig.file} failed and was rolled back: ${String(err)}`, {
              cause: err,
            });
          }
        }
        return { applied: pending, alreadyApplied: applied.length, ahead };
      } finally {
        await conn.unsafe(UNLOCK_SQL);
        await conn.unsafe("reset client_min_messages");
      }
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      conn.release();
      span.end();
    }
  });
}
