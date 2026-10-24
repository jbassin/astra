// The one route-tree generator for every TanStack Start frontend (`just routes-gen`).
//
//   node --import tsx \
//     libs/ts/site-kit/scripts/route-tree.ts [--check] [<domain>/<role> ...]
//
// With no apps it covers every apps/<domain>/<role> whose package.json depends on
// @tanstack/react-start. It writes each app's src/routeTree.gen.ts; `--check` writes nothing,
// regenerates in a scratch copy, and exits 1 naming each committed file that differs.

import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { findRepoRoot } from "@astra/config";

import { generateRouteTree, staleRouteTreeFiles } from "../src/routeTree";

const ROOT = findRepoRoot();

function startApps(): string[] {
  return globSync("apps/*/*/package.json", { cwd: ROOT })
    .filter((file) => {
      const pkg = JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as {
        dependencies?: Record<string, string>;
      };
      return Boolean(pkg.dependencies?.["@tanstack/react-start"]);
    })
    .map((file) => path.relative("apps", path.dirname(file)))
    .toSorted();
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const named = args.filter((a) => a !== "--check");
const apps = named.length > 0 ? named : startApps();

let stale = 0;
for (const app of apps) {
  const root = path.join(ROOT, "apps", app);
  if (!check) {
    await generateRouteTree({ root });
    console.log(`routes-gen: wrote apps/${app}/src/routeTree.gen.ts`);
    continue;
  }
  for (const file of await staleRouteTreeFiles(root)) {
    console.error(`routes-check: apps/${app}/${file} is stale`);
    stale += 1;
  }
}
if (stale > 0) {
  console.error("routes-check: run `just routes-gen` and commit the result");
  process.exit(1);
}
if (check) console.log(`routes-check: ${apps.length} route trees are fresh`);
