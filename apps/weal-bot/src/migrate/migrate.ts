/**
 * One-shot roll-history migration (faerrin `mouth.db` → weal-postgres) — the
 * Phase-6 data move weal deferred (orator did its equivalent in 0010). Copies the
 * `dice` + `funcs` rows into weal-postgres **preserving every id and `player_id`**
 * (the load-bearing FK), applying faerrin's save-guard as the junk filter (drop any
 * die whose `base` exceeds `MAX_BASE` — pool size was an insert-time guard, so the
 * historical rows are already pool-filtered). On the current cleaned `mouth.db` the
 * filter is a no-op (0 junk of 8932); it documents + enforces the cutover's "exclude
 * junk" intent against a dirtier source.
 *
 * Reads `bun:sqlite` + writes Bun `SQL` (Postgres), so it needs both a live PG and
 * the sqlite file — it is **not** run in CI (only the pure `keepDieRow` predicate is
 * unit-tested). The destination DB URL defaults to config.kdl `weal.database_url`
 * (config-single-source — the in-network cutover run needs no arg). But that value is
 * the in-cluster Compose DNS (`weal-postgres:5432`), unreachable from the HOST, and
 * `@astra/config`'s env-override only applies to secrets — so an **optional second CLI
 * arg overrides the DB URL** for a host/ad-hoc run against the published port (compose
 * maps `10362:5432`), symmetric with the sqlite source being an explicit arg:
 *
 *   # in-network (real cutover): DB URL from config
 *   bun run src/migrate/migrate.ts /path/to/mouth.db
 *   # from the host: override to the published port
 *   bun run src/migrate/migrate.ts /path/to/mouth.db postgres://weal:weal@localhost:10362/weal
 */

import { Database } from "bun:sqlite";
import { loadConfig } from "@astra/config";
import { SQL } from "bun";
import { MAX_BASE, SCHEMA } from "../db";

type Row = Record<string, unknown>;

/**
 * The per-row junk filter = faerrin's save-guard (`base ≤ MAX_BASE`). Pool size
 * (`MAX_POOL`) was an insert-time guard, not a per-row property, so historical rows
 * are already pool-filtered; `base` is the per-row check a novelty die (e.g. d10000)
 * fails. Pure — the only part run under CI.
 */
export function keepDieRow(base: number): boolean {
  return Number.isInteger(base) && base >= 1 && base <= MAX_BASE;
}

export interface MigrateOpts {
  sqlitePath: string;
  databaseUrl: string;
  /** Logger; defaults to console.log. */
  log?: (msg: string) => void;
}

export interface MigrateResult {
  dice: number;
  funcs: number;
  /** Dice rows dropped by the junk filter (expected 0 on the cleaned mouth.db). */
  skipped: number;
  /** Distinct preserved player_ids (the load-bearing FK), sorted. */
  players: number[];
}

/** Run the migration. Idempotent: row inserts are `on conflict do nothing`. */
export async function migrate(opts: MigrateOpts): Promise<MigrateResult> {
  const log = opts.log ?? ((m: string) => console.log(`[weal-migrate] ${m}`));
  const db = new Database(opts.sqlitePath, { readonly: true });
  const sql = new SQL(opts.databaseUrl);

  await sql.unsafe(SCHEMA); // ensure the target schema exists

  // dice — filter junk, preserve every id + player_id + timestamp.
  const diceRows = db
    .query<Row, []>("SELECT id, base, value, source, timestamp, player_id, blame_id FROM dice")
    .all();
  let kept = 0;
  let skipped = 0;
  const players = new Set<number>();
  for (const r of diceRows) {
    if (!keepDieRow(Number(r.base))) {
      skipped++;
      continue;
    }
    await sql.unsafe(
      `insert into dice (id, base, value, source, timestamp, player_id, blame_id)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`,
      [r.id, r.base, r.value, r.source, r.timestamp, r.player_id, r.blame_id],
    );
    kept++;
    players.add(Number(r.player_id));
  }
  log(`dice: ${kept} kept, ${skipped} skipped (junk)`);

  // funcs — copy all, preserve id.
  const funcRows = db.query<Row, []>("SELECT id, name, payload FROM funcs").all();
  for (const r of funcRows) {
    await sql.unsafe(
      `insert into funcs (id, name, payload) values ($1, $2, $3) on conflict do nothing`,
      [r.id, r.name, r.payload],
    );
  }
  log(`funcs: ${funcRows.length}`);

  // Reset each table's identity sequence past the migrated max(id) so new inserts
  // don't collide with the preserved ids.
  for (const table of ["dice", "funcs"]) {
    await sql.unsafe(
      `select setval(pg_get_serial_sequence('${table}', 'id'),
         greatest((select coalesce(max(id), 0) from ${table}), 1))`,
    );
  }

  await sql.end();
  db.close();
  return {
    dice: kept,
    funcs: funcRows.length,
    skipped,
    players: [...players].sort((a, b) => a - b),
  };
}

if (import.meta.main) {
  // arg 2 = the path to faerrin's mouth.db (a one-shot migration source, not astra
  // config). arg 3 (optional) = the destination DB URL, overriding the config default
  // for a host run against the published port (config's value is in-cluster DNS).
  const sqlitePath = process.argv[2];
  if (!sqlitePath) {
    console.error("usage: bun run src/migrate/migrate.ts /path/to/mouth.db [databaseUrl]");
    process.exit(1);
  }
  const databaseUrl = process.argv[3] || loadConfig().weal.databaseUrl;
  if (!databaseUrl) {
    console.error(
      "[weal-migrate] weal.database_url is empty (set it / override WEAL_DATABASE_URL)",
    );
    process.exit(1);
  }
  const res = await migrate({ sqlitePath, databaseUrl });
  console.log(
    `[weal-migrate] done: ${res.dice} dice, ${res.funcs} funcs, ${res.skipped} skipped, ` +
      `players ${res.players.join(",")}`,
  );
}
