import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { walkFiles } from "./fsWalk";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface FileHashEntry {
  relPath: string;
  sha256: string;
}

/**
 * The manifest's aggregate-hash rule (documented in `src/schema/manifest.ts`): sort
 * `<relPath>:<fileSha256>` lines lexicographically, join with `\n`, sha256 the result.
 * Sorting before hashing (not the incoming entry order) is what makes the aggregate
 * stable regardless of filesystem write/readdir order.
 */
export function hashFileEntries(entries: readonly FileHashEntry[]): string {
  const lines = entries
    .map((e) => `${e.relPath}:${e.sha256}`)
    .sort()
    .join("\n");
  return sha256Hex(lines);
}

/** Aggregate sha256 over every file under `root` (recursively) — the manifest's
 * `foundry.sha256` / `aon.sha256` value for a given snapshot directory. */
export function hashDirectory(root: string): string {
  const entries = walkFiles(root).map((f) => ({
    relPath: f.relPath,
    sha256: sha256Hex(readFileSync(f.absPath)),
  }));
  return hashFileEntries(entries);
}
