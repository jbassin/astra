import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActionGlyph,
  type ActionCost,
  normalizeActionCost,
  normalizeCodexActionGlyph,
} from "./actionGlyph";

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

  it("bare digits (the short-form table)", () => {
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

/**
 * `ActionGlyph` renders the Paizo action-icon font as one Private-Use-Area character in a
 * `<span>`. These pin its accessibility contract (role/aria-label/title) and the character
 * each cost renders.
 */
const LABELS: Record<ActionCost, string> = {
  "1": "one action",
  "2": "two actions",
  "3": "three actions",
  reaction: "reaction",
  free: "free action",
};

// The font's own PUA codepoints (`ACTIONS-GLYPH-SOURCE.md`'s GSUB-ligature
// dump) — one pre-composed glyph per cost.
const CHARS: Record<ActionCost, string> = {
  "1": "\uE902",
  "2": "\uE901",
  "3": "\uE900",
  reaction: "\uE904",
  free: "\uE903",
};

function renderGlyph(cost: ActionCost): string {
  return renderToStaticMarkup(createElement(ActionGlyph, { cost }));
}

describe("ActionGlyph — the real pathfinder-icons.ttf font, one PUA character per cost", () => {
  const costs: readonly ActionCost[] = ["1", "2", "3", "reaction", "free"];

  it.each(costs)("cost=%s: role/aria-label/title accessibility contract", (cost) => {
    const html = renderGlyph(cost);
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${LABELS[cost]}"`);
    expect(html).toContain(`title="${LABELS[cost]}"`);
  });

  it.each(costs)("cost=%s: never emits an <svg> — a plain <span> with the font class", (cost) => {
    const html = renderGlyph(cost);
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<use");
    expect(html).toContain('class="codex-action-glyph"');
  });

  it.each(costs)("cost=%s: renders exactly the font's own PUA character for that cost", (cost) => {
    const html = renderGlyph(cost);
    expect(html).toContain(CHARS[cost]);
  });

  it("every cost maps to a DISTINCT character (no accidental collisions)", () => {
    const rendered = new Set(costs.map((c) => CHARS[c]));
    expect(rendered.size).toBe(costs.length);
  });
});

describe("normalizeActionCost: the short corpus tokens", () => {
  it.each([
    ["1", "1"],
    ["2", "2"],
    ["3", "3"],
    ["reaction", "reaction"],
    ["free", "free"],
    ["R", "reaction"],
    [" f ", "free"],
  ] as const)("%s -> %s", (raw, cost) => {
    expect(normalizeActionCost(raw)).toBe(cost);
  });

  it("passive and time strings are not action costs", () => {
    expect(normalizeActionCost("passive")).toBeNull();
    expect(normalizeActionCost("1 minute")).toBeNull();
  });
});
