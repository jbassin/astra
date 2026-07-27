/**
 * Results file (D31-10) — one JSONL row appended per finished game (including
 * aborted ones — `end` from any phase still records). Fail-soft: a write error is
 * a real outage signal (data loss, unlike a quiz typo) so it logs at ERROR, but
 * must never crash the game.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { getLogger } from "@astra/observe";

import type { ResultRow } from "./schema";

const log = getLogger("astra.menhir");

/** Append one result row to `path` as a JSONL line. Never throws — a failure logs
 * ERROR and returns, so a full disk / bad path degrades the game, not crashes it. */
export async function appendResultRow(path: string, row: ResultRow): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(row)}\n`, "utf8");
  } catch (err) {
    log.emit({
      severityText: "ERROR",
      body: `menhir: failed to append results row to ${path}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
