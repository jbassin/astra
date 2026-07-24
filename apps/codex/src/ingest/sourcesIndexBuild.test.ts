import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import { normalizeBookNames } from "./bookNormalize";
import { buildSourcesIndex, PRODUCT_LINE_OVERRIDE } from "./sourcesIndexBuild";

function entity(
  id: string,
  book: string,
  edition: "legacy" | "remaster" = "remaster",
): CodexEntity {
  return {
    id,
    slug: id.split("/")[1] ?? id,
    category: id.split("/")[0] ?? "test",
    name: id,
    edition,
    source: { book, license: "unknown" },
    traits: [],
    body: [],
    facets: {},
  };
}

describe("buildSourcesIndex (D29-43)", () => {
  it("classifies a book by the majority AoN primary_source_category among its citing docs", () => {
    const result = buildSourcesIndex({
      finalEntities: [entity("spell/a", "Core Rulebook"), entity("spell/b", "Core Rulebook")],
      aonCitations: [
        { book: "Core Rulebook", productLine: "Rulebooks" },
        { book: "Core Rulebook", productLine: "Rulebooks" },
        { book: "Core Rulebook", productLine: "Adventure Paths" },
      ],
      bookNameMap: new Map(),
      bookSourceLicense: new Map(),
      sourceEntityRefByBook: new Map(),
    });
    const row = result.file.books.find((b) => b.book === "Core Rulebook");
    expect(row?.productLine).toBe("Rulebooks");
    expect(row?.entityCount).toBe(2);
    expect(result.stats.classifiedBooks).toBe(1);
    expect(result.stats.otherBooks).toBe(0);
  });

  it("categoryCounts breaks entityCount down per category (D29-43 P4 S4)", () => {
    const result = buildSourcesIndex({
      finalEntities: [
        entity("spell/a", "Core Rulebook"),
        entity("spell/b", "Core Rulebook"),
        entity("feat/c", "Core Rulebook"),
      ],
      aonCitations: [],
      bookNameMap: new Map(),
      bookSourceLicense: new Map(),
      sourceEntityRefByBook: new Map(),
    });
    const row = result.file.books.find((b) => b.book === "Core Rulebook");
    expect(row?.categoryCounts).toEqual({ feat: 1, spell: 2 });
    // the sum of every category's count equals the book's own entityCount.
    const sum = Object.values(row?.categoryCounts ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBe(row?.entityCount);
  });

  it('a book with zero AoN citations lands in the "Other" bucket (no productLine)', () => {
    const result = buildSourcesIndex({
      finalEntities: [entity("boon/a", "Foundry Journal: Ancestries")],
      aonCitations: [],
      bookNameMap: new Map(),
      bookSourceLicense: new Map(),
      sourceEntityRefByBook: new Map(),
    });
    const row = result.file.books.find((b) => b.book === "Foundry Journal: Ancestries");
    expect(row?.productLine).toBeUndefined();
    expect(result.stats.otherBooks).toBe(1);
    expect(result.stats.otherEntities).toBe(1);
  });

  it("maps an AoN citation's raw book string through bookNameMap onto the same final key entities use", () => {
    const result = buildSourcesIndex({
      finalEntities: [entity("spell/a", "Bestiary")],
      aonCitations: [{ book: "Pathfinder Bestiary", productLine: "Rulebooks" }],
      bookNameMap: new Map([["Pathfinder Bestiary", "Bestiary"]]),
      bookSourceLicense: new Map(),
      sourceEntityRefByBook: new Map(),
    });
    const row = result.file.books.find((b) => b.book === "Bestiary");
    expect(row?.productLine).toBe("Rulebooks");
  });

  it("attaches sourceEntityRef when a matching source-category entity exists", () => {
    const result = buildSourcesIndex({
      finalEntities: [entity("spell/a", "Player Core")],
      aonCitations: [],
      bookNameMap: new Map(),
      bookSourceLicense: new Map([["Player Core", "ORC"]]),
      sourceEntityRefByBook: new Map([["Player Core", "source/player-core"]]),
    });
    const row = result.file.books.find((b) => b.book === "Player Core");
    expect(row?.sourceEntityRef).toBe("source/player-core");
    expect(row?.license).toBe("ORC");
  });

  it("trips the <90%-of-entities-classified guard, without changing the emitted data shape", () => {
    const result = buildSourcesIndex({
      finalEntities: [entity("spell/a", "Known Book"), entity("boon/a", "Unknown Book")],
      aonCitations: [{ book: "Known Book", productLine: "Rulebooks" }],
      bookNameMap: new Map(),
      bookSourceLicense: new Map(),
      sourceEntityRefByBook: new Map(),
    });
    expect(result.stats.classifiedEntityPct).toBe(50);
    expect(result.stats.belowNinetyPctGuard).toBe(true);
  });

  // 0030 S3 (D30-45): the LotI2 product-line override — consulted BEFORE the
  // AoN majority vote, since the homebrew store never carries AoN citations
  // at all (D30-43 routes it around the AoN join entirely).
  describe("PRODUCT_LINE_OVERRIDE (D30-45)", () => {
    const HOMEBREW_BOOK = "Liturgy of the Iridite Vol.2";

    it("the override key equals bookNormalize's own output for the literal title", () => {
      // The override map is keyed on the POST-bookNormalize final book
      // string, not the raw Foundry `publication.title` — for this title
      // the normalized form IS the literal title (no whitespace/case-fold/
      // prefix-merge rule touches it), asserted here so a future title with
      // punctuation can't silently miss the override.
      expect(Object.keys(PRODUCT_LINE_OVERRIDE)).toEqual([HOMEBREW_BOOK]);
      const { entities } = normalizeBookNames([entity("spell/x", HOMEBREW_BOOK)], new Set());
      expect(entities[0]?.source.book).toBe(HOMEBREW_BOOK);
    });

    it("the LotI2 book gets productLine Homebrew even with ZERO AoN citations", () => {
      const result = buildSourcesIndex({
        finalEntities: [entity("spell/loti2", HOMEBREW_BOOK)],
        aonCitations: [],
        bookNameMap: new Map(),
        bookSourceLicense: new Map(),
        sourceEntityRefByBook: new Map(),
      });
      const row = result.file.books.find((b) => b.book === HOMEBREW_BOOK);
      expect(row?.productLine).toBe("Homebrew");
      expect(result.stats.classifiedBooks).toBe(1);
      expect(result.stats.otherBooks).toBe(0);
    });

    it("the override wins over an AoN majority vote for the same (hypothetical) book string", () => {
      const result = buildSourcesIndex({
        finalEntities: [entity("spell/loti2", HOMEBREW_BOOK)],
        aonCitations: [
          { book: HOMEBREW_BOOK, productLine: "Rulebooks" },
          { book: HOMEBREW_BOOK, productLine: "Rulebooks" },
        ],
        bookNameMap: new Map(),
        bookSourceLicense: new Map(),
        sourceEntityRefByBook: new Map(),
      });
      const row = result.file.books.find((b) => b.book === HOMEBREW_BOOK);
      expect(row?.productLine).toBe("Homebrew");
    });
  });
});
