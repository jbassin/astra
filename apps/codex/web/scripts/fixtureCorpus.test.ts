import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildFixtureCorpus, FIXTURE_CORPUS_DIR, readTree } from "./fixtureCorpus";

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
    expect(buildFixtureCorpus(a).entityCount).toBe(235);
    buildFixtureCorpus(b);
    expectSameTree(readTree(a), readTree(b));
  });

  it("the fixtures/entities/ the tests read (vitest.globalSetup.ts) is a fresh build", () => {
    const out = freshOutDir();
    buildFixtureCorpus(out);
    expectSameTree(readTree(out), readTree(FIXTURE_CORPUS_DIR));
  });
});
