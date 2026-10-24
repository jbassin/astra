// Fails when a built bundle (vite's SSR build or a tsdown server bundle) imports a package the
// production image won't have
// (`just ssr-externals-check`, run by `just ts-build` after the builds).
//
//   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
//     libs/ts/site-kit/scripts/ssr-externals-check.ts
//
// It covers every apps/<domain>/<role> with a dist/server or dist-server dir, so run it after
// building. The
// image installs only the app's production dependencies, so each bare import in the bundle
// must be a Node builtin or listed in the app's `dependencies` (see src/ssrExternals.ts).

import { existsSync, globSync } from "node:fs";
import path from "node:path";

import { findRepoRoot } from "@astra/config";

import { BUNDLE_DIRS, undeclaredSsrImports } from "../src/ssrExternals";

const ROOT = findRepoRoot();

const apps = [
  ...new Set(
    BUNDLE_DIRS.flatMap((dir) =>
      globSync(`apps/*/*/${dir}`, { cwd: ROOT }).map((found) =>
        found.split(path.sep).slice(0, 3).join(path.sep),
      ),
    ),
  ),
]
  .filter((app) => existsSync(path.join(ROOT, app, "package.json")))
  .toSorted();

let bad = 0;
for (const app of apps) {
  for (const problem of undeclaredSsrImports(path.join(ROOT, app))) {
    console.error(`ssr-externals: ${app}/${problem} is not a production dependency of ${app}`);
    bad += 1;
  }
}
if (bad > 0) {
  console.error(
    "ssr-externals: add ssrExternalsPlugin to the app's vite.config.ts, or list the package " +
      "in its package.json dependencies",
  );
  process.exit(1);
}
console.log(`ssr-externals: ${apps.length} apps' bundles import only production dependencies`);
