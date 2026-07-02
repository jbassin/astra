/**
 * The weal roll-history + macro store — TS port of faerrin's `discord/src/db/*` and
 * `migrations/0001_init.sql`, on **Postgres** (Decision F) via Bun's built-in SQL.
 *
 * Two tables: `dice` (one row per die, keyed by the load-bearing `player_id`) and
 * `funcs` (saved macros — serde-JSON payloads, see [[serde.ts]]). The pathological-pool
 * **save-guards** (`save_die`) live here, in the bot, not the DB — a novelty roll like
 * `10000d10000` is still rolled & shown, just not persisted.
 */

import type { SQL } from "bun";
import type { RollDie } from "./roller";

/** Skip pools larger than this many dice (each die is one row). */
export const MAX_POOL = 30;
/** Skip any die whose base exceeds this (no real polyhedral die is bigger). */
export const MAX_BASE = 100;

/** Idempotent schema — the Postgres translation of faerrin's SQLite `0001_init.sql`. */
export const SCHEMA = `
create table if not exists dice (
  id        bigserial   primary key,
  base      integer     not null,
  value     integer     not null,
  source    text        not null default 'discord',
  timestamp timestamptz not null default now(),
  player_id integer     not null,
  blame_id  integer     not null
);
create index if not exists dice_base_timestamp on dice (base, timestamp);

create table if not exists funcs (
  id      bigserial primary key,
  name    text not null,
  payload text not null
);
`;

export interface Func {
  name: string;
  payload: string;
}

/** The persistence surface the bot needs — injectable so the logic unit-tests dry. */
export interface WealStore {
  ensureSchema(): Promise<void>;
  insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void>;
  getAllFuncs(): Promise<Func[]>;
  insertFunc(name: string, payload: string): Promise<void>;
}

/**
 * `save_die`'s guards as a pure function: the `[base, value]` rows that should persist
 * for a rolled die. Empty when the pool is too large; per-die when a base is too big.
 */
export function diceToPersist(roll: RollDie): [number, number][] {
  if (roll.dice.length > MAX_POOL) return [];
  return roll.dice.filter(([base]) => base <= MAX_BASE);
}

/** Persist a rolled die under the save-guards (port of `save_die`). */
export async function saveDie(
  store: WealStore,
  roll: RollDie,
  playerId: number,
  blameId: number,
): Promise<void> {
  for (const [base, value] of diceToPersist(roll)) {
    await store.insertDie(base, value, playerId, blameId);
  }
}

/** Bun-SQL-backed Postgres implementation of {@link WealStore}. */
export class PostgresStore implements WealStore {
  readonly #sql: SQL;

  constructor(databaseUrl: string) {
    // Type-only import above (a static value import from "bun" fails vitest's
    // module resolution at import time, even under `bun run vitest`); the
    // runtime constructor is only ever touched here, behind the global — so
    // tests that never construct PostgresStore never hit it. Superseded by
    // postgres.js at R3 (S5).
    this.#sql = new Bun.SQL(databaseUrl);
  }

  async ensureSchema(): Promise<void> {
    await this.#sql.unsafe(SCHEMA);
  }

  async insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void> {
    await this
      .#sql`insert into dice (base, value, source, player_id, blame_id) values (${base}, ${value}, 'discord', ${playerId}, ${blameId})`;
  }

  async getAllFuncs(): Promise<Func[]> {
    const rows = await this.#sql`select name, payload from funcs`;
    return rows as unknown as Func[];
  }

  async insertFunc(name: string, payload: string): Promise<void> {
    await this.#sql`insert into funcs (name, payload) values (${name}, ${payload})`;
  }

  async close(): Promise<void> {
    await this.#sql.end();
  }
}
