import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashDirectory, hashFileEntries, sha256Hex } from "./hash";

let dirs: string[] = [];

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codex-hash-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("hashFileEntries", () => {
  it("is independent of the entry array's order", () => {
    const a = [
      { relPath: "b.json", sha256: sha256Hex("2") },
      { relPath: "a.json", sha256: sha256Hex("1") },
    ];
    const b = [...a].reverse();
    expect(hashFileEntries(a)).toBe(hashFileEntries(b));
  });

  it("changes when a file's content (hash) changes", () => {
    const a = [{ relPath: "a.json", sha256: sha256Hex("1") }];
    const b = [{ relPath: "a.json", sha256: sha256Hex("2") }];
    expect(hashFileEntries(a)).not.toBe(hashFileEntries(b));
  });

  it("changes when a file is renamed even with identical content", () => {
    const a = [{ relPath: "a.json", sha256: sha256Hex("x") }];
    const b = [{ relPath: "b.json", sha256: sha256Hex("x") }];
    expect(hashFileEntries(a)).not.toBe(hashFileEntries(b));
  });
});

describe("hashDirectory", () => {
  it("is stable regardless of filesystem write order", () => {
    const rootA = makeTree({ "x/one.json": '{"a":1}', "y/two.json": '{"b":2}' });
    const hashA = hashDirectory(rootA);

    const rootB = makeTree({ "y/two.json": '{"b":2}', "x/one.json": '{"a":1}' });
    const hashB = hashDirectory(rootB);

    expect(hashA).toBe(hashB);
  });

  it("changes when any file's content changes", () => {
    const rootA = makeTree({ "one.json": '{"a":1}' });
    const rootB = makeTree({ "one.json": '{"a":2}' });
    expect(hashDirectory(rootA)).not.toBe(hashDirectory(rootB));
  });
});
