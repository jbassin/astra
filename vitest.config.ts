import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";
import { parse } from "yaml";

// One vitest process for every TS workspace package (ADR 0028): `pnpm vitest run` here, or
// `just ts-test`. Each package with a `test` script is a project, so membership follows the
// workspace globs in pnpm-workspace.yaml and needs no list. A project keeps its own config
// (vitest.config.ts, else vite.config.ts, else vitest's defaults) with its environment,
// aliases, globalSetup and setupFiles, rooted at the package; `pnpm --filter <pkg> test`
// still runs one package alone.
const ROOT = import.meta.dirname;

function workspaceGlobs(): string[] {
  const doc = parse(readFileSync(path.join(ROOT, "pnpm-workspace.yaml"), "utf8")) as {
    packages: string[];
  };
  return doc.packages;
}

function hasTestScript(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, dir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return Boolean(pkg.scripts?.test);
  } catch {
    // A workspace glob also matches directories without a package.json (apps/*/py).
    return false;
  }
}

// vitest looks for its config by walking up from the working directory, so `vitest run` in a
// package without a config of its own (libs/ts/*, apps/portal/*) also lands here. Only a run
// from the repo root gets the projects; a package run keeps vitest's defaults, as before.
const atRoot = path.resolve(process.cwd()) === ROOT;

const projects = atRoot
  ? workspaceGlobs()
      .flatMap((glob) => globSync(glob, { cwd: ROOT }))
      .filter(hasTestScript)
      .toSorted()
  : undefined;

export default defineConfig({
  test: {
    projects,
  },
});
