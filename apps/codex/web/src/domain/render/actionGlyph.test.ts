import { describe, expect, it } from "vitest";

import { normalizeCodexActionGlyph } from "./actionGlyph";

/**
 * D29-24 adversarial B1 — vocabulary coverage. Every one of the 25 distinct
 * `actionGlyph.cost` tokens actually present in the real corpus (verified by
 * an exhaustive scan over ~46k entities' bodies + embedded items) is listed
 * here; the last two are the spec's own named "genuinely unknown" residue.
 */
describe("normalizeCodexActionGlyph: the real corpus vocabulary (25 distinct tokens)", () => {
  it("bare long forms", () => {
    expect(normalizeCodexActionGlyph("Single Action")).toEqual({ kind: "single", cost: "1" });
    expect(normalizeCodexActionGlyph("Two Actions")).toEqual({ kind: "single", cost: "2" });
    expect(normalizeCodexActionGlyph("Three Actions")).toEqual({ kind: "single", cost: "3" });
    expect(normalizeCodexActionGlyph("Reaction")).toEqual({ kind: "single", cost: "reaction" });
    expect(normalizeCodexActionGlyph("Free Action")).toEqual({ kind: "single", cost: "free" });
  });

  it("bare digits (delegated to gothic's own alias table)", () => {
    expect(normalizeCodexActionGlyph("1")).toEqual({ kind: "single", cost: "1" });
    expect(normalizeCodexActionGlyph("2")).toEqual({ kind: "single", cost: "2" });
    expect(normalizeCodexActionGlyph("3")).toEqual({ kind: "single", cost: "3" });
  });

  it("single-letter forms: A/a, F/f, R/r", () => {
    expect(normalizeCodexActionGlyph("A")).toEqual({ kind: "single", cost: "1" });
    expect(normalizeCodexActionGlyph("a")).toEqual({ kind: "single", cost: "1" });
    expect(normalizeCodexActionGlyph("F")).toEqual({ kind: "single", cost: "free" });
    expect(normalizeCodexActionGlyph("f")).toEqual({ kind: "single", cost: "free" });
    expect(normalizeCodexActionGlyph("R")).toEqual({ kind: "single", cost: "reaction" });
    expect(normalizeCodexActionGlyph("r")).toEqual({ kind: "single", cost: "reaction" });
  });

  it("composite forms: 'to' and 'or'", () => {
    expect(normalizeCodexActionGlyph("Single Action to Three Actions")).toEqual({
      kind: "composite",
      left: "1",
      connective: "to",
      right: "3",
    });
    expect(normalizeCodexActionGlyph("Single Action to Two Actions")).toEqual({
      kind: "composite",
      left: "1",
      connective: "to",
      right: "2",
    });
    expect(normalizeCodexActionGlyph("Single Action or Two Actions")).toEqual({
      kind: "composite",
      left: "1",
      connective: "or",
      right: "2",
    });
    expect(normalizeCodexActionGlyph("Two Actions or Three Actions")).toEqual({
      kind: "composite",
      left: "2",
      connective: "or",
      right: "3",
    });
    expect(normalizeCodexActionGlyph("Single Action or Three Actions")).toEqual({
      kind: "composite",
      left: "1",
      connective: "or",
      right: "3",
    });
  });

  it("composite forms using the 'One Action' (not 'Single Action') right-hand phrasing", () => {
    expect(normalizeCodexActionGlyph("Free Action or One Action")).toEqual({
      kind: "composite",
      left: "free",
      connective: "or",
      right: "1",
    });
    expect(normalizeCodexActionGlyph("Reaction or One Action")).toEqual({
      kind: "composite",
      left: "reaction",
      connective: "or",
      right: "1",
    });
    expect(normalizeCodexActionGlyph("Reaction or Two Actions")).toEqual({
      kind: "composite",
      left: "reaction",
      connective: "or",
      right: "2",
    });
  });

  it("the open-ended 'or more Actions' composite", () => {
    expect(normalizeCodexActionGlyph("Single Action or more Actions")).toEqual({
      kind: "openEnded",
      left: "1",
      connective: "or",
    });
  });

  it("genuinely unknown tokens fall back to text (the spec's own named residue)", () => {
    expect(normalizeCodexActionGlyph("T")).toEqual({ kind: "unknown", raw: "T" });
    expect(normalizeCodexActionGlyph("Two Actions to 2 rounds")).toEqual({
      kind: "unknown",
      raw: "Two Actions to 2 rounds",
    });
  });

  it("an arbitrary made-up token is unknown, not silently coerced", () => {
    expect(normalizeCodexActionGlyph("Fourteen Actions")).toEqual({
      kind: "unknown",
      raw: "Fourteen Actions",
    });
  });
});
