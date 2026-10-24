// Scaffold a TanStack Start frontend on the site-kit preset (`just new-frontend <name>`).
//
//   node --import tsx \
//     libs/ts/site-kit/scripts/new-frontend.ts <name> [--port <n>]
//
// Writes apps/<name>/web and adds the app's block to config.kdl (and the fixture), its model to
// models.py, its compose service and its Caddy stanza. The recipe then runs `just ontology-gen`
// and `pnpm install`.

import path from "node:path";

import { findRepoRoot } from "@astra/config";

import { scaffoldFrontend, SHARED_FILES } from "../src/scaffold";

const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : undefined;
const positional = args.filter((a, i) => !a.startsWith("--") && (portAt < 0 || i !== portAt + 1));
const name = positional.length === 1 ? positional[0] : undefined;
if (!name || (port !== undefined && !Number.isInteger(port))) {
  console.error("usage: new-frontend.ts <name> [--port <n>]");
  process.exit(2);
}

const repoRoot = findRepoRoot();
const result = await scaffoldFrontend({ repoRoot, name, port });
const appRel = path.relative(repoRoot, result.appDir);
console.log(`new-frontend: wrote ${appRel} (port ${result.port}):`);
for (const f of result.files) console.log(`  ${appRel}/${f}`);
console.log("new-frontend: added the app's stubs to:");
for (const f of Object.values(SHARED_FILES)) console.log(`  ${f}`);
