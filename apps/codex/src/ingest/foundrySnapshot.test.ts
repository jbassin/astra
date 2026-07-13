import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { copyTree, countFoundryDocs } from "./foundrySnapshot";
import { hashDirectory } from "./hash";

let dirs: string[] = [];

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "codex-foundry-"));
  dirs.push(d);
  return d;
}

describe("countFoundryDocs", () => {
  it("counts json docs and excludes _folders.json at any depth", () => {
    const root = tempDir();
    mkdirSync(join(root, "spells", "rank-1"), { recursive: true });
    writeFileSync(join(root, "_folders.json"), "[]");
    writeFileSync(join(root, "spells", "fireball.json"), "{}");
    writeFileSync(join(root, "spells", "_folders.json"), "[]");
    writeFileSync(join(root, "spells", "rank-1", "magic-missile.json"), "{}");

    expect(countFoundryDocs(root)).toBe(2);
  });
});

describe("copyTree", () => {
  it("preserves relative structure and file content", () => {
    const src = tempDir();
    const dest = tempDir();
    mkdirSync(join(src, "static", "lang"), { recursive: true });
    writeFileSync(join(src, "static", "lang", "re-en.json"), '{"x":1}');

    copyTree(src, dest);

    const copied = join(dest, "static", "lang", "re-en.json");
    expect(existsSync(copied)).toBe(true);
    expect(readFileSync(copied, "utf8")).toBe('{"x":1}');
  });
});

// The exact fixture the spec asks for: a temp-dir tree with a few tiny JSON files plus
// a `_folders.json`, proving the doc count excludes folders AND the aggregate sha256 is
// stable across file-write order — the two properties both fetchers rely on.
describe("count + hash together over a fixture tree", () => {
  it("count excludes _folders.json; hash is stable across write order", () => {
    const rootA = tempDir();
    mkdirSync(join(rootA, "spells"), { recursive: true });
    writeFileSync(join(rootA, "spells", "a.json"), '{"n":1}');
    writeFileSync(join(rootA, "spells", "b.json"), '{"n":2}');
    writeFileSync(join(rootA, "_folders.json"), "[]");

    const rootB = tempDir();
    mkdirSync(join(rootB, "spells"), { recursive: true });
    writeFileSync(join(rootB, "_folders.json"), "[]"); // written first this time
    writeFileSync(join(rootB, "spells", "b.json"), '{"n":2}');
    writeFileSync(join(rootB, "spells", "a.json"), '{"n":1}');

    expect(countFoundryDocs(rootA)).toBe(2);
    expect(countFoundryDocs(rootB)).toBe(2);
    expect(hashDirectory(rootA)).toBe(hashDirectory(rootB));
  });
});
