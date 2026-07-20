import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAssayReader, emptyAssayReader } from "./assayFs";

// D30-39: `createAssayReader(dataDir)` is a pure factory over an explicit
// `dataDir` (the `codex.data-path` root, parent of `assay/`), directly
// unit-testable — same posture as `createCorpusReader(rootDir)`
// (`corpusFs.test.ts`). The committed fixture at `apps/codex/fixtures/assay/
// spell-power.json` exercises every kind + edge D30-40 asks the render
// layer to cover (quantitative, hybrid, buff-comparables + variants, a
// known AND an unknown reasonCode, a summonBand rider) — reused by
// `assayBlock.test.tsx` as in-memory literals for fine-grained per-case
// control, and read here end-to-end through the real fs/schema path.
const FIXTURE_DATA_DIR = join(import.meta.dirname, "../../fixtures");

describe("createAssayReader (D30-39)", () => {
  it("reads a real entry from the committed fixture artifact", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    const entry = reader.entry("spell/heal");
    expect(entry?.kind).toBe("quantitative");
    expect(entry?.verdict).toBe("in band");
  });

  it("returns undefined for an id with no assay entry (not every fixture spell is present)", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    expect(reader.entry("spell/magic-missile-does-not-exist")).toBeUndefined();
  });

  it("a hybrid entry carries BOTH quantitative fields AND comparables", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    const entry = reader.entry("spell/force-barrage");
    expect(entry?.kind).toBe("quantitative");
    expect(entry?.ev).toBeDefined();
    expect(entry?.comparables?.length).toBe(2);
    // the r10 thin-data trigger: one comparable at rank >= 9
    expect(entry?.comparables?.some((c) => c.rank >= 9)).toBe(true);
  });

  it("a buff-comparables entry carries variants", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    const entry = reader.entry("spell/synthetic-buff-comparables-example");
    expect(entry?.kind).toBe("buff-comparables");
    expect(entry?.variants?.[0]?.label).toBe("Heightened (6th)");
  });

  it("a summonBand rides alongside kind:quantitative (D30-37 kind precedence)", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    const entry = reader.entry("spell/summon-example");
    expect(entry?.kind).toBe("quantitative");
    expect(entry?.summonBand).toEqual({ baseLevel: 4, curveLevel: 3, delta: 1 });
  });

  it("a ledger entry carries reasonCode, population null distinct from absent", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    const entry = reader.entry("spell/heal@legacy");
    expect(entry?.kind).toBe("ledger");
    expect(entry?.reasonCode).toBe("no-comparable-profile");
    expect(entry?.population).toBeNull();
  });

  it("an unrecognized reasonCode round-trips as a plain string (the render layer, not this schema, curates it)", () => {
    const reader = createAssayReader(FIXTURE_DATA_DIR);
    const entry = reader.entry("spell/unknown-reason-example");
    expect(entry?.reasonCode).toBe("some-future-code-not-in-the-curated-map");
  });
});

describe("createAssayReader: fail-soft, NO fixture fallback (D30-39)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("a missing artifact directory returns undefined for every id — never falls back to fixture data", () => {
    const reader = createAssayReader(join(tmpdir(), "codex-assay-test-nonexistent-dir"));
    expect(reader.entry("spell/heal")).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("assay/spell-power.json");
  });

  it("a malformed (schema-invalid) artifact also fails soft to undefined", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-assay-test-"));
    try {
      const assayDir = join(dir, "assay");
      mkdirSync(assayDir);
      writeFileSync(join(assayDir, "spell-power.json"), JSON.stringify({ schemaVersion: 2 }));
      const reader = createAssayReader(dir);
      expect(reader.entry("spell/heal")).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("warns exactly ONCE across repeated calls on a missing artifact (not per-request spam)", () => {
    const reader = createAssayReader(join(tmpdir(), "codex-assay-test-nonexistent-dir-2"));
    reader.entry("spell/heal");
    reader.entry("spell/fireball");
    reader.entry("spell/heroism");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("cache-on-success: a successful read survives the artifact later disappearing", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-assay-test-cache-"));
    try {
      const assayDir = join(dir, "assay");
      mkdirSync(assayDir);
      const artifactPath = join(assayDir, "spell-power.json");
      writeFileSync(
        artifactPath,
        JSON.stringify({
          schemaVersion: 1,
          entries: { "spell/heal": { kind: "quantitative", rank: 1, population: "beneficial" } },
        }),
      );
      const reader = createAssayReader(dir);
      expect(reader.entry("spell/heal")?.kind).toBe("quantitative");
      rmSync(artifactPath); // the file is now gone
      // still resolves from the per-process cache, no re-read/no warn
      expect(reader.entry("spell/heal")?.kind).toBe("quantitative");
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("emptyAssayReader (D30-40 default)", () => {
  it("always returns undefined, for any id, with no fs access at all", () => {
    expect(emptyAssayReader.entry("spell/heal")).toBeUndefined();
    expect(emptyAssayReader.entry("anything")).toBeUndefined();
  });
});
