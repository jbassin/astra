/**
 * The one repo-root finder (0037 LIB-11), the twin of `libs/py/config` `root.py`. Every
 * path the libraries derive from the checkout (`config.kdl`, the SOPS file, its age key,
 * `being.kdl`, the fixtures) starts here: one marker (`ontology/ontology-config`), and a
 * throw when no ancestor holds it. Nothing falls back to a guessed path.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MARKER = join("ontology", "ontology-config");
const memo = new Map<string, string>();

/** The checkout root: the nearest ancestor of `startDir` holding
 * `ontology/ontology-config`. Code calls this instead of climbing `../../`, so no path
 * depends on how deep an app sits under `apps/`. Memoized per `startDir`. Throws when no
 * ancestor matches. */
export function findRepoRoot(startDir: string = import.meta.dirname): string {
  const cached = memo.get(startDir);
  if (cached !== undefined) return cached;
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, MARKER))) break;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no ancestor of ${startDir} holds ${MARKER}`);
    dir = parent;
  }
  memo.set(startDir, dir);
  return dir;
}
