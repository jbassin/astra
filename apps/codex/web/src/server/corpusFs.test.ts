import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CORPUS_SCHEMA_VERSION } from "@astra/codex-corpus";
import { CorpusNotFoundError, createCorpusReader } from "@astra/codex-corpus/reader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CorpusUnservableError, fixtureCorpusRoot, selectServedCorpus } from "./corpusFs";

// D29-23: `createCorpusReader(rootDir)` is a pure factory, directly unit-testable
// against `fixtures/entities/` — no config/mocking involved. Every traversal-guard
// branch gets its own case here (the guard IS the auth story for the
// HTTP-reachable serverFn endpoints).
describe("createCorpusReader (D29-23)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("categories(): every fixture category, sorted", () => {
    const categories = reader.categories();
    expect(categories.length).toBe(88);
    expect(categories).toEqual([...categories].sort());
    expect(categories).toContain("spell");
    expect(categories).toContain("creature");
  });

  it("categories() is cached (same array identity across calls)", () => {
    expect(reader.categories()).toBe(reader.categories());
  });

  it("categoryCounts(): every fixture category has a count, keys match categories()", () => {
    const counts = reader.categoryCounts();
    expect(Object.keys(counts).sort()).toEqual([...reader.categories()].sort());
    expect(counts.spell).toBeGreaterThan(0);
    expect(counts.creature).toBeGreaterThan(0);
  });

  it("categoryCounts() is cached (same object identity across calls)", () => {
    expect(reader.categoryCounts()).toBe(reader.categoryCounts());
  });

  it("index(): slim IndexRows for a real category", () => {
    const rows = reader.index("creature");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === "creature/adamantine-dragon-adult")).toBe(true);
    // every row is body-less (IndexRowSchema has no `body` field at all)
    for (const row of rows) expect("body" in row).toBe(false);
  });

  it("index() is cached per category (same array identity across calls)", () => {
    expect(reader.index("spell")).toBe(reader.index("spell"));
  });

  it("entity(): a plain remaster entity", () => {
    const entity = reader.entity("spell", "heal");
    expect(entity.id).toBe("spell/heal");
    expect(entity.edition).toBe("remaster");
  });

  it("entity(): the @legacy suffix round-trips through the file slug verbatim", () => {
    const entity = reader.entity("spell", "heal@legacy");
    expect(entity.id).toBe("spell/heal@legacy");
    expect(entity.edition).toBe("legacy");
  });

  it("entity(): a residual -N collision suffix", () => {
    const entity = reader.entity("creature", "grick-2");
    expect(entity.id).toBe("creature/grick-2");
  });

  it("entity(): the D29-21 rescued `index`-slug entities", () => {
    expect(reader.entity("ancestry", "index").id).toBe("ancestry/index");
    expect(reader.entity("archetype", "index").id).toBe("archetype/index");
  });

  it("entity(): a real non-ASCII slug", () => {
    const entity = reader.entity("creature", "ixamè");
    expect(entity.id).toBe("creature/ixamè");
    expect(entity.name).toBe("Ixamè");
  });

  it("entity(): throws CorpusNotFoundError for an unknown category", () => {
    expect(() => reader.entity("not-a-real-category", "heal")).toThrow(CorpusNotFoundError);
  });

  it("entity(): throws for an unknown slug in a real category", () => {
    expect(() => reader.entity("spell", "not-a-real-spell")).toThrow(CorpusNotFoundError);
  });

  it("entity(): throws for a slug containing a forward slash", () => {
    expect(() => reader.entity("spell", "heal/../../etc/passwd")).toThrow(CorpusNotFoundError);
    expect(() => reader.entity("spell", "a/b")).toThrow(CorpusNotFoundError);
  });

  it("entity(): throws for a slug containing a backslash", () => {
    expect(() => reader.entity("spell", "a\\b")).toThrow(CorpusNotFoundError);
  });

  it("entity(): throws for a slug containing `..` (substring ban, spec-literal)", () => {
    expect(() => reader.entity("spell", "..")).toThrow(CorpusNotFoundError);
    expect(() => reader.entity("spell", "a..b")).toThrow(CorpusNotFoundError);
  });

  it("entity(): throws for an empty slug", () => {
    expect(() => reader.entity("spell", "")).toThrow(CorpusNotFoundError);
  });

  it("entity(): throws for a leading-underscore slug (the _index.json reservation)", () => {
    expect(() => reader.entity("spell", "_index")).toThrow(CorpusNotFoundError);
    expect(() => reader.entity("spell", "_anything")).toThrow(CorpusNotFoundError);
  });

  it("index(): throws CorpusNotFoundError for an unknown category", () => {
    expect(() => reader.index("not-a-real-category")).toThrow(CorpusNotFoundError);
  });

  // P4 S2 (D29-40): `rules-tree.json` is a SIBLING of `manifest.json`, not
  // per-category — its own describe block below, mirroring `index()`'s own
  // case shape (cached, real content, unknown-artifact failure mode).
  it("rulesTree(): the fixture artifact, real book content", () => {
    const tree = reader.rulesTree();
    expect(tree.books.length).toBeGreaterThan(0);
    expect(tree.books.some((b) => b.book === "Gamemastery Guide")).toBe(true);
  });

  it("rulesTree() is cached (same object identity across calls)", () => {
    expect(reader.rulesTree()).toBe(reader.rulesTree());
  });

  it("rulesTree(): every book validates against RulesTreeBookSchema shape (edition/license/hiddenWhenLegacyOff present)", () => {
    for (const book of reader.rulesTree().books) {
      expect(["remaster", "legacy"]).toContain(book.edition);
      expect(["ORC", "OGL", "unknown"]).toContain(book.license);
      expect(typeof book.hiddenWhenLegacyOff).toBe("number");
    }
  });
});

