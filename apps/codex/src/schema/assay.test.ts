import { describe, expect, it } from "vitest";

import { AssayExportFileSchema, AssayEntrySchema, parseAssayExportFile } from "./assay";

describe("AssayEntrySchema (D30-38)", () => {
  it("round-trips a bare quantitative entry", () => {
    const entry = {
      kind: "quantitative" as const,
      rank: 3,
      population: "hostile" as const,
      verdict: "in band",
      residualRanks: 0.2,
      ev: 12.5,
      budget: 12,
    };
    expect(AssayEntrySchema.parse(entry)).toEqual(entry);
  });

  it("round-trips a hybrid entry (quantitative kind carrying comparables)", () => {
    const entry = {
      kind: "quantitative" as const,
      rank: 6,
      population: "hostile" as const,
      verdict: "+1.8 ranks hot",
      residualRanks: 1.8,
      ev: 30,
      budget: 24,
      comparables: [
        { id: "spell/fireball", name: "Fireball", rank: 6 },
        { id: "spell/lightning-bolt", name: "Lightning Bolt", rank: 6 },
      ],
      rankRange: [6, 6] as [number, number],
    };
    expect(AssayEntrySchema.parse(entry)).toEqual(entry);
  });

  it("round-trips a buff-comparables entry", () => {
    const entry = {
      kind: "buff-comparables" as const,
      rank: 3,
      population: "beneficial" as const,
      comparables: [{ id: "spell/heroism", name: "Heroism", rank: 3 }],
      rankRange: [3, 9] as [number, number],
    };
    expect(AssayEntrySchema.parse(entry)).toEqual(entry);
  });

  it("round-trips a null population (allowed, distinct from absent)", () => {
    const entry = {
      kind: "ledger" as const,
      rank: 1,
      population: null,
      reasonCode: "no-comparable-profile",
    };
    const parsed = AssayEntrySchema.parse(entry);
    expect(parsed.population).toBeNull();
  });

  it("round-trips a summonBand rider alongside kind:quantitative (D30-37 kind precedence)", () => {
    const entry = {
      kind: "quantitative" as const,
      rank: 4,
      population: "summon" as const,
      verdict: "in band",
      ev: 20,
      budget: 20,
      summonBand: { baseLevel: 4, curveLevel: 3, delta: 1 },
    };
    expect(AssayEntrySchema.parse(entry)).toEqual(entry);
  });

  it("round-trips variants (each carrying the same shared fields plus a label)", () => {
    const entry = {
      kind: "quantitative" as const,
      rank: 3,
      population: "hostile" as const,
      verdict: "in band",
      ev: 10,
      budget: 10,
      variants: [
        {
          label: "Heightened (5th)",
          kind: "quantitative" as const,
          rank: 5,
          population: "hostile" as const,
          verdict: "+0.5 ranks hot",
          ev: 18,
          budget: 17.5,
        },
      ],
    };
    expect(AssayEntrySchema.parse(entry)).toEqual(entry);
  });

  it("rejects extra fields (.strict())", () => {
    const bad = { kind: "quantitative", rank: 3, population: null, bogus: true };
    expect(() => AssayEntrySchema.parse(bad)).toThrow();
  });

  it("rejects a missing required field (rank)", () => {
    const bad = { kind: "quantitative", population: null };
    expect(() => AssayEntrySchema.parse(bad)).toThrow();
  });

  it("rejects an unknown kind literal", () => {
    const bad = { kind: "surprising", rank: 3, population: null };
    expect(() => AssayEntrySchema.parse(bad)).toThrow();
  });
});

describe("AssayExportFileSchema / parseAssayExportFile (D30-38)", () => {
  it("round-trips a whole export file, entries keyed by codex id", () => {
    const file = {
      schemaVersion: 1 as const,
      entries: {
        "spell/heal": {
          kind: "quantitative" as const,
          rank: 1,
          population: "beneficial" as const,
          verdict: "in band",
          ev: 4,
          budget: 4,
        },
        "spell/fireball": {
          kind: "ledger" as const,
          rank: 3,
          population: null,
          reasonCode: "no-comparable-profile",
        },
      },
    };
    expect(parseAssayExportFile(file)).toEqual(file);
  });

  it("rejects a schemaVersion other than 1", () => {
    const bad = { schemaVersion: 2, entries: {} };
    expect(() => AssayExportFileSchema.parse(bad)).toThrow();
  });

  it("rejects extra top-level fields (.strict())", () => {
    const bad = { schemaVersion: 1, entries: {}, generatedAt: "2026-07-20" };
    expect(() => AssayExportFileSchema.parse(bad)).toThrow();
  });
});
