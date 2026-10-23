import { describe, expect, it } from "vitest";

import { RulesTreeFileSchema, parseRulesTreeFile } from "./rulesTree";

describe("RulesTreeFileSchema (D29-39)", () => {
  it("round-trips a nested tree with a mix of real and synthetic nodes", () => {
    const file = {
      books: [
        {
          book: "Core Rulebook",
          edition: "legacy" as const,
          license: "OGL" as const,
          hiddenWhenLegacyOff: 1,
          nodes: [
            {
              name: "Chapter 1: Introduction",
              id: "rules/chapter-1",
              children: [{ name: "Welcome", id: "rules/welcome", superseded: true, children: [] }],
            },
            {
              // synthetic — no `id`
              name: "Missing Chapter",
              children: [{ name: "Orphan", id: "rules/orphan", children: [] }],
            },
          ],
        },
      ],
    };
    expect(parseRulesTreeFile(file)).toEqual(file);
  });

  it("rejects a node id that isn't a CodexId shape", () => {
    const bad = {
      books: [
        {
          book: "X",
          edition: "legacy",
          license: "unknown",
          hiddenWhenLegacyOff: 0,
          nodes: [{ name: "N", id: "not-a-codex-id", children: [] }],
        },
      ],
    };
    expect(() => RulesTreeFileSchema.parse(bad)).toThrow();
  });

  it("rejects extra top-level fields on a book (.strict())", () => {
    const bad = {
      books: [
        {
          book: "X",
          edition: "legacy",
          license: "unknown",
          hiddenWhenLegacyOff: 0,
          nodes: [],
          extra: true,
        },
      ],
    };
    expect(() => RulesTreeFileSchema.parse(bad)).toThrow();
  });
});
