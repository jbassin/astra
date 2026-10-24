// Locator for `ontology/ontology-config/config.kdl` that starts from a plain directory
// (default `process.cwd()`, which is the app dir during `vite dev`/`vite build`), so a
// frontend's `vite.config.ts` reads the dev port from the SAME config.kdl as the runtime
// read in `server.ts` — one source (config-single-source). The walk itself is
// `@astra/config`'s `findRepoRoot`, the one root finder.

import { join } from "node:path";

import { findRepoRoot, loadConfig } from "@astra/config";

/** `<repo-root>/ontology/ontology-config/config.kdl`, found by walking up from `from`. */
export function siteConfigFile(from: string = process.cwd()): string {
  return join(findRepoRoot(from), "ontology", "ontology-config", "config.kdl");
}

/** Load config via the node-safe locator (for `vite.config.ts`). Returns the full config. */
export function loadSiteConfig(from?: string): ReturnType<typeof loadConfig> {
  return loadConfig(siteConfigFile(from));
}
