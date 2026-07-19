import { describe, expect, it, vi } from "vitest";

import { OTHER_GROUP_LABEL } from "@/domain/sources/sourcesModel";
import type { IndexRow } from "@/schema/entity";
import type { SourcesIndexFile } from "@/schema/sourcesIndex";

import {
  CorpusNotFoundError,
  createCorpusReader,
  fixtureCorpusRoot,
  type CorpusReader,
} from "./corpusFs";
import { resolveCategoryListing } from "./listingData";

/** P13 S3 (D29-121) — a minimal in-memory `CorpusReader` double, for the
 * `sourceLines` fail-soft cases the real fixture corpus can't exercise on
 * its own (its own `sources-index.json` happens to carry NO `productLine`
 * at all — every real-fixture book is already "Other", see the sanity test
 * below). Only `index`/`sourcesIndex` are exercised by
 * `resolveCategoryListing`; every other member throws if a test ever
 * reaches it (a signal the test itself is wrong, not a real code path) —
 * `() => never` is structurally assignable to every one of `CorpusReader`'s
 * real method signatures (fewer params + a `never` return, no cast needed). */
function unimplemented(): never {
  throw new Error("not implemented on this fake CorpusReader");
}

function fakeReader(overrides: {
  rows: readonly IndexRow[];
  sourcesIndex: () => SourcesIndexFile;
}): CorpusReader {
  return {
    categories: unimplemented,
    categoryCounts: unimplemented,
    index: () => overrides.rows,
    entity: unimplemented,
    rulesTree: unimplemented,
    sourcesIndex: overrides.sourcesIndex,
  };
}

function indexRow(
  book: string,
  id = `spell/${book.toLowerCase().replace(/\s+/gu, "-")}`,
): IndexRow {
  return {
    id,
    name: book,
    traits: [],
    source: { book, license: "unknown" },
    edition: "remaster",
    superseded: false,
  };
}

/**
 * D29-27/D29-29 tier 3, superseded by P3 D29-35 — the `/{category}` faceted
 * listing's pure core, over the fixture corpus.
 */
describe("resolveCategoryListing (D29-27/D29-35)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("returns every row for a real category, A-Z sorted by name", () => {
    const data = resolveCategoryListing(reader, "spell");
    expect(data).not.toBeNull();
    expect(data?.category).toBe("spell");
    expect(data?.rows.length).toBe(reader.index("spell").length);
    const names = (data?.rows ?? []).map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("row count equals the category's file/index count (D acceptance)", () => {
    for (const category of reader.categories()) {
      const data = resolveCategoryListing(reader, category);
      expect(data?.rows.length).toBe(reader.index(category).length);
    }
  });

  it("D29-35: the loader ships the FULL IndexRow (traits/facets/superseded), the P2 trim is dead", () => {
    const data = resolveCategoryListing(reader, "spell");
    const row = data?.rows.find((r) => r.id === "spell/heal");
    expect(row).toBeDefined();
    expect(row).toHaveProperty("traits");
    expect(row).toHaveProperty("superseded");
    expect(row?.name).toBe("Heal");
    expect(row?.source).toBeDefined();
    expect(row?.edition).toBeDefined();
  });

  it("a row carrying facets (the filter engine's derived-facet input) round-trips them intact", () => {
    const data = resolveCategoryListing(reader, "creature");
    const withFacets = data?.rows.find((r) => r.facets !== undefined);
    expect(withFacets).toBeDefined();
    expect(typeof withFacets?.facets?.hp).toBe("number");
  });

  it("omits optional level/rarity when absent on the source row (fail-soft, never undefined-valued keys)", () => {
    const data = resolveCategoryListing(reader, "spell");
    const withoutLevel = data?.rows.find((r) => r.level === undefined);
    if (withoutLevel) expect("level" in withoutLevel).toBe(false);
  });

  it("returns null for an unknown category (loader 404 input)", () => {
    expect(resolveCategoryListing(reader, "not-a-real-category")).toBeNull();
  });

  it("D29-121: against the real fixture corpus, every row's book gets a sourceLines entry (the fixture's own sources-index.json carries no productLine yet, so today every book resolves to Other)", () => {
    const data = resolveCategoryListing(reader, "spell");
    expect(data).not.toBeNull();
    for (const row of data?.rows ?? []) {
      expect(data?.sourceLines[row.source.book]).toBe(OTHER_GROUP_LABEL);
    }
  });
});

/**
 * P13 S3 (D29-121) — `sourceLines`: built from the FULL category row set
 * joined against `reader.sourcesIndex()`, fail-soft three ways (a
 * `productLine: null`/absent book, a book with no entry at all, and the
 * index FILE itself missing/malformed). The real fixture corpus's own
 * `sources-index.json` happens to carry zero `productLine` values (see the
 * sanity test above), so the "happy path" (a book that resolves to a REAL,
 * non-Other line) needs a synthetic `CorpusReader` double instead —
 * `fakeReader`, above.
 */
describe("resolveCategoryListing — sourceLines (D29-121)", () => {
  it("happy path: a book WITH a real productLine maps to it; a book with productLine:null falls soft to Other", () => {
    const reader = fakeReader({
      rows: [indexRow("Alpha Book"), indexRow("Beta Book")],
      sourcesIndex: () => ({
        books: [
          {
            book: "Alpha Book",
            productLine: "Rulebooks",
            license: "unknown",
            edition: "remaster",
            entityCount: 1,
            categoryCounts: { spell: 1 },
          },
          {
            book: "Beta Book",
            license: "unknown",
            edition: "remaster",
            entityCount: 1,
            categoryCounts: { spell: 1 },
          },
        ],
      }),
    });
    const data = resolveCategoryListing(reader, "spell");
    expect(data?.sourceLines).toEqual({
      "Alpha Book": "Rulebooks",
      "Beta Book": OTHER_GROUP_LABEL,
    });
  });

  it("fail-soft #2: a book with NO entry at all in sourcesIndex().books falls soft to Other", () => {
    const reader = fakeReader({
      rows: [indexRow("Ghost Book")],
      sourcesIndex: () => ({ books: [] }),
    });
    const data = resolveCategoryListing(reader, "spell");
    expect(data?.sourceLines).toEqual({ "Ghost Book": OTHER_GROUP_LABEL });
  });

  it("fail-soft #3: sourcesIndex() throwing CorpusNotFoundError (missing/malformed sources-index.json) yields an all-Other map, never a throw — warning ONCE, not per call", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const reader = fakeReader({
      rows: [indexRow("Alpha Book"), indexRow("Beta Book")],
      sourcesIndex: () => {
        throw new CorpusNotFoundError("no sources-index.json at this root");
      },
    });
    const first = resolveCategoryListing(reader, "spell");
    const second = resolveCategoryListing(reader, "feat");
    expect(first?.sourceLines).toEqual({
      "Alpha Book": OTHER_GROUP_LABEL,
      "Beta Book": OTHER_GROUP_LABEL,
    });
    expect(second?.sourceLines).toEqual({
      "Alpha Book": OTHER_GROUP_LABEL,
      "Beta Book": OTHER_GROUP_LABEL,
    });
    // The always-200 listing route must never 500 on this artifact — proven
    // above by both calls returning normally — and the warn is one-time
    // (module-scope flag), not repeated on every listing request.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("a non-CorpusNotFoundError from sourcesIndex() still propagates (only the documented fail-soft error is swallowed)", () => {
    const reader = fakeReader({
      rows: [indexRow("Alpha Book")],
      sourcesIndex: () => {
        throw new Error("boom");
      },
    });
    expect(() => resolveCategoryListing(reader, "spell")).toThrow("boom");
  });
});
