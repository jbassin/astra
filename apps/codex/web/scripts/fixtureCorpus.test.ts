import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildFixtureCorpus, FIXTURE_CORPUS_DIR } from "./fixtureCorpus";

/** Every regular file under `root`, keyed by its path relative to `root`. */
function readTree(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  function walk(dir: string, prefix: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(abs).isDirectory()) walk(abs, rel);
      else out.set(rel, readFileSync(abs));
    }
  }
  walk(root, "");
  return out;
}

function expectSameTree(a: Map<string, Buffer>, b: Map<string, Buffer>): void {
  expect([...a.keys()]).toEqual([...b.keys()]);
  for (const [rel, content] of a) {
    expect(content.equals(b.get(rel) ?? Buffer.alloc(0)), `content differs: ${rel}`).toBe(true);
  }
}

const tempDirs: string[] = [];
function freshOutDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-fixture-build-"));
  tempDirs.push(dir);
  return join(dir, "entities");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the fixture corpus generator", () => {
  it("is byte-deterministic across two independent builds", () => {
    const a = freshOutDir();
    const b = freshOutDir();
    buildFixtureCorpus(a);
    buildFixtureCorpus(b);
    expectSameTree(readTree(a), readTree(b));
  });

  it("reproduces the committed fixtures/entities/ byte for byte (run `pnpm --filter @astra/codex fixture` after changing an input)", () => {
    const out = freshOutDir();
    const { entityCount } = buildFixtureCorpus(out);
    expect(entityCount).toBe(235);
    expectSameTree(readTree(out), readTree(FIXTURE_CORPUS_DIR));
  });
});
