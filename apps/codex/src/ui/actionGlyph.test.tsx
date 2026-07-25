import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionGlyph, type ActionCost } from "./actionGlyph";

/**
 * Stakeholder directive ("use the icons in pathfinder-icons.ttf for the
 * action icons") — `ActionGlyph` now renders the real Paizo action-icon
 * font as a plain character inside a `<span>`, not the R5 traced-SVG
 * `<use>` composition this file used to pin (`ACTIONS-GLYPH-SOURCE.md` has
 * the full provenance/switch record). This file pins the per-instance
 * CONTRACT — accessibility (role/aria-label/title) and exactly which
 * Private-Use-Area character each cost renders, no SVG at all.
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
