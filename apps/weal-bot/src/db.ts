/**
 * The weal roll-history + macro store — Postgres via postgres.js (Decision F,
 * 0022 S5). Three tables: `dice` (one row per sampled NdM die, keyed by the
 * load-bearing `player_id`), `funcs_v2` (weal v2 saved sources, spec 0032
 * D32-17), and v1 `funcs` — kept as a **dead archive** (v1 payloads don't
 * migrate; no loader call sites remain).
 *
 * The pathological-pool **save-guards** live here, in the bot, not the DB — a
 * novelty roll like `10000d10000` is still rolled & shown, just not persisted.
 */

import postgres from "postgres";

/** Skip pools larger than this many dice (each die is one row). */
export const MAX_POOL = 30;
/** Skip any die whose base exceeds this (no real polyhedral die is bigger). */
export const MAX_BASE = 100;

/** Idempotent schema — v1 tables verbatim + the D32-17 `funcs_v2` appended. */
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

create table if not exists funcs_v2 (
  id     bigserial primary key,
  name   text not null,
  source text not null
);
`;

/** A v1 saved macro (dead archive — kept for the table's sake). */
export interface Func {
  name: string;
  payload: string;
}

/** A weal v2 saved source (`funcs_v2` row; id drives the boot-load order). */
export interface FuncV2 {
  id: number;
  name: string;
  source: string;
}

/** The persistence surface the bot needs — injectable so the logic unit-tests dry. */
export interface WealStore {
  ensureSchema(): Promise<void>;
  insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void>;
  /** v1 archive reads (no loader call sites — kept for tooling/migration use). */
  getAllFuncs(): Promise<Func[]>;
  insertFunc(name: string, payload: string): Promise<void>;
  /** `funcs_v2` in id order — the D32-17 boot-load. */
  getAllFuncsV2(): Promise<FuncV2[]>;
  insertFuncV2(name: string, source: string): Promise<void>;
}

/**
 * `save_die`'s guards as a pure function over the engine's `standardDice`
 * pairs (`[base, face]` — kept, dropped, and explosion-chain draws alike,
 * D32-11): the rows that should persist. Empty when the pool is too large;
 * per-die when a base is too big.
 */
export function diceToPersist(standardDice: readonly [number, number][]): [number, number][] {
  if (standardDice.length > MAX_POOL) return [];
  return standardDice.filter(([base]) => base <= MAX_BASE);
}

/** Persist a die display's sampled dice under the save-guards. */
export async function saveDice(
  store: WealStore,
  standardDice: readonly [number, number][],
  playerId: number,
  blameId: number,
): Promise<void> {
  for (const [base, value] of diceToPersist(standardDice)) {
    await store.insertDie(base, value, playerId, blameId);
  }
}

/** postgres.js-backed Postgres implementation of {@link WealStore} (R3, 0022 S5 — off Bun.SQL onto the Node-runtime-portable postgres.js; tagged-template call sites are unchanged). */
export class PostgresStore implements WealStore {
  readonly #sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.#sql = postgres(databaseUrl);
  }

  async ensureSchema(): Promise<void> {
    await this.#sql.unsafe(SCHEMA);
  }

  async insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void> {
    await this.#sql`insert into dice (base, value, source, player_id, blame_id) values (${base}, ${value}, 'discord', ${playerId}, ${blameId})`;
  }

  async getAllFuncs(): Promise<Func[]> {
    const rows = await this.#sql`select name, payload from funcs`;
    return rows as unknown as Func[];
  }

  async insertFunc(name: string, payload: string): Promise<void> {
    await this.#sql`insert into funcs (name, payload) values (${name}, ${payload})`;
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

  async close(): Promise<void> {
    await this.#sql.end();
  }
}
