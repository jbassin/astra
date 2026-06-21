/**
 * One-shot library migration (M2 / lark → orator) — the live data move that
 * Decision M2 sanctions inside 0010 (weal deferred its equivalent to P6; orator
 * does it now). Copies faerrin `lark.sqlite`'s rows into orator-postgres
 * **preserving every id** (collections/tracks FKs are load-bearing), copies the
 * referenced audio files into the orator volume, and rewrites each track's
 * `file_path` to the new location.
 *
 * Reads `bun:sqlite` + writes Bun `SQL` (Postgres), so it needs both a live PG
 * and the sqlite file — it is **not** run in CI (only the pure `audioDestPath`
 * helper is unit-tested). The destination DB URL comes from config.kdl via
 * `@astra/config` (config-single-source — NOT an env duplicate); the only
 * argument is the path to the source `lark.sqlite`. Run it at deploy once
 * orator-postgres is up:
 *
 *   bun run src/migrate/migrate.ts /path/to/lark.sqlite [audioDestDir]
 */

import { Database } from "bun:sqlite";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { loadConfig } from "@astra/config";
import { SQL } from "bun";
import { SCHEMA } from "../db/schema";

/** Tables in FK-dependency order (parents before children). */
const TABLES_IN_ORDER = [
  "collections",
  "tracks",
  "tags",
  "track_tags",
  "playlists",
  "playlist_items",
  "download_jobs",
  "download_job_items",
  "api_keys",
] as const;

/** The new on-volume path for a track's audio file (basename under destAudioDir). */
export function audioDestPath(oldFilePath: string, destAudioDir: string): string {
  return join(destAudioDir, basename(oldFilePath));
}

type Row = Record<string, unknown>;

export interface MigrateOpts {
  sqlitePath: string;
  databaseUrl: string;
  /** Where to copy the audio files (the orator volume's audio dir). */
  destAudioDir: string;
  /** Logger; defaults to console.log. */
  log?: (msg: string) => void;
}

export interface MigrateResult {
  counts: Record<string, number>;
  audioCopied: number;
  audioMissing: string[];
}

/** Run the migration. Idempotent: row inserts are `on conflict do nothing`. */
export async function migrate(opts: MigrateOpts): Promise<MigrateResult> {
  const log = opts.log ?? ((m: string) => console.log(`[orator-migrate] ${m}`));
  const db = new Database(opts.sqlitePath, { readonly: true });
  const sql = new SQL(opts.databaseUrl);
  const destAudioDir = resolve(opts.destAudioDir);
  await mkdir(destAudioDir, { recursive: true });

  await sql.unsafe(SCHEMA); // ensure the target schema exists

  const counts: Record<string, number> = {};
  let audioCopied = 0;
  const audioMissing: string[] = [];

  for (const table of TABLES_IN_ORDER) {
    const rows = db.query<Row, []>(`SELECT * FROM ${table}`).all();
    for (const row of rows) {
      // For tracks, copy the audio file and rewrite file_path onto the volume.
      if (table === "tracks" && typeof row.file_path === "string" && row.file_path) {
        const src = row.file_path;
        const dest = audioDestPath(src, destAudioDir);
        try {
          await copyFile(src, dest);
          audioCopied++;
        } catch {
          audioMissing.push(src);
        }
        row.file_path = dest;
      }
      const cols = Object.keys(row);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      await sql.unsafe(
        `insert into ${table} (${cols.join(", ")}) values (${placeholders}) on conflict do nothing`,
        cols.map((c) => row[c]),
      );
    }
    counts[table] = rows.length;
    log(`${table}: ${rows.length} row(s)`);
  }

  // Reset each table's identity sequence past the migrated max(id) so new inserts
  // don't collide with the preserved ids.
  for (const table of TABLES_IN_ORDER) {
    if (table === "track_tags") continue; // composite PK, no identity sequence
    await sql.unsafe(
      `select setval(pg_get_serial_sequence('${table}', 'id'),
         greatest((select coalesce(max(id), 0) from ${table}), 1))`,
    );
  }

  log(`audio: ${audioCopied} copied, ${audioMissing.length} missing`);
  await sql.end();
  db.close();
  return { counts, audioCopied, audioMissing };
}

if (import.meta.main) {
  // The ONLY external input is the path to faerrin's lark.sqlite (a one-shot
  // migration source, not astra config) — taken as an explicit CLI arg. The
  // destination DB + audio dir come from the single config source (config.kdl via
  // @astra/config), NOT from ad-hoc env duplicates (config-single-source).
  const sqlitePath = process.argv[2];
  if (!sqlitePath) {
    console.error("usage: bun run src/migrate/migrate.ts <lark.sqlite> [audioDestDir]");
    process.exit(1);
  }
  const cfg = loadConfig().orator;
  const destAudioDir = process.argv[3] ?? resolve(cfg.dataDir, "audio");
  await migrate({ sqlitePath, databaseUrl: cfg.databaseUrl, destAudioDir });
}
