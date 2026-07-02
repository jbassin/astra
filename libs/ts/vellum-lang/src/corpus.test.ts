import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { canonicalAstJson, canonicalMetaJson, parseDocument } from "./index";

function repoRoot(): string {
  let dir = resolve(import.meta.dirname);
  for (;;) {
    if (existsSync(join(dir, "fixtures", "vellum"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("fixtures/vellum not found");
    dir = parent;
  }
}

const DIR = join(repoRoot(), "fixtures", "vellum");
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith(".vellum"))
  .sort();

// The TS reference asserts the full AST + the metadata subset. The Python test asserts
// the same `.meta.json` (the cross-language parity gate); agreeing with the shared
// fixture ⇒ agreeing with each other.
describe("conformance corpus (TS reference)", () => {
  test("the corpus is non-empty", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    const base = file.slice(0, -".vellum".length);
    test(`${base}: AST + metadata match the committed fixtures`, () => {
      const source = readFileSync(join(DIR, file), "utf8");
      expect(canonicalAstJson(parseDocument(source))).toBe(
        readFileSync(join(DIR, `${base}.ast.json`), "utf8"),
      );
      expect(canonicalMetaJson(source)).toBe(readFileSync(join(DIR, `${base}.meta.json`), "utf8"));
    });
  }
});
