import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";
import { resolveSourcesIndex } from "./sourcesIndexData";

/**
 * D29-43 tier 3 — the `/sources` loader's pure core, over the fixture
 * corpus (same "plain function, no Start-runtime" pattern as
 * `rulesTreeData.test.ts`).
 */
describe("resolveSourcesIndex (D29-43)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const data = resolveSourcesIndex(reader);

  it("is a passthrough of reader.sourcesIndex() (same shape, not re-derived)", () => {
    expect(data).toEqual(reader.sourcesIndex());
  });

  it("returns every fixture book with a categoryCounts breakdown", () => {
    expect(data.books.length).toBeGreaterThan(0);
    for (const book of data.books) {
      expect(Object.keys(book.categoryCounts).length).toBeGreaterThan(0);
    }
  });

  it("the Core Rulebook fixture book carries a sourceEntityRef (the D29-44 source entity)", () => {
    const coreRulebook = data.books.find((b) => b.book === "Core Rulebook");
    expect(coreRulebook?.sourceEntityRef).toBe("source/core-rulebook");
  });
});
