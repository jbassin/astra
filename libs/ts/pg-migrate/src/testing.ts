/**
 * Helpers for the `*.pg.test.ts` suites that run a real store against a real Postgres.
 *
 * Those suites run only when `ASTRA_TEST_DATABASE_URL` names a throwaway server (`just pg-test`
 * starts one, or CI's `services: postgres`). Each suite creates its own database on that server
 * and drops it afterwards, so suites never see each other's rows. Never point the variable at a
 * live astra database: the suites create and drop databases on it.
 */
import { randomBytes } from "node:crypto";

import postgres from "postgres";

/** The admin URL of the throwaway server, or undefined when the pg suites should skip. */
export const TEST_DATABASE_URL: string | undefined =
  process.env.ASTRA_TEST_DATABASE_URL === "" ? undefined : process.env.ASTRA_TEST_DATABASE_URL;

export interface ScratchDatabase {
  /** A URL for the new, empty database. */
  url: string;
  /** Drop the database, closing any connections still open to it. */
  drop(): Promise<void>;
}

/** Create a uniquely named empty database on the server `adminUrl` points at. */
export async function createScratchDatabase(adminUrl: string): Promise<ScratchDatabase> {
  const name = `astra_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async drop() {
      const a = postgres(adminUrl, { max: 1, onnotice: () => {} });
      try {
        await a.unsafe(`drop database if exists ${name} with (force)`);
      } finally {
        await a.end();
      }
    },
  };
}
