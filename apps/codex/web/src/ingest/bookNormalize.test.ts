import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import { normalizeBookNames } from "./bookNormalize";

function entity(id: string, book: string): CodexEntity {
  return {
    id,
    slug: id.split("/")[1] ?? id,
    category: id.split("/")[0] ?? "test",
    name: id,
    edition: "remaster",
    source: { book, license: "unknown" },
    traits: [],
    body: [],
    facets: {},
  };
}

describe("normalizeBookNames (D29-39)", () => {
  it("rule 1: strips CRLF/tab garbage and collapses internal whitespace", () => {
    const entities = [
      entity("spell/a", "Draconic  Codex\r\n"),
      entity("spell/b", "Draconic Codex"),
    ];
    const result = normalizeBookNames(entities, new Set(["Draconic Codex"]));
    expect(result.entities.map((e) => e.source.book)).toEqual(["Draconic Codex", "Draconic Codex"]);
    expect(result.distinctAfter).toBe(1);
    const row = result.mergeTable.find((r) => r.from === "Draconic  Codex\r\n");
    expect(row).toMatchObject({ to: "Draconic Codex", entityCount: 1, kind: "whitespace" });
  });

  it("rule 2: case-insensitive dedup prefers the AoN-known spelling", () => {
    const entities = [entity("spell/a", "core rulebook"), entity("spell/b", "Core Rulebook")];
    const result = normalizeBookNames(entities, new Set(["Core Rulebook"]));
    expect(result.caseFoldGroupCount).toBe(1);
    expect(new Set(result.entities.map((e) => e.source.book))).toEqual(new Set(["Core Rulebook"]));
  });

  it('rule 3: a Foundry-only "Pathfinder " + <AoN book> string merges into the AoN spelling', () => {
    const entities = [entity("spell/a", "Pathfinder Bestiary"), entity("spell/b", "Bestiary")];
    const result = normalizeBookNames(entities, new Set(["Bestiary"]));
    expect(result.prefixMergeCount).toBe(1);
    expect(new Set(result.entities.map((e) => e.source.book))).toEqual(new Set(["Bestiary"]));
    const row = result.mergeTable.find((r) => r.from === "Pathfinder Bestiary");
    expect(row).toMatchObject({ to: "Bestiary", entityCount: 1, kind: "prefixMerge" });
  });

  it("does NOT merge a Foundry-only prefixed string when the base isn't a known AoN book (no fuzzy matching)", () => {
    const entities = [entity("spell/a", "Pathfinder Some Unknown Scenario")];
    const result = normalizeBookNames(entities, new Set(["Bestiary"]));
    expect(result.prefixMergeCount).toBe(0);
    expect(result.entities[0]?.source.book).toBe("Pathfinder Some Unknown Scenario");
  });

  it("a book string that's already clean and AoN-known passes through unchanged with no mergeTable row", () => {
    const entities = [entity("spell/a", "Player Core")];
    const result = normalizeBookNames(entities, new Set(["Player Core"]));
    expect(result.mergeTable).toHaveLength(0);
    expect(result.entities[0]?.source.book).toBe("Player Core");
  });

  it("leaves every other entity field untouched", () => {
    const e = entity("spell/a", "Pathfinder Bestiary");
    const result = normalizeBookNames([e], new Set(["Bestiary"]));
    expect(result.entities[0]).toEqual({ ...e, source: { book: "Bestiary", license: "unknown" } });
  });
});
