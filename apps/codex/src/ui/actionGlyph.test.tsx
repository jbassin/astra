import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionGlyph, type ActionCost } from "./actionGlyph";
import { GLYPH_IDS } from "./GlyphDefs";

/**
 * R5 (D29-65) — the adversarially-corrected gate basis: the fixture corpus
 * carries zero free-action entities (verified — no `actionGlyph.cost`/
 * `facets.actionCost` token in `fixtures/entities/**` normalizes to
 * `ActionCost` `"free"`), so "all 5 costs on real fixture entities" is
 * unsatisfiable. This is a component-level unit test over synthetic
 * `ActionCost` values instead — it needs no fixture entity.
 *
 * P8-follow-up dedupe: `ActionGlyph` no longer carries its own path data —
 * every instance emits `<use href="#codex-glyph-...">` against the shared
 * `<symbol>` defs in `GlyphDefs.tsx`. The traced path-data regression pin
 * (a silent revert to a placeholder shape) now lives in `GlyphDefs.test.tsx`
 * instead, against the ONE place that data lives; this file pins the
 * per-instance CONTRACT — accessibility, and exactly which symbol +
 * how many `<use>`s a given cost renders, with no inline `<path>` at all.
 */
const LABELS: Record<ActionCost, string> = {
  "1": "one action",
  "2": "two actions",
  "3": "three actions",
  reaction: "reaction",
  free: "free action",
};

function renderGlyph(cost: ActionCost): string {
  return renderToStaticMarkup(createElement(ActionGlyph, { cost }));
}

describe("ActionGlyph — R5 real-traced glyph shapes (D29-65), P8-dedupe use/symbol contract", () => {
  const costs: readonly ActionCost[] = ["1", "2", "3", "reaction", "free"];

  it.each(costs)("cost=%s: role/aria-label/title accessibility contract unchanged", (cost) => {
    const html = renderGlyph(cost);
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${LABELS[cost]}"`);
    expect(html).toContain(`<title>${LABELS[cost]}</title>`);
  });

  it.each(costs)(
    "cost=%s: never re-emits inline path data — only <use> against the shared defs",
    (cost) => {
      const html = renderGlyph(cost);
      expect(html).not.toContain("<path");
    },
  );

  it("cost=1: renders exactly one <use> against the shared pip symbol", () => {
    const html = renderGlyph("1");
    const pipCount = html.split(`href="#${GLYPH_IDS.pip}"`).length - 1;
    expect(pipCount).toBe(1);
    expect(html).toContain('x="0"');
  });

  it("cost=2: renders exactly two <use>s against the same reused pip symbol", () => {
    const html = renderGlyph("2");
    const pipCount = html.split(`href="#${GLYPH_IDS.pip}"`).length - 1;
    expect(pipCount).toBe(2);
    // offsets via the <use> element's own `x` attribute (SVG2 equivalent of
    // the old `transform="translate(9,0)"` — D29-65's "single reused Pip"
    // contract, now against the shared symbol instead of a local <path>).
    expect(html).toContain('x="0"');
    expect(html).toContain('x="9"');
  });

  it("cost=3: renders exactly three <use>s against the same reused pip symbol", () => {
    const html = renderGlyph("3");
    const pipCount = html.split(`href="#${GLYPH_IDS.pip}"`).length - 1;
    expect(pipCount).toBe(3);
    expect(html).toContain('x="0"');
    expect(html).toContain('x="9"');
    expect(html).toContain('x="18"');
  });

  it("reaction: renders exactly one <use> against the shared reaction symbol", () => {
    const html = renderGlyph("reaction");
    expect(html).toContain(`href="#${GLYPH_IDS.reaction}"`);
    expect((html.match(/<use/g) ?? []).length).toBe(1);
  });

  it("free: renders exactly one <use> against the shared free symbol", () => {
    const html = renderGlyph("free");
    expect(html).toContain(`href="#${GLYPH_IDS.free}"`);
    expect((html.match(/<use/g) ?? []).length).toBe(1);
  });
});
