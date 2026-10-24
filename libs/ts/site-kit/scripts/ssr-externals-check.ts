// Fails when a built SSR bundle imports a package the production image won't have
// (`just ssr-externals-check`, run by `just ts-build` after the builds).
//
//   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
//     libs/ts/site-kit/scripts/ssr-externals-check.ts
//
// It covers every apps/<domain>/<role> with a dist/server dir, so run it after building. The
// image installs only the app's production dependencies, so each bare import in the bundle
// must be a Node builtin or listed in the app's `dependencies` (see src/ssrExternals.ts).

import { existsSync, globSync } from "node:fs";
import path from "node:path";

import { findRepoRoot } from "@astra/config";

import { undeclaredSsrImports } from "../src/ssrExternals";

const ROOT = findRepoRoot();

const apps = globSync("apps/*/*/dist/server", { cwd: ROOT })
  .map((dir) => path.dirname(path.dirname(dir)))
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
console.log(`ssr-externals: ${apps.length} SSR bundles import only production dependencies`);
