/**
 * Regenerate the conformance corpus artifacts from the TS reference parser:
 *   fixtures/vellum/<name>.vellum  →  <name>.ast.json (full AST) + <name>.meta.json (parity).
 *
 *   node --import tsx \
 *     libs/ts/vellum-lang/scripts/gen-fixtures.ts
 *
 * The TS test asserts both; the Python test asserts the `.meta.json` (the parity gate).
 * Run this after an intentional grammar/AST change, then review the diff.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot } from "@astra/config";

import { canonicalAstJson, canonicalMetaJson, parseDocument } from "../src/index";

const dir = join(findRepoRoot(import.meta.dirname), "fixtures", "vellum");
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith(".vellum")) continue;
  const base = file.slice(0, -".vellum".length);
  const source = readFileSync(join(dir, file), "utf8");
  writeFileSync(join(dir, `${base}.ast.json`), canonicalAstJson(parseDocument(source)));
  writeFileSync(join(dir, `${base}.meta.json`), canonicalMetaJson(source));
  console.log(`generated ${base}.ast.json + ${base}.meta.json`);
}
