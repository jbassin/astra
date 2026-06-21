// Node-safe locator for `ontology/ontology-config/config.kdl`.
//
// `@astra/config`'s `defaultConfigFile()` resolves the repo root via Bun's
// `import.meta.dir`, which is undefined under vite's config loader — so a frontend's
// `vite.config.ts` cannot call `loadConfig()` with no args. This walks up from a
// plain directory (default `process.cwd()`, which is the app dir during `vite
// dev`/`vite build`) so the dev port comes from the SAME config.kdl as the runtime
// read in `server.ts` — one source, no `import.meta` (config-single-source).

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "@astra/config";

function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "ontology", "ontology-config"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

/** `<repo-root>/ontology/ontology-config/config.kdl`, found by walking up from `from`. */
export function siteConfigFile(from: string = process.cwd()): string {
  return join(findRepoRoot(from), "ontology", "ontology-config", "config.kdl");
}

/** Load config via the node-safe locator (for `vite.config.ts`). Returns the full config. */
export function loadSiteConfig(from?: string): ReturnType<typeof loadConfig> {
  return loadConfig(siteConfigFile(from));
}
