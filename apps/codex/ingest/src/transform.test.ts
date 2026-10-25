import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CodexEntitySchema,
  IndexRowSchema,
  type CorpusManifest,
  RulesTreeFileSchema,
  SourcesIndexFileSchema,
} from "@astra/codex-corpus";
import { afterEach, describe, expect, it } from "vitest";

import { loadHomebrewSide, loadHomebrewTraits } from "./homebrew";
import type { JoinAliasesFile } from "./join";
import {
  defaultHomebrewDirs,
  runTransform,
  TRANSFORM_PASSES,
  type TransformResult,
} from "./transform";
import { UuidIndex } from "./uuidResolve";

/**
 * The CI-hermetic pipeline test: runs the REAL `runTransform` — the exact code path the host CLI and `just
 * codex-refresh` use — over the committed fixture's raw-doc subset
 * (`apps/codex/ingest/fixtures/raw/`), zero network, zero `codex.data-path` reads.
 * Asserts: zero hard failures, byte-determinism across two independent runs,
 * every emitted entity Zod-valid, the coverage-matrix canonical entities
 * (`apps/codex/ingest/fixtures/entities/`) all still parse through
 * `CodexEntitySchema`, and the named content spot-checks (heal pair ids,
 * magic-missile license/pairing).
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const RAW_FOUNDRY = join(FIXTURES, "raw", "foundry");
const RAW_AON = join(FIXTURES, "raw", "aon");
const RAW_HOMEBREW = join(FIXTURES, "raw", "homebrew");
/** The school-trait sibling of `RAW_HOMEBREW`. */
const RAW_HOMEBREW_TRAITS = join(FIXTURES, "raw", "homebrew-traits");
/** Lives OUTSIDE `RAW_HOMEBREW` — the negative-path collision
 * fixture (basename "fireball", colliding with the real official
 * `spell/fireball` fixture pick), read only by the dedicated collision-guard
 * test below. */
