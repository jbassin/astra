import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { JoinAliasesFile } from "../src/ingest/join";
import { CodexEntitySchema } from "../src/schema/entity";
import type { CorpusManifest } from "../src/schema/manifest";
import { runTransform, type TransformResult } from "./transform";

/**
 * D29-11's CI-hermetic pipeline test (spec §3/§4 S4, deliverable 4): runs the
 * REAL `runTransform` — the exact code path the host CLI and `just
 * codex-refresh` use — over the committed fixture's raw-doc subset
 * (`apps/codex/fixtures/raw/`), zero network, zero `apps/codex/data/` reads.
 * Asserts: zero hard failures, byte-determinism across two independent runs,
 * every emitted entity Zod-valid, the coverage-matrix canonical entities
 * (`apps/codex/fixtures/entities/`) all still parse through
 * `CodexEntitySchema`, and the named content spot-checks (heal pair ids,
 * magic-missile license/pairing).
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const RAW_FOUNDRY = join(FIXTURES, "raw", "foundry");
const RAW_AON = join(FIXTURES, "raw", "aon");
const ENTITIES_DIR = join(FIXTURES, "entities");

/** A structurally-valid stand-in pin object — `emit.ts` only ever copies
 * these verbatim into `corpus/manifest.json`, never validates them against a
 * real fetch, so the fixture doesn't need real hashes/counts. */
const FIXTURE_PINS: { foundry: CorpusManifest["foundry"]; aon: CorpusManifest["aon"] } = {
  foundry: { tag: "fixture", docCount: 0, sha256: null, fetchedAt: null },
  aon: { snapshotDate: "fixture", docCount: 0, categoryCounts: {}, sha256: null, fetchedAt: null },
};

function readAliasesFile(): JoinAliasesFile {
  return JSON.parse(readFileSync(join(FIXTURES, "join-aliases.json"), "utf8")) as JoinAliasesFile;
}

function runOnce(corpusRoot: string): TransformResult {
  return runTransform({
    foundrySnapshotDir: RAW_FOUNDRY,
    aonSnapshotDir: RAW_AON,
    corpusRoot,
    aliasesFile: readAliasesFile(),
    pins: FIXTURE_PINS,
  });
}

/** Every regular file under `root`, as `{relPath, content}` — a pure-JS
 * recursive tree walk (no shelling out to `diff`), so the determinism check
 * has no environment dependency beyond Node's own `fs`. */
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

function collectEntityFiles(corpusRoot: string): string[] {
  const files: string[] = [];
  for (const category of readdirSync(corpusRoot).sort()) {
    const categoryDir = join(corpusRoot, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir).sort()) {
      if (file === "index.json") continue;
      files.push(join(categoryDir, file));
    }
  }
  return files;
}

function collectAllJsonFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const abs = join(root, name);
    if (statSync(abs).isDirectory()) out.push(...collectAllJsonFiles(abs));
    else if (name.endsWith(".json")) out.push(abs);
  }
  return out;
}

const tempDirs: string[] = [];
function freshCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-fixture-corpus-"));
  tempDirs.push(dir);
  return join(dir, "corpus");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("runTransform over the committed fixture (CI-hermetic, zero network/data reads)", () => {
  it("completes with zero hard failures", () => {
    const result = runOnce(freshCorpusDir());
    expect(result.hardFailures).toEqual([]);
    expect(result.emit).toBeDefined();
    expect(result.reportJson).toBeDefined();
  });

  it("is byte-deterministic across two independent runs", () => {
    const corpusA = freshCorpusDir();
    const corpusB = freshCorpusDir();
    const resultA = runOnce(corpusA);
    const resultB = runOnce(corpusB);
    expect(resultA.hardFailures).toEqual([]);
    expect(resultB.hardFailures).toEqual([]);

    const treeA = readTree(corpusA);
    const treeB = readTree(corpusB);
    expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
    for (const [relPath, contentA] of treeA) {
      const contentB = treeB.get(relPath);
      expect(contentB, `missing in run B: ${relPath}`).toBeDefined();
      expect(contentA.equals(contentB ?? Buffer.alloc(0)), `content differs: ${relPath}`).toBe(
        true,
      );
    }
  });

  it("emits 100% Zod-valid entities", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    const files = collectEntityFiles(corpusRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      expect(() => CodexEntitySchema.parse(raw), file).not.toThrow();
    }
  });

  it("the D29-11 coverage-matrix canonical entities all still parse through CodexEntitySchema", () => {
    const files = collectAllJsonFiles(ENTITIES_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      expect(() => CodexEntitySchema.parse(raw), file).not.toThrow();
    }
  });

  it("spot-check: the Heal legacy/remaster shared-slug pair", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    const heal = JSON.parse(readFileSync(join(corpusRoot, "spell", "heal.json"), "utf8"));
    const legacy = JSON.parse(readFileSync(join(corpusRoot, "spell", "heal@legacy.json"), "utf8"));
    expect(heal.id).toBe("spell/heal");
    expect(heal.edition).toBe("remaster");
    expect(heal.legacyOf).toEqual(["spell/heal@legacy"]);
    expect(legacy.id).toBe("spell/heal@legacy");
    expect(legacy.edition).toBe("legacy");
    expect(legacy.remasteredAs).toEqual(["spell/heal"]);
    expect(legacy.proseOnly).toBe(true);
  });

  it("spot-check: Magic Missile (AoN-only legacy) license + pairing to Force Barrage", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    const missile = JSON.parse(
      readFileSync(join(corpusRoot, "spell", "magic-missile.json"), "utf8"),
    );
    expect(missile.proseOnly).toBe(true);
    expect(missile.edition).toBe("legacy");
    expect(missile.source.license).toBe("OGL");
    expect(missile.remasteredAs).toEqual(["spell/force-barrage"]);
    const barrage = JSON.parse(
      readFileSync(join(corpusRoot, "spell", "force-barrage.json"), "utf8"),
    );
    expect(barrage.id).toBe("spell/force-barrage");
  });

  it("S5c/D29-14: the Foundry-only 'boon' category is dropped end-to-end (present in the report's drop-accounting, absent from the emitted corpus)", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    expect(() => readFileSync(join(corpusRoot, "boon", "desna-major-boon.json"), "utf8")).toThrow();
    const boonDrop = result.reportJson?.dropAccounting.byCategory.find(
      (c) => c.category === "boon",
    );
    expect(boonDrop?.dropped).toBeGreaterThanOrEqual(1);
  });

  it("S5c/D29-17: a genuine Foundry-only creature (Dune Candle) SURVIVES the drop pass via the creature carve-out", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    const duneCandle = JSON.parse(
      readFileSync(join(corpusRoot, "creature", "dune-candle.json"), "utf8"),
    );
    expect(duneCandle.id).toBe("creature/dune-candle");
    expect(duneCandle.aonUrl).toBeUndefined();
    expect(duneCandle.proseOnly).toBeUndefined();
    const carveOut = result.reportJson?.dropAccounting.carveOut.find(
      (c) => c.category === "creature",
    );
    expect(carveOut?.kept).toBeGreaterThanOrEqual(1);
  });
});
