import { createCorpusReader } from "@astra/codex-corpus/reader";
import { describe, expect, it } from "vitest";

import { fixtureCorpusRoot } from "./corpusFs";
import { resolveSourcesIndex } from "./sourcesIndexData";

/**
 * The `/sources` loader's pure core, over the fixture
 * corpus (same "plain function, no Start-runtime" pattern as
 * `rulesTreeData.test.ts`).
 */
describe("resolveSourcesIndex", () => {
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

  it("the Core Rulebook fixture book carries a sourceEntityRef to its source entity", () => {
    const coreRulebook = data.books.find((b) => b.book === "Core Rulebook");
    expect(coreRulebook?.sourceEntityRef).toBe("source/core-rulebook");
  });
});