const RAW_HOMEBREW_COLLISION = join(FIXTURES, "raw", "homebrew-collision");
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
    homebrewDir: RAW_HOMEBREW,
    homebrewTraitsDir: RAW_HOMEBREW_TRAITS,
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
      if (file === "_index.json") continue; // the per-category index, not an entity
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

  it("the coverage-matrix canonical entities all still parse through CodexEntitySchema (indexes through IndexRowSchema)", () => {
    const files = collectAllJsonFiles(ENTITIES_DIR);
    expect(files.length).toBeGreaterThan(0);
    let entityCount = 0;
    let indexCount = 0;
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      if (file.endsWith("/_index.json")) {
        // The fixture-scoped per-category index — an IndexRow array.
        expect(Array.isArray(raw), file).toBe(true);
        for (const row of raw as unknown[]) {
          expect(() => IndexRowSchema.parse(row), file).not.toThrow();
        }
        indexCount++;
      } else if (file.endsWith("/manifest.json")) {
        // The fixture-scoped corpus manifest — categoryCounts present.
        const manifest = raw as { schemaVersion?: number; categoryCounts?: unknown };
        // The generated `fixtures/entities/manifest.json` (`fixtureCorpus.ts`
        // writes `CORPUS_SCHEMA_VERSION`, 5 since ClassStats); the
        // transform's own manifest is separately checked via `runOnce()` below.
        expect(manifest.schemaVersion, file).toBe(5);
        expect(typeof manifest.categoryCounts, file).toBe("object");
      } else if (file.endsWith("/rules-tree.json")) {
        // The fixture-scoped rules tree — its own schema,
        // not a CodexEntity.
        expect(() => RulesTreeFileSchema.parse(raw), file).not.toThrow();
      } else if (file.endsWith("/sources-index.json")) {
        // The fixture-scoped sources index — its own schema, not a CodexEntity.
        expect(() => SourcesIndexFileSchema.parse(raw), file).not.toThrow();
      } else {
        expect(() => CodexEntitySchema.parse(raw), file).not.toThrow();
        entityCount++;
      }
    }
    expect(entityCount).toBeGreaterThan(0);
    expect(indexCount).toBeGreaterThan(0);
  });

  it("the fixture corpus carries a manifest whose categoryCounts reconcile exactly against its entity files", () => {
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

  it("the Foundry-only 'boon' category is dropped end-to-end (present in the report's drop-accounting, absent from the emitted corpus)", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);
    expect(() => readFileSync(join(corpusRoot, "boon", "desna-major-boon.json"), "utf8")).toThrow();
    const boonDrop = result.reportJson?.dropAccounting.byCategory.find(
      (c) => c.category === "boon",
    );
    expect(boonDrop?.dropped).toBeGreaterThanOrEqual(1);
  });

  it("a genuine Foundry-only creature (Dune Candle) SURVIVES the drop pass via the creature carve-out", () => {
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

  it("the statblock dragon carries CreatureStats + strike attackBonus/damage + spellcaster dc/tradition end-to-end", () => {
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

  it("the complex hazard (Gravehall Trap) carries HazardStats with isComplex/disable/routine/stealth end-to-end", () => {
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
    // Hazards keep the creature-style named facets.
    expect(trap.facets).toMatchObject({ ac: 20, hp: 60, fortitudeSave: 15 });
  });

  it("the per-category index is `_index.json` and the rescued `index`-slug entities coexist with it", () => {
    const corpusRoot = freshCorpusDir();
    const result = runOnce(corpusRoot);
    expect(result.hardFailures).toEqual([]);

    // The category index moved to `_index.json` — no plain `index.json` index
    // file survives anywhere as an index (an `index.json` present now is a
    // REAL entity, the exact clobber class the `_index.json` name prevents).
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

    // File-count reconciliation (manifest counts reconcile exactly against
    // find|wc): entity files == manifest totalEntityCount.
    const manifest = JSON.parse(readFileSync(join(corpusRoot, "manifest.json"), "utf8"));
    expect(collectEntityFiles(corpusRoot)).toHaveLength(manifest.totalEntityCount);
    // CORPUS_SCHEMA_VERSION is 5 (ClassStats).
    expect(manifest.schemaVersion).toBe(5);
  });

  it("a character-typed Actor is excluded (excludedActors report class + top-level count)", () => {
    // The fixture raw subset carries no `character` doc (they're all excluded
    // content by design) — so this asserts the ZERO case flows through the
    // report shape correctly; the non-zero case is unit-covered in
    // foundryEntities.test.ts and proven on the real corpus.
    const result = runOnce(freshCorpusDir());
    expect(result.hardFailures).toEqual([]);
    expect(result.reportJson?.excludedActorsCount).toBe(0);
    expect(result.reportJson?.reportCounts.excludedActors).toBeUndefined();
    // Coverage tables exist and are well-formed.
    expect(result.reportJson?.statsCoverage.creature.length).toBeGreaterThan(0);
    expect(result.reportJson?.statsCoverage.hazard.length).toBeGreaterThan(0);
  });

  describe("activation-debris drop, name templates and crossref dedupe — end-to-end fixture regression coverage", () => {
    it("drop family (i): a paren-leading AoN-only action ('(arcane)') is dropped end-to-end", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const actionFiles = readdirSync(join(corpusRoot, "action")).filter(
        (f) => f !== "_index.json",
      );
      expect(actionFiles.some((f) => f.includes("arcane"))).toBe(false);
      expect(result.reportJson?.dropAccounting.activationDrop.parenFamily).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("name-template/drop overlap: a TRAITS-glyph-templated name resolves to '10 minutes (concentrate, manipulate)' and is THEN dropped as digit family (ii)", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      expect(
        result.reportJson?.dropAccounting.activationDrop.digitFamilyNames.some((n) =>
          n.includes("10 minutes (concentrate, manipulate)"),
        ),
      ).toBe(true);
      // nameTemplateResolved fires at extract time even though the entity is
      // dropped downstream — the extract -> join -> drop order.
      expect(result.reportJson?.reportCounts.nameTemplateResolved).toBeGreaterThanOrEqual(1);
    });

    it("an ACTION.TYPES-glyph-templated name resolves via the PINNED table (not the naive off-by-one) and survives (neither drop family)", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const entity = JSON.parse(
        readFileSync(
          join(
            corpusRoot,
            "action",
            "single-action-envision-or-two-actions-command-envision-teleportation.json",
          ),
          "utf8",
        ),
      );
      expect(entity.name).toBe(
        "Single Action envision; or Two Actions command, envision (teleportation)",
      );
    });

    it("the naga domain page's duplicate Ravithra masthead crossref (legacy+remaster repoint) collapses to one", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const naga = JSON.parse(readFileSync(join(corpusRoot, "domain", "naga.json"), "utf8"));
      const deities = naga.mastheadExtra?.find((m: { label: string }) => m.label === "Deities");
      const ravithraCrossrefs = deities.value.filter(
        (n: { kind: string; targetId?: string }) =>
          n.kind === "crossref" && n.targetId === "deity/ravithra",
      );
      expect(ravithraCrossrefs).toHaveLength(1);
      expect(result.reportJson?.adjacentCrossrefDedupe.totalOccurrences).toBeGreaterThanOrEqual(1);
      expect(result.reportJson?.adjacentCrossrefDedupe.entitiesTouched).toBeGreaterThanOrEqual(1);
    });

    it("search-exclusion prerequisite: the fixture carries a real 'leads to...' heading + crossref paragraph (feat/fledgling-flight), for build-search.test.ts's own exclusion proof", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const feat = JSON.parse(
        readFileSync(join(corpusRoot, "feat", "fledgling-flight.json"), "utf8"),
      );
      const headingIdx = feat.body.findIndex(
        (n: { kind: string; children?: Array<{ content?: string }> }) =>
          n.kind === "heading" && n.children?.[0]?.content === "Fledgling Flight leads to...",
      );
      expect(headingIdx).toBeGreaterThanOrEqual(0);
      const next = feat.body[headingIdx + 1];
      expect(next.kind).toBe("paragraph");
      expect(next.children.some((c: { kind: string }) => c.kind === "crossref")).toBe(true);
    });
  });

  describe("grants same-slug collision-family disambiguation, end to end", () => {
    // The fixture's fighter (real) + witch (real) class Items both grant the
    // SHARED Foundry item `Compendium.pf2e.classfeatures.Item.Weapon
    // Specialization` (verified against the real `pf2e-8.3.0` snapshot — witch
    // genuinely grants Weapon Specialization at level 13, no fixture
    // fabrication needed there). `fixtures/raw/aon/class-feature.json` adds ONE
    // new AoN doc (`class-feature-9001`, "Weapon Specialization"/Witch) beside
    // the pre-existing Fighter one (`class-feature-701`) — two AoN docs, same
    // slug, exactly the real-corpus "~47 separate 'Weapon Specialization'
    // pages" collision shape in miniature. The single shared Foundry item joins
    // with Fighter's AoN doc (lower aonId wins `aonSlugIndex`'s first-in
    // tie-break) as `class-feature/weapon-specialization`; Witch's AoN doc
    // stays unjoined and gets the residual `-2` suffix. A raw grant uuid
    // resolves to the UNSUFFIXED shared preId regardless of which class
    // grants it — `keptIds.has(preId)` alone would resolve BOTH fighter's AND
    // witch's grant to fighter's doc (the bug the assertions below guard
    // against); the masthead "Class" disambiguation (rule 1) resolves each to
    // its OWN doc.
    it("fighter's Weapon Specialization grant resolves to the Fighter-mastheaded doc (the collision winner)", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const fighter = JSON.parse(readFileSync(join(corpusRoot, "class", "fighter.json"), "utf8"));
      const grant = fighter.stats.grantedFeatures.find(
        (g: { name: string }) => g.name === "Weapon Specialization",
      );
      expect(grant?.targetId).toBe("class-feature/weapon-specialization");
    });

    it("witch's Weapon Specialization grant resolves to the Witch-mastheaded doc, NOT fighter's (a bare kept-id check would wrongly resolve to fighter's)", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);

      const witch = JSON.parse(readFileSync(join(corpusRoot, "class", "witch.json"), "utf8"));
      const grant = witch.stats.grantedFeatures.find(
        (g: { name: string }) => g.name === "Weapon Specialization",
      );
      // The bug this guards: `keptIds.has("class-feature/weapon-specialization")`
      // is true (it's fighter's doc) regardless of which class is asking, so a
      // bare kept-id check would wrongly yield "class-feature/weapon-specialization" too.
      expect(grant?.targetId).toBe("class-feature/weapon-specialization-2");
      expect(grant?.targetId).not.toBe("class-feature/weapon-specialization");

      const witchDoc = JSON.parse(
        readFileSync(join(corpusRoot, "class-feature", "weapon-specialization-2.json"), "utf8"),
      );
      const classLabel = witchDoc.mastheadExtra?.find(
        (m: { label: string }) => m.label === "Class",
      );
      expect(classLabel?.value?.[0]?.content?.trim()).toBe("Witch");

      const fighterDoc = JSON.parse(
        readFileSync(join(corpusRoot, "class-feature", "weapon-specialization.json"), "utf8"),
      );
      const fighterLabel = fighterDoc.mastheadExtra?.find(
        (m: { label: string }) => m.label === "Class",
      );
      expect(fighterLabel?.value?.[0]?.content?.trim()).toBe("Fighter");
    });
  });

  describe("homebrew ingest, end to end", () => {
    it("the plain homebrew spell assembles with the store basename as its id/slug", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const spell = JSON.parse(
        readFileSync(join(corpusRoot, "spell", "fixture-cinder-bolt.json"), "utf8"),
      );
      expect(spell.id).toBe("spell/fixture-cinder-bolt");
      expect(spell.slug).toBe("fixture-cinder-bolt");
      expect(spell.edition).toBe("remaster");
      expect(spell.source).toEqual({ license: "OGL", book: "Liturgy of the Iridite Vol.2" });
      // Homebrew never enters the AoN join — no aonUrl, superseded
      // false by construction.
      expect(spell.aonUrl).toBeUndefined();
    });

    it("the system.ritual-bearing doc reroutes to ritual/* (both category AND id)", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      // Never emitted under spell/ — the reroute rewrites BOTH fields.
      expect(() =>
        readFileSync(join(corpusRoot, "spell", "fixture-abyssal-forging.json"), "utf8"),
      ).toThrow();
      const ritual = JSON.parse(
        readFileSync(join(corpusRoot, "ritual", "fixture-abyssal-forging.json"), "utf8"),
      );
      expect(ritual.id).toBe("ritual/fixture-abyssal-forging");
      expect(ritual.category).toBe("ritual");
    });

    it("the @UUID[...conditionitems...] ref resolves as a real crossref against the official UuidIndex (not brokenRef)", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const spell = JSON.parse(
        readFileSync(join(corpusRoot, "spell", "fixture-warding-glyph.json"), "utf8"),
      );
      const paragraph = spell.body[0] as { children: Array<{ kind: string; targetId?: string }> };
      const ref = paragraph.children.find((c) => c.kind === "crossref" || c.kind === "brokenRef");
      expect(ref?.kind).toBe("crossref");
      expect(ref?.targetId).toBe("condition/slowed");
    });

    it("the report carries a homebrew section reconciling the 3 spell-store fixture docs (2 spell / 1 ritual, 1 resolved ref, 0 broken) plus the 1 trait-store fixture doc", () => {
      const result = runOnce(freshCorpusDir());
      expect(result.hardFailures).toEqual([]);
      expect(result.reportJson?.homebrew).toMatchObject({
        dir: RAW_HOMEBREW,
        docsIn: 3,
        emittedByCategory: { ritual: 1, spell: 2, trait: 1 },
        uuidRefsResolved: 1,
        uuidRefsBroken: 0,
        collisionGuardOk: true,
        traitsDir: RAW_HOMEBREW_TRAITS,
        traitsDocsIn: 1,
      });
      expect(result.reportJson?.homebrew.sha256).toEqual(expect.any(String));
      expect(result.reportJson?.homebrew.sha256.length).toBeGreaterThan(0);
      expect(result.reportJson?.homebrew.traitsSha256).toEqual(expect.any(String));
      expect(result.reportJson?.homebrew.traitsSha256.length).toBeGreaterThan(0);
      expect(result.reportMarkdown).toContain("Homebrew ingest");
    });

    it("the fixture school-trait doc assembles with the exact field set — no level, no proseOnly", () => {
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      const raw = JSON.parse(
        readFileSync(join(corpusRoot, "trait", "fixture-school-trait.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(CodexEntitySchema.parse(raw)).toMatchObject({
        id: "trait/fixture-school-trait",
        slug: "fixture-school-trait",
        category: "trait",
        name: "Fixture School Trait",
        edition: "remaster",
        source: { book: "Liturgy of the Iridite Vol.2", license: "OGL" },
        rarity: "common",
        traits: [],
        facets: {},
      });
      expect(raw.level).toBeUndefined();
      expect(raw.proseOnly).toBeUndefined();
      expect(raw.aonUrl).toBeUndefined();

      const traitIndex = JSON.parse(
        readFileSync(join(corpusRoot, "trait", "_index.json"), "utf8"),
      ) as Array<{ id: string }>;
      expect(traitIndex.map((r) => r.id)).toContain("trait/fixture-school-trait");
    });

    it("keep-arm regression: the pre-existing 'boon dropped' + 'Dune Candle carve-out survives' behavior is untouched by threading homebrewIds through", () => {
      // Both already asserted above (the boon drop, the Dune Candle carve-out) — re-running
      // `runOnce` here (which now always merges the 3 homebrew fixture docs
      // in) re-proves those SAME official-content outcomes still hold, i.e.
      // the homebrew keep-arm doesn't leak into official drop decisions.
      const corpusRoot = freshCorpusDir();
      const result = runOnce(corpusRoot);
      expect(result.hardFailures).toEqual([]);
      expect(() =>
        readFileSync(join(corpusRoot, "boon", "desna-major-boon.json"), "utf8"),
      ).toThrow();
      const duneCandle = JSON.parse(
        readFileSync(join(corpusRoot, "creature", "dune-candle.json"), "utf8"),
      );
      expect(duneCandle.id).toBe("creature/dune-candle");
    });

    it("a homebrew id colliding with any official corpus id throws, naming the id", () => {
      expect(() =>
        runTransform({
          foundrySnapshotDir: RAW_FOUNDRY,
          aonSnapshotDir: RAW_AON,
          homebrewDir: RAW_HOMEBREW_COLLISION,
          homebrewTraitsDir: RAW_HOMEBREW_TRAITS,
          corpusRoot: freshCorpusDir(),
          aliasesFile: readAliasesFile(),
          pins: FIXTURE_PINS,
        }),
      ).toThrow(/homebrew id "spell\/fireball" collides with/);
    });
  });
});

