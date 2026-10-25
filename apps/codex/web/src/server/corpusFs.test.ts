import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CORPUS_SCHEMA_VERSION } from "@astra/codex-corpus";
import { CorpusNotFoundError, createCorpusReader } from "@astra/codex-corpus/reader";
import { FIXTURE_CORPUS_DIR } from "@astra/codex-ingest/fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CorpusUnservableError,
  createCorpusSource,
  fixtureCorpusRoot,
  selectServedCorpus,
} from "./corpusFs";

// A read of `fsFault.path` throws an errno error with `fsFault.code` (a transient EMFILE in
// the retry test); every other read is the real one.
const fsFault = vi.hoisted(() => ({ path: "", code: "" }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) => {
    if (fsFault.path !== "" && String(path) === fsFault.path) {
      throw Object.assign(new Error(`${fsFault.code}: simulated`), { code: fsFault.code });
    }
    return (real.readFileSync as (...a: unknown[]) => unknown)(path, ...rest);
  }) as typeof real.readFileSync;
  return { ...real, default: { ...real, readFileSync }, readFileSync };
});

const RELEASE_A = "aaaaaaaaaaaaaaaa";
const RELEASE_B = "bbbbbbbbbbbbbbbb";

/** Writes `<dataPath>/releases/<id>/corpus/manifest.json` (a real-corpus header unless
 * overridden) and points `current` at it; returns the corpus root. */
function writeRelease(dataPath: string, id: string, header: Record<string, unknown> = {}): string {
  const releases = join(dataPath, "releases");
  const root = join(releases, id, "corpus");
  mkdirSync(root, { recursive: true });
  const manifest = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    foundry: { tag: "pf2e-8.3.0" },
    totalEntityCount: 44980,
    categoryCounts: {},
    ...header,
  };
  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
  symlinkSync(id, join(releases, ".current-tmp"));
  renameSync(join(releases, ".current-tmp"), join(releases, "current"));
  return root;
}

// `createCorpusReader(rootDir)` is a pure factory, directly unit-testable
// against `fixtures/entities/` — no config/mocking involved. Every traversal-guard
// branch gets its own case here (the guard IS the auth story for the
// HTTP-reachable serverFn endpoints).
describe("fixtureCorpusRoot", () => {
  it("is the directory the ingest package generates the fixture into", () => {
    expect(fixtureCorpusRoot()).toBe(FIXTURE_CORPUS_DIR);
  });
});