describe("createCorpusReader.rulesTree() failure modes (D29-23 idiom)", () => {
  it("throws CorpusNotFoundError when rules-tree.json is missing from the root", () => {
    // A root with a manifest.json but no rules-tree.json (any real corpus
    // category dir works as a stand-in "root" that lacks the artifact —
    // exercises the same `within()`-guarded read path `entity()`'s own
    // failure-mode tests use).
    const reader = createCorpusReader(`${fixtureCorpusRoot()}/spell`);
    expect(() => reader.rulesTree()).toThrow(CorpusNotFoundError);
  });
});

// P4 S4 (D29-43) — `sourcesIndex()` mirrors `rulesTree()`'s own describe
// blocks above exactly (a sibling artifact, same cache/Zod/failure-mode
// posture).
describe("createCorpusReader.sourcesIndex() (D29-43)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("the fixture artifact, real book content", () => {
    const idx = reader.sourcesIndex();
    expect(idx.books.length).toBeGreaterThan(0);
    expect(idx.books.some((b) => b.book === "Player Core")).toBe(true);
  });

  it("is cached (same object identity across calls)", () => {
    expect(reader.sourcesIndex()).toBe(reader.sourcesIndex());
  });

  it("every book validates against SourceIndexEntrySchema shape (categoryCounts present, sums to entityCount)", () => {
    for (const book of reader.sourcesIndex().books) {
      expect(["remaster", "legacy"]).toContain(book.edition);
      expect(["ORC", "OGL", "unknown"]).toContain(book.license);
      const sum = Object.values(book.categoryCounts).reduce((a, b) => a + b, 0);
      expect(sum).toBe(book.entityCount);
    }
  });
});

describe("createCorpusReader.sourcesIndex() failure modes (D29-23 idiom)", () => {
  it("throws CorpusNotFoundError when sources-index.json is missing from the root", () => {
    const reader = createCorpusReader(`${fixtureCorpusRoot()}/spell`);
    expect(() => reader.sourcesIndex()).toThrow(CorpusNotFoundError);
  });
});

// The corpus-root rules: an explicit root is used as given, a built server (dev: false)
// fails closed, and only the dev server falls back to the fixture.
describe("selectServedCorpus", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = mkdtempSync(join(tmpdir(), "codex-corpus-root-"));
  });
  afterEach(() => {
    rmSync(dataPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Writes `<dataPath>/corpus/manifest.json` with a real-corpus header unless overridden. */
  function writeConfigManifest(header: Record<string, unknown> = {}): string {
    const root = join(dataPath, "corpus");
    mkdirSync(root, { recursive: true });
    const manifest = {
      schemaVersion: CORPUS_SCHEMA_VERSION,
      foundry: { tag: "pf2e-8.3.0" },
      totalEntityCount: 44980,
      ...header,
    };
    writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
    return root;
  }

  it("uses an explicit root as given, even the fixture, in either mode", () => {
    for (const dev of [false, true]) {
      const corpus = selectServedCorpus({ explicitRoot: fixtureCorpusRoot(), dataPath, dev });
      expect(corpus).toEqual({
        root: fixtureCorpusRoot(),
        source: "env",
        schemaVersion: CORPUS_SCHEMA_VERSION,
        totalEntityCount: 235,
        fixture: true,
      });
    }
  });

  it("refuses an explicit root with no manifest", () => {
    expect(() =>
      selectServedCorpus({ explicitRoot: join(dataPath, "nope"), dataPath, dev: true }),
    ).toThrow(CorpusUnservableError);
  });

  it("production: serves a real corpus at the config path", () => {
    const root = writeConfigManifest();
    const corpus = selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false });
    expect(corpus).toMatchObject({ root, source: "config", totalEntityCount: 44980 });
    expect(corpus.fixture).toBe(false);
  });

  it("production: refuses a missing corpus instead of falling back to the fixture", () => {
    expect(() => selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false })).toThrow(
      /no corpus at .* never serves the fixture/,
    );
  });

  it("production: refuses the fixture copied to the config path", () => {
    cpSync(
      join(fixtureCorpusRoot(), "manifest.json"),
      join(writeConfigManifest(), "manifest.json"),
    );
    expect(() => selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false })).toThrow(
      /is the fixture corpus/,
    );
  });

  it("refuses a corpus of another schema generation, in either mode", () => {
    writeConfigManifest({ schemaVersion: CORPUS_SCHEMA_VERSION - 1 });
    for (const dev of [false, true]) {
      expect(() => selectServedCorpus({ explicitRoot: undefined, dataPath, dev })).toThrow(
        /schemaVersion/,
      );
    }
    expect(() =>
      selectServedCorpus({ explicitRoot: join(dataPath, "corpus"), dataPath, dev: false }),
    ).toThrow(CorpusUnservableError);
  });

  it("dev: falls back to the fixture, with a warning, when the config corpus is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const corpus = selectServedCorpus({ explicitRoot: undefined, dataPath, dev: true });
    expect(corpus).toMatchObject({
      root: fixtureCorpusRoot(),
      source: "dev-fixture-fallback",
      fixture: true,
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(createCorpusReader(corpus.root).categories()).toContain("spell");
  });

  it("dev: serves the real corpus at the config path when it exists", () => {
    const root = writeConfigManifest();
    expect(selectServedCorpus({ explicitRoot: undefined, dataPath, dev: true })).toMatchObject({
      root,
      source: "config",
    });
  });
});
