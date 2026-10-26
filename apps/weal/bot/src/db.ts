/**
 * The weal roll-history + macro store — Postgres via postgres.js. Two tables:
 * `dice` (one row per sampled NdM die, keyed by the load-bearing `player_id`)
 * and `funcs_v2` (weal v2 saved sources, loaded in id order at boot).
 *
 * The pathological-pool **save-guards** live here, in the bot, not the DB — a
 * novelty roll like `10000d10000` is still rolled & shown, just not persisted.
 *
 * The schema is the numbered files in `migrations/`, applied at boot by
 * {@link PostgresStore.migrate} (@astra/pg-migrate).
 */

import { resolve } from "node:path";

import { findPackageRoot } from "@astra/config";
import { loadMigrations, migrate, type MigrateResult } from "@astra/pg-migrate";
import postgres from "postgres";

/** The numbered schema migrations (`NNNN_name.sql`). */
export const MIGRATIONS_DIR = resolve(findPackageRoot(import.meta.dirname), "migrations");

/**
 * How long {@link PostgresStore.close} waits for in-flight queries before it drops the
 * connections. Without a bound, postgres.js 3.4.9's `end()` waits for ever on a connection whose
 * backend was killed mid-query. Kept under the shutdown hooks' share of
 * `telemetry.shutdown-timeout-ms`.
 */
export const CLOSE_TIMEOUT_S = 3;

/** Skip pools larger than this many dice (each die is one row). */
export const MAX_POOL = 30;
/** Skip any die whose base exceeds this (no real polyhedral die is bigger). */
const MAX_BASE = 100;

/** A weal v2 saved source (`funcs_v2` row; id drives the boot-load order). */
export interface FuncV2 {
  id: number;
  name: string;
  source: string;
}

/** The persistence surface the bot needs — injectable so the logic unit-tests dry. */
export interface WealStore {
  /** One roll's dice (`[base, face]` pairs) as one multi-row insert. */
  insertDice(dice: readonly [number, number][], playerId: number, blameId: number): Promise<void>;
  /** `funcs_v2` in id order, for the boot load (a later row can use an earlier one). */
  getAllFuncsV2(): Promise<FuncV2[]>;
  insertFuncV2(name: string, source: string): Promise<void>;
}

/**
 * `save_die`'s guards as a pure function over the engine's `standardDice`
 * pairs (`[base, face]` — kept, dropped, and explosion-chain draws alike, as
 * v1 recorded them): the rows that should persist. Empty when the pool is too large;
 * per-die when a base is too big.
 */
export function diceToPersist(standardDice: readonly [number, number][]): [number, number][] {
  if (standardDice.length > MAX_POOL) return [];
  return standardDice.filter(([base]) => base <= MAX_BASE);
}

/** Persist a die display's sampled dice under the save-guards, in one statement. */
export async function saveDice(
  store: WealStore,
  standardDice: readonly [number, number][],
  playerId: number,
  blameId: number,
): Promise<void> {
  const dice = diceToPersist(standardDice);
  if (dice.length === 0) return;
  await store.insertDice(dice, playerId, blameId);
}

/** postgres.js-backed Postgres implementation of {@link WealStore}. */
export class PostgresStore implements WealStore {
  readonly #sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.#sql = postgres(databaseUrl);
  }

  /** Apply pending migrations from {@link MIGRATIONS_DIR}. */
  migrate(): Promise<MigrateResult> {
    return migrate(this.#sql, loadMigrations(MIGRATIONS_DIR));
  }

  async insertDice(
    dice: readonly [number, number][],
    playerId: number,
    blameId: number,
  ): Promise<void> {
    const rows = dice.map(([base, value]) => ({
      base,
      value,
      source: "discord",
      player_id: playerId,
      blame_id: blameId,
    }));
    await this.#sql`insert into dice ${this.#sql(rows, "base", "value", "source", "player_id", "blame_id")}`;
  }

  async getAllFuncsV2(): Promise<FuncV2[]> {
    // bigserial comes back as a string from postgres.js — cast in SQL so the
    // id the WARN logs name is a plain number.
    const rows = await this.#sql`select id::int as id, name, source from funcs_v2 order by id`;
    return rows as unknown as FuncV2[];
  }

  async insertFuncV2(name: string, source: string): Promise<void> {
    await this.#sql`insert into funcs_v2 (name, source) values (${name}, ${source})`;
  }

  /** End the pool, waiting at most {@link CLOSE_TIMEOUT_S} for in-flight queries. */
  async close(): Promise<void> {
    await this.#sql.end({ timeout: CLOSE_TIMEOUT_S });
  }
}