describe("createCorpusReader", () => {
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

  it("entity(): entities whose slug is literally `index`", () => {
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

  // `rules-tree.json` is a SIBLING of `manifest.json`, not
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

describe("createCorpusReader.rulesTree() failure modes", () => {
  it("throws CorpusNotFoundError when rules-tree.json is missing from the root", () => {
    // A root with a manifest.json but no rules-tree.json (any real corpus
    // category dir works as a stand-in "root" that lacks the artifact —
    // exercises the same `within()`-guarded read path `entity()`'s own
    // failure-mode tests use).
    const reader = createCorpusReader(`${fixtureCorpusRoot()}/spell`);
    expect(() => reader.rulesTree()).toThrow(CorpusNotFoundError);
  });
});

// `sourcesIndex()` mirrors `rulesTree()`'s own describe blocks above exactly
// (a sibling artifact, same cache/Zod/failure-mode posture).
describe("createCorpusReader.sourcesIndex()", () => {
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

describe("createCorpusReader.sourcesIndex() failure modes", () => {
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

  /** Writes a current release with a real-corpus header unless overridden; returns its
   * corpus root. */
  function writeConfigManifest(header: Record<string, unknown> = {}): string {
    return writeRelease(dataPath, RELEASE_A, header);
  }

  it("uses an explicit root as given, even the fixture, in either mode", () => {
    for (const dev of [false, true]) {
      const corpus = selectServedCorpus({ explicitRoot: fixtureCorpusRoot(), dataPath, dev });
      expect(corpus).toEqual({
        root: fixtureCorpusRoot(),
        source: "env",
        releaseId: null,
        schemaVersion: CORPUS_SCHEMA_VERSION,
        totalEntityCount: 235,
        fixture: true,
      });
    }
  });

  it("refuses a current link that does not name a release id", () => {
    mkdirSync(join(dataPath, "releases"), { recursive: true });
    symlinkSync("../elsewhere", join(dataPath, "releases", "current"));
    expect(() => selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false })).toThrow(
      /not a release id/,
    );
  });

  it("ignores the old flat <dataPath>/corpus layout", () => {
    mkdirSync(join(dataPath, "corpus"), { recursive: true });
    writeFileSync(
      join(dataPath, "corpus", "manifest.json"),
      JSON.stringify({ schemaVersion: CORPUS_SCHEMA_VERSION, totalEntityCount: 1 }),
    );
    expect(() => selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false })).toThrow(
      /no current release/,
    );
  });

  it("refuses an explicit root with no manifest", () => {
    expect(() =>
      selectServedCorpus({ explicitRoot: join(dataPath, "nope"), dataPath, dev: true }),
    ).toThrow(CorpusUnservableError);
  });

  it("production: serves the current release, resolved past the current link", () => {
    const root = writeConfigManifest();
    const corpus = selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false });
    expect(corpus).toMatchObject({
      root,
      source: "config",
      releaseId: RELEASE_A,
      totalEntityCount: 44980,
    });
    expect(root).toBe(join(dataPath, "releases", RELEASE_A, "corpus"));
    expect(corpus.fixture).toBe(false);
  });

  it("production: refuses a missing release instead of falling back to the fixture", () => {
    expect(() => selectServedCorpus({ explicitRoot: undefined, dataPath, dev: false })).toThrow(
      /no current release at .* never serves the fixture/,
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
      selectServedCorpus({
        explicitRoot: join(dataPath, "releases", RELEASE_A, "corpus"),
        dataPath,
        dev: false,
      }),
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

  it("dev: serves the current release when there is one", () => {
    const root = writeConfigManifest();
    expect(selectServedCorpus({ explicitRoot: undefined, dataPath, dev: true })).toMatchObject({
      root,
      source: "config",
      releaseId: RELEASE_A,
    });
  });
});

// A running server follows `current`: a valid new release gets a fresh reader, a bad one is
// refused (the old release keeps serving), and a pinned request keeps its release.
describe("createCorpusSource (release switching)", () => {
  let dataPath: string;
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  const inputs = () => ({ explicitRoot: undefined, dataPath, dev: false });

  beforeEach(() => {
    dataPath = mkdtempSync(join(tmpdir(), "codex-corpus-source-"));
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dataPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("switches to a new valid release with a reader of its own", () => {
    writeRelease(dataPath, RELEASE_A, { totalEntityCount: 1 });
    const source = createCorpusSource(inputs);
    const readerA = source.reader();
    expect(source.served().releaseId).toBe(RELEASE_A);
    expect(source.reader()).toBe(readerA);

    writeRelease(dataPath, RELEASE_B, { totalEntityCount: 2 });
    expect(source.served()).toMatchObject({ releaseId: RELEASE_B, totalEntityCount: 2 });
    expect(source.reader()).not.toBe(readerA);
    expect(info).toHaveBeenCalledWith(expect.stringContaining(`release ${RELEASE_B}`));
  });

  it("refuses a release of another schema generation and keeps serving, logging once", () => {
    writeRelease(dataPath, RELEASE_A);
    const source = createCorpusSource(inputs);
    expect(source.served().releaseId).toBe(RELEASE_A);
    writeRelease(dataPath, RELEASE_B, { schemaVersion: CORPUS_SCHEMA_VERSION - 1 });
    expect(source.served().releaseId).toBe(RELEASE_A);
    expect(source.served().releaseId).toBe(RELEASE_A);
    expect(error).toHaveBeenCalledOnce();
  });

  it("retries a release that failed with a transient error after the backoff", async () => {
    // vitest.setup.ts loaded corpusFs before this file's node:fs mock; load a fresh copy.
    vi.resetModules();
    const fresh = await import("./corpusFs");
    writeRelease(dataPath, RELEASE_A);
    let now = 0;
    const source = fresh.createCorpusSource(inputs, { clock: () => now, retryMs: 30_000 });
    expect(source.served().releaseId).toBe(RELEASE_A);
    const root = writeRelease(dataPath, RELEASE_B);
    fsFault.path = join(root, "manifest.json");
    fsFault.code = "EMFILE";
    try {
      expect(source.served().releaseId).toBe(RELEASE_A);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("retrying in 30 s"));
      fsFault.path = ""; // the fault clears, but the backoff still holds
      now = 29_999;
      expect(source.served().releaseId).toBe(RELEASE_A);
      now = 30_000;
      expect(source.served().releaseId).toBe(RELEASE_B);
    } finally {
      fsFault.path = "";
    }
  });

  it("refuses a release whose manifest is missing for good, not as transient", () => {
    writeRelease(dataPath, RELEASE_A);
    let now = 0;
    const source = createCorpusSource(inputs, { clock: () => now });
    expect(source.served().releaseId).toBe(RELEASE_A);
    const root = writeRelease(dataPath, RELEASE_B);
    rmSync(join(root, "manifest.json"));
    expect(source.served().releaseId).toBe(RELEASE_A);
    writeFileSync(
      join(root, "manifest.json"),
      JSON.stringify({ schemaVersion: CORPUS_SCHEMA_VERSION, totalEntityCount: 1 }),
    );
    now = 10 * 60_000;
    expect(source.served().releaseId).toBe(RELEASE_A);
  });

  it("never re-checks a refused release on later requests", () => {
    writeRelease(dataPath, RELEASE_A);
    const source = createCorpusSource(inputs);
    expect(source.served().releaseId).toBe(RELEASE_A);
    writeRelease(dataPath, RELEASE_B, { schemaVersion: CORPUS_SCHEMA_VERSION - 1 });
    expect(source.served().releaseId).toBe(RELEASE_A);
    // Were B checked again, this valid manifest would now pass and the source would switch.
    writeFileSync(
      join(dataPath, "releases", RELEASE_B, "corpus", "manifest.json"),
      JSON.stringify({ schemaVersion: CORPUS_SCHEMA_VERSION, totalEntityCount: 1 }),
    );
    expect(source.served().releaseId).toBe(RELEASE_A);
    expect(error).toHaveBeenCalledOnce();
  });

  it("refuses a release holding the fixture", () => {
    writeRelease(dataPath, RELEASE_A);
    const source = createCorpusSource(inputs);
    expect(source.served().releaseId).toBe(RELEASE_A);
    writeRelease(dataPath, RELEASE_B, { foundry: { tag: "fixture" } });
    expect(source.served().releaseId).toBe(RELEASE_A);
  });

  it("pins a request to the release that was current when it began", async () => {
    writeRelease(dataPath, RELEASE_A);
    const source = createCorpusSource(inputs);
    const readerA = source.reader();
    const seen = await source.withPinned(async () => {
      writeRelease(dataPath, RELEASE_B);
      await new Promise((r) => setTimeout(r, 1));
      return source.reader();
    });
    expect(seen).toBe(readerA);
    expect(source.reader()).not.toBe(readerA);
  });

  it("never switches an explicit root", () => {
    writeRelease(dataPath, RELEASE_A);
    const source = createCorpusSource(() => ({ ...inputs(), explicitRoot: fixtureCorpusRoot() }));
    const reader = source.reader();
    writeRelease(dataPath, RELEASE_B);
    expect(source.served()).toMatchObject({ source: "env", releaseId: null });
    expect(source.reader()).toBe(reader);
  });
});
