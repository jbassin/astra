import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import { buildSourcesIndex } from "./sourcesIndexBuild";

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
});
