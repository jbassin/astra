// The design-token generator (`just tokens-gen`).
//
//   node --import tsx libs/ts/gothic/scripts/tokens-gen.ts [--check]
//
// Writes every file `generateTokenFiles` renders from src/tokens/tokens.ts into
// libs/ts/gothic/src/generated/. `--check` writes nothing and exits 1 naming each committed file
// that differs from a fresh generation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { generateTokenFiles } from "../src/tokens/generate";

const PKG = path.resolve(import.meta.dirname, "..");
const check = process.argv.slice(2).includes("--check");

let stale = 0;
const files = generateTokenFiles();
for (const file of files) {
  const target = path.join(PKG, file.path);
  if (check) {
    const committed = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (committed !== file.contents) {
      console.error(`tokens-check: libs/ts/gothic/${file.path} is stale`);
      stale += 1;
    }
    continue;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, file.contents);
  console.log(`tokens-gen: wrote libs/ts/gothic/${file.path}`);
}
if (stale > 0) {
  console.error("tokens-check: run `just tokens-gen` and commit the result");
  process.exit(1);
}
if (check) console.log(`tokens-check: ${files.length} generated token files are fresh`);