describe("runTransform's pass registry over the fixture", () => {
  it("records every pass once, in registry order", () => {
    const result = runOnce(freshCorpusDir());
    expect(result.passes.map((p) => p.name)).toEqual(TRANSFORM_PASSES.map((p) => p.name));
    expect(result.passes.find((p) => p.name === "emit-corpus")?.counts["entityFiles"]).toBe(
      result.emit?.entityFileCount,
    );
  });

  it("runs one pass alone with only the passes it reads from", () => {
    const result = runTransform(
      {
        foundrySnapshotDir: RAW_FOUNDRY,
        aonSnapshotDir: RAW_AON,
        homebrewDir: RAW_HOMEBREW,
        homebrewTraitsDir: RAW_HOMEBREW_TRAITS,
        corpusRoot: freshCorpusDir(),
        aliasesFile: readAliasesFile(),
        pins: FIXTURE_PINS,
      },
      { only: "aon-link-table" },
    );
    expect(result.passes.map((p) => p.name)).toEqual(["load-aon", "dedupe-aon", "aon-link-table"]);
    expect(result.slots.linkTable?.byUrl.size).toBeGreaterThan(0);
    expect(result.reportJson).toBeUndefined();
  });
});

describe("defaultHomebrewDirs (the real host run's homebrew stores)", () => {
  it("resolves from the repo root to the checked-in stores, which load non-empty", () => {
    const { homebrewDir, homebrewTraitsDir } = defaultHomebrewDirs();
    const hardFailures: { path: string; message: string }[] = [];
    const spells = loadHomebrewSide(homebrewDir, new UuidIndex(), () => {}, hardFailures);
    const traits = loadHomebrewTraits(homebrewTraitsDir, new UuidIndex(), () => {}, hardFailures);
    expect(hardFailures).toEqual([]);
    expect(spells.entities.length).toBeGreaterThan(0);
    expect(traits.entities.length).toBeGreaterThan(0);
  });

  it("throws on a missing store rather than yielding zero spells", () => {
    const missing = join(tmpdir(), "codex-no-such-homebrew-store");
    expect(() => loadHomebrewSide(missing, new UuidIndex(), () => {}, [])).toThrow(/ENOENT/);
  });
});
