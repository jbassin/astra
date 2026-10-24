import { describe, expect, it } from "vitest";

import { SourcesIndexFileSchema, parseSourcesIndexFile } from "./sourcesIndex";

describe("SourcesIndexFileSchema (D29-43)", () => {
  it("round-trips a classified book and an 'Other'-bucket book (no productLine)", () => {
    const file = {
      books: [
        {
          book: "Player Core",
          productLine: "Rulebooks",
          license: "ORC" as const,
          edition: "remaster" as const,
          entityCount: 500,
          categoryCounts: { spell: 300, feat: 200 },
          sourceEntityRef: "source/player-core",
        },
        {
          book: "Foundry Journal: Ancestries",
          license: "unknown" as const,
          edition: "legacy" as const,
          entityCount: 5,
          categoryCounts: { ancestry: 5 },
        },
      ],
    };
    expect(parseSourcesIndexFile(file)).toEqual(file);
  });

  it("rejects extra fields (.strict())", () => {
    const bad = {
      books: [
        {
          book: "X",
          license: "unknown",
          edition: "legacy",
          entityCount: 0,
          categoryCounts: {},
          extra: true,
        },
      ],
    };
    expect(() => SourcesIndexFileSchema.parse(bad)).toThrow();
  });

  it("rejects a missing categoryCounts (required, not optional)", () => {
    const bad = {
      books: [{ book: "X", license: "unknown", edition: "legacy", entityCount: 0 }],
    };
    expect(() => SourcesIndexFileSchema.parse(bad)).toThrow();
  });
});
