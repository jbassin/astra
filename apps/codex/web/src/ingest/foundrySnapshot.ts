import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { walkFiles } from "./fsWalk";

/**
 * Counts entity docs under a `packs/pf2e` tree: every `.json` file except
 * `_folders.json` (Foundry's compendium-folder metadata, not content — pack dirs nest
 * arbitrarily, e.g. `spells/spells/rank-1/…`, so this walks the whole subtree rather
 * than assuming a fixed depth).
 */
export function countFoundryDocs(packsPfeRoot: string): number {
  return walkFiles(packsPfeRoot).filter(
    (f) =>
      f.relPath.endsWith(".json") &&
      !f.relPath.endsWith("/_folders.json") &&
      f.relPath !== "_folders.json",
  ).length;
}

/**
 * Recursively copies every file under `srcDir` into `destDir`, preserving relative
 * structure. Used to lift the paths P1 needs (`packs/pf2e`, `static/lang`) out of the
 * throwaway sparse clone into the committed snapshot layout.
 */
export function copyTree(srcDir: string, destDir: string): void {
  for (const f of walkFiles(srcDir)) {
    const dest = join(destDir, f.relPath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(f.absPath, dest);
  }
}
