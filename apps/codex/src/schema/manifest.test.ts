import { describe, expect, it } from "vitest";

import { CorpusManifestSchema, emptyManifest, parseManifest, serializeManifest } from "./manifest";

describe("manifest round-trip", () => {
  it("serialize -> parse deep-equals the original value", () => {
    const manifest = emptyManifest();
    manifest.foundry.tag = "pf2e-8.3.0";
    manifest.foundry.docCount = 28_646;
    manifest.foundry.sha256 = "a".repeat(64);
    manifest.foundry.fetchedAt = "2026-07-12T00:00:00.000Z";
    manifest.aon.snapshotDate = "2026-07-12";
    manifest.aon.docCount = 43_686;
    manifest.aon.categoryCounts = { equipment: 8642, feat: 8460, spell: 2461 };
    manifest.aon.sha256 = "b".repeat(64);
    manifest.aon.fetchedAt = "2026-07-12T00:05:00.000Z";

    const text = serializeManifest(manifest);
    const parsed = parseManifest(JSON.parse(text));
    expect(parsed).toEqual(manifest);
  });

  it("produces byte-identical output across repeated calls", () => {
    const manifest = emptyManifest();
    manifest.aon.categoryCounts = { zeta: 1, alpha: 2, mid: 3 };
    expect(serializeManifest(manifest)).toBe(serializeManifest(manifest));
  });

  it("sorts categoryCounts keys regardless of insertion order", () => {
    const a = emptyManifest();
    a.aon.categoryCounts = { zeta: 1, alpha: 2, mid: 3 };
    const b = emptyManifest();
    b.aon.categoryCounts = { alpha: 2, mid: 3, zeta: 1 };
    expect(serializeManifest(a)).toBe(serializeManifest(b));
  });

  it("ends with exactly one trailing newline", () => {
    const text = serializeManifest(emptyManifest());
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("rejects a non-integer schemaVersion", () => {
    const bad = { ...emptyManifest(), schemaVersion: 1.5 };
    expect(() => parseManifest(bad)).toThrow();
  });

  it("rejects a negative docCount", () => {
    const bad = emptyManifest();
    (bad.foundry as { docCount: number }).docCount = -1;
    expect(() => CorpusManifestSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown top-level field (schema is strict)", () => {
    const bad = { ...emptyManifest(), extra: true };
    expect(() => parseManifest(bad)).toThrow();
  });

  it("rejects a malformed sha256", () => {
    const bad = emptyManifest();
    bad.foundry.sha256 = "not-hex";
    expect(() => CorpusManifestSchema.parse(bad)).toThrow();
  });
});
