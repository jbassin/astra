// vitest global setup of every SSR frontend (wired by `defineSiteVitestConfig`): tests import
// `@/generated/*`, which `scripts/build-content.ts` writes and git ignores, so a fresh checkout
// (and CI) runs the script once before any test file loads.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import type { TestProject } from "vitest/node";

import { tsxLoader } from "./tsxLoader";

/** Whether `<root>/src/generated` holds at least one generated module. */
export function hasGeneratedContent(root: string): boolean {
  const dir = path.join(root, "src", "generated");
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".ts"));
}

export default function setup(project: TestProject): void {
  const { root } = project.config;
  if (hasGeneratedContent(root)) return;
  execFileSync("node", ["--import", tsxLoader(), "scripts/build-content.ts"], {
    cwd: root,
    stdio: "inherit",
  });
}
