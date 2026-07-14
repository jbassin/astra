import { describe, expect, it } from "vitest";

import {
  CorpusNotFoundError,
  createCorpusReader,
  fixtureCorpusRoot,
  resolveCorpusRoot,
} from "./corpusFs";

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
});

describe("resolveCorpusRoot (D29-23 fail-soft)", () => {
  it("resolves to a corpus root that actually has a manifest.json (real or fixture)", () => {
    const root = resolveCorpusRoot();
    // Either the real corpus (if `apps/codex/data/corpus` happens to be present in
    // this environment) or the committed fixture — both are valid D29-23 outcomes;
    // the one invariant is that SOME readable corpus root came back.
    const reader = createCorpusReader(root);
    expect(reader.categories().length).toBeGreaterThan(0);
  });
});
