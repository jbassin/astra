import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { JoinAliasesFile } from "../src/ingest/join";
import { CodexEntitySchema, IndexRowSchema } from "../src/schema/entity";
import type { CorpusManifest } from "../src/schema/manifest";
import { RulesTreeFileSchema } from "../src/schema/rulesTree";
import { SourcesIndexFileSchema } from "../src/schema/sourcesIndex";
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
      if (file === "_index.json") continue; // the D29-21 per-category index, not an entity
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

  it("the D29-11 coverage-matrix canonical entities all still parse through CodexEntitySchema (indexes through IndexRowSchema)", () => {
    const files = collectAllJsonFiles(ENTITIES_DIR);
    expect(files.length).toBeGreaterThan(0);
    let entityCount = 0;
    let indexCount = 0;
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      if (file.endsWith("/_index.json")) {
        // D29-21: the fixture-scoped per-category index — an IndexRow array.
        expect(Array.isArray(raw), file).toBe(true);
        for (const row of raw as unknown[]) {
          expect(() => IndexRowSchema.parse(row), file).not.toThrow();
        }
        indexCount++;
      } else if (file.endsWith("/manifest.json")) {
        // D29-21: the fixture-scoped corpus manifest — categoryCounts present.
        const manifest = raw as { schemaVersion?: number; categoryCounts?: unknown };
        // This is the STATIC committed `fixtures/entities/manifest.json`
        // (extracted once via `extract-fixture.ts`), not regenerated by this
        // test — stays pinned at the schemaVersion active when it was last
        // extracted. P7 S1 (D29-73) deliberately does NOT regen the fixture
        // corpus (spec §3 S1: consolidates in S2), so this stays `2` until
        // S2's fixture regen bumps it to 3 alongside the CORPUS_SCHEMA_VERSION
        // constant (checked live via `runOnce()` below instead).
        expect(manifest.schemaVersion, file).toBe(2);
        expect(typeof manifest.categoryCounts, file).toBe("object");
      } else if (file.endsWith("/rules-tree.json")) {
        // P4 (D29-39/D29-44): the fixture-scoped rules tree — its own schema,
        // not a CodexEntity.
        expect(() => RulesTreeFileSchema.parse(raw), file).not.toThrow();
      } else if (file.endsWith("/sources-index.json")) {
        // P4 (D29-43/D29-44): the fixture-scoped sources index — its own
        // schema, not a CodexEntity.
        expect(() => SourcesIndexFileSchema.parse(raw), file).not.toThrow();
      } else {
        expect(() => CodexEntitySchema.parse(raw), file).not.toThrow();
        entityCount++;
      }
    }
    expect(entityCount).toBeGreaterThan(0);
    expect(indexCount).toBeGreaterThan(0);
  });

  it("D29-21: the fixture corpus carries a manifest whose categoryCounts reconcile exactly against its entity files", () => {
    const manifest = JSON.parse(readFileSync(join(ENTITIES_DIR, "manifest.json"), "utf8")) as {
      categoryCounts: Record<string, number>;
      totalEntityCount: number;
    };
    const perCategory: Record<string, number> = {};
    for (const category of readdirSync(ENTITIES_DIR).sort()) {
      const categoryDir = join(ENTITIES_DIR, category);
      if (!statSync(categoryDir).isDirectory()) continue;
      perCategory[category] = readdirSync(categoryDir).filter(
        (f) => f.endsWith(".json") && f !== "_index.json",
      ).length;
    }
    expect(perCategory).toEqual(manifest.categoryCounts);
    expect(Object.values(perCategory).reduce((a, b) => a + b, 0)).toBe(manifest.totalEntityCount);
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

  it("S6/D29-20: the statblock dragon carries CreatureStats + strike attackBonus/damage + spellcaster dc/tradition end-to-end", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);

    const dragon = JSON.parse(
      readFileSync(join(corpusRoot, "creature", "adamantine-dragon-adult.json"), "utf8"),
    );
    expect(dragon.stats?.kind).toBe("creature");
    expect(dragon.stats?.speeds).toEqual({
      base: 30,
      other: [
        { type: "burrow", value: 40 },
        { type: "fly", value: 150 },
      ],
    });
    const jaws = dragon.embeddedItems?.find(
      (i: { name: string; type: string }) => i.type === "melee" && i.name === "Jaws",
    );
    expect(jaws?.attackBonus).toBe(27);
    expect(jaws?.damage).toEqual(["3d12+14 piercing"]);

    const spellcaster = JSON.parse(
      readFileSync(
        join(corpusRoot, "creature", "adamantine-dragon-adult-spellcaster.json"),
        "utf8",
      ),
    );
    const entry = spellcaster.embeddedItems?.find(
      (i: { type: string }) => i.type === "spellcastingEntry",
    );
    expect(entry?.dc).toBe(34);
    expect(entry?.attack).toBe(27);
    expect(entry?.tradition).toBe("primal");
  });

  it("S6/D29-20: the complex hazard (Gravehall Trap) carries HazardStats with isComplex/disable/routine/stealth end-to-end", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    const trap = JSON.parse(
      readFileSync(join(corpusRoot, "hazard", "gravehall-trap.json"), "utf8"),
    );
    expect(trap.stats?.kind).toBe("hazard");
    expect(trap.stats?.isComplex).toBe(true);
    expect(trap.stats?.hardness).toBe(0);
    expect(trap.stats?.stealth).toEqual({ value: 12 });
    expect(Array.isArray(trap.stats?.disable)).toBe(true);
    expect(trap.stats?.disable.length).toBeGreaterThan(0);
    expect(Array.isArray(trap.stats?.routine)).toBe(true);
    expect(trap.stats?.routine.length).toBeGreaterThan(0);
    expect(trap.stats?.reset).toBeUndefined(); // empty string in source
    // Hazards keep the creature-style named facets (D29-20).
    expect(trap.facets).toMatchObject({ ac: 20, hp: 60, fortitudeSave: 15 });
  });

  it("S6/D29-21: the per-category index is `_index.json` and the rescued `index`-slug entities coexist with it", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);

    // The category index moved to `_index.json` — no plain `index.json` index
    // file survives anywhere as an index (an `index.json` present now is a
    // REAL entity, the exact clobber class D29-21 kills).
    const spellIndex = JSON.parse(readFileSync(join(corpusRoot, "spell", "_index.json"), "utf8"));
    expect(Array.isArray(spellIndex)).toBe(true);
    expect(spellIndex.length).toBeGreaterThan(0);

    const ancestryIndexEntity = JSON.parse(
      readFileSync(join(corpusRoot, "ancestry", "index.json"), "utf8"),
    );
    expect(ancestryIndexEntity.id).toBe("ancestry/index");
    expect(ancestryIndexEntity.proseOnly).toBe(true);
    const archetypeIndexEntity = JSON.parse(
      readFileSync(join(corpusRoot, "archetype", "index.json"), "utf8"),
    );
    expect(archetypeIndexEntity.id).toBe("archetype/index");

    // File-count reconciliation (D29-21's "manifest counts reconcile exactly
    // against find|wc"): entity files == manifest totalEntityCount.
    const manifest = JSON.parse(readFileSync(join(corpusRoot, "manifest.json"), "utf8"));
    expect(collectEntityFiles(corpusRoot)).toHaveLength(manifest.totalEntityCount);
    // P7 S1 (D29-73): CORPUS_SCHEMA_VERSION bumped 2->3.
    expect(manifest.schemaVersion).toBe(3);
  });

  it("S6/D29-19: a character-typed Actor is excluded (excludedActors report class + top-level count)", () => {
    // The fixture raw subset carries no `character` doc (they're all excluded
    // content by design) — so this asserts the ZERO case flows through the
    // report shape correctly; the non-zero case is unit-covered in
    // foundryEntities.test.ts and proven on the real corpus at the S6 gate.
    const result = runOnce(freshCorpusDir());
    expect(result.hardFailures).toEqual([]);
    expect(result.reportJson?.excludedActorsCount).toBe(0);
    expect(result.reportJson?.reportCounts.excludedActors).toBeUndefined();
    // Coverage tables exist and are well-formed.
    expect(result.reportJson?.statsCoverage.creature.length).toBeGreaterThan(0);
    expect(result.reportJson?.statsCoverage.hazard.length).toBeGreaterThan(0);
  });
});
