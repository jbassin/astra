/**
 * Regenerate the conformance corpus artifacts from the TS reference parser:
 *   fixtures/vellum/<name>.vellum  →  <name>.ast.json (full AST) + <name>.meta.json (parity).
 *
 *   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
 *     libs/ts/vellum-lang/scripts/gen-fixtures.ts
 *
 * The TS test asserts both; the Python test asserts the `.meta.json` (the parity gate).
 * Run this after an intentional grammar/AST change, then review the diff.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalAstJson, canonicalMetaJson, parseDocument } from "../src/index";

function repoRoot(): string {
  let dir = resolve(import.meta.dirname);
  for (;;) {
    if (existsSync(join(dir, "fixtures", "vellum"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("fixtures/vellum not found");
    dir = parent;
  }
}

const dir = join(repoRoot(), "fixtures", "vellum");
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith(".vellum")) continue;
  const base = file.slice(0, -".vellum".length);
  const source = readFileSync(join(dir, file), "utf8");
  writeFileSync(join(dir, `${base}.ast.json`), canonicalAstJson(parseDocument(source)));
  writeFileSync(join(dir, `${base}.meta.json`), canonicalMetaJson(source));
  console.log(`generated ${base}.ast.json + ${base}.meta.json`);
}
