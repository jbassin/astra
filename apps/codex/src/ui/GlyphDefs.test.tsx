import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GLYPH_IDS, GlyphDefs } from "./GlyphDefs";

/**
 * P8-follow-up SVG `<symbol>`/`<use>` dedupe — `GlyphDefs` is the ONE place
 * the 5 traced glyph shapes' path data now lives (`actionGlyph.tsx`'s pip
 * chevron/reaction hook/free-action diamond + `EditionIcon.tsx`'s
 * Four-Point Spark/History Ring). This test both proves the structural
 * dedupe contract (exactly 5 symbols, each id present exactly once, hidden
 * from layout/AT) and relocates the exact traced-path regression pin that
 * used to live in `actionGlyph.test.tsx`/`EditionIcon.test.tsx` (a silent
 * revert to a placeholder shape fails this test) — the 5 `d=` strings below
 * are duplicated, not imported, deliberately: this test reaches them only
 * through the same public `GlyphDefs` render every real page uses.
 */
const TRACED_PIP_D =
  "M3.72 3ZM3.72 3 7.5 7.99 3.72 13 1.9 10.56 3.86 8.01 1.9 5.44ZM1.32 6.23 2.67 7.99 1.32 9.78 0 7.99Z";
const TRACED_REACTION_D =
  "M8.85 8.78 8.29 11.62Q8.56 11.52 8.85 11.35Q9.51 11.02 9.98 10.55Q10.51 10.03 10.8 9.36Q10.99 9 11.09 8.61Q11.15 8.29 11.15 7.93Q11.15 7.87 11.15 7.81Q11.15 7.76 11.15 7.7Q11.09 6.97 10.75 6.24Q10.3 5.31 9.4 4.73Q8.71 4.27 7.84 4Q7.29 3.86 6.7 3.79Q6.61 3.79 6.5 3.78Q6.39 3.77 6.31 3.79Q5.78 3.79 5.22 3.89Q4.46 4.08 3.77 4.38Q3.14 4.69 2.69 5.14Q2.5 5.28 2.32 5.49Q2.16 5.68 2 5.85Q2.29 5.04 2.79 4.38Q3.14 3.86 3.61 3.46Q4.27 2.93 5.04 2.59Q5.73 2.28 6.57 2.12Q7.26 2.02 7.89 2Q7.95 2 8.01 2Q8.08 2 8.16 2Q8.71 2 9.35 2.12Q9.98 2.23 10.54 2.48Q11.04 2.71 11.57 3.04Q12.12 3.4 12.55 3.83Q13 4.3 13.31 4.84Q13.58 5.26 13.74 5.69Q14 6.42 14 7.11Q14 7.62 13.84 8.14Q13.68 8.66 13.44 9.22Q13.15 9.79 12.73 10.2Q12.41 10.57 11.81 11.02Q11.3 11.38 10.88 11.62Q10.14 11.98 9.19 12.15Q8.82 12.21 8.45 12.21L9.48 14L3.82 12.53Z";
const TRACED_FREE_D =
  "M8.05 2 14 7.94 7.96 14 2 8.06ZM5.47 6.54 4.17 7.81 5.47 9.07 6.72 7.82ZM8.05 3.65 6.6 5.12 9.45 7.99 6.53 10.94 7.83 12.24 12.27 7.85Z";
const TRACED_SPARK_D = "M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z";
const TRACED_RING_ARC_D = "M 61 20 A 32 32 0 1 1 39 20";
const TRACED_RING_ARROWHEAD_D = "M 39 20 L 50 9 L 55 22 Z";

function render(): string {
  return renderToStaticMarkup(createElement(GlyphDefs));
}

describe("GlyphDefs — the shared <symbol> defs (P8-follow-up dedupe)", () => {
  it("renders exactly 5 <symbol> elements, one per glyph id, each present exactly once", () => {
    const html = render();
    expect((html.match(/<symbol/g) ?? []).length).toBe(5);
    for (const id of Object.values(GLYPH_IDS)) {
      const count = html.split(`id="${id}"`).length - 1;
      expect(count, `symbol id="${id}" should appear exactly once`).toBe(1);
    }
  });

  it("the host <svg> is hidden from layout and assistive tech (never painted directly)", () => {
    const html = render();
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("display:none");
  });

  it("pins the traced pip-chevron path data (D29-65) inside the pip symbol", () => {
    const html = render();
    expect(html).toContain(`d="${TRACED_PIP_D}"`);
    const symbolIdx = html.indexOf(`id="${GLYPH_IDS.pip}"`);
    const nextSymbolIdx = html.indexOf("<symbol", symbolIdx + 1);
    const scoped = html.slice(symbolIdx, nextSymbolIdx === -1 ? undefined : nextSymbolIdx);
    expect(scoped).toContain(`d="${TRACED_PIP_D}"`);
    expect((scoped.match(/<path/g) ?? []).length).toBe(1);
  });

  it("pins the traced reaction-hook path data (D29-65) — no arc command, single path", () => {
    const html = render();
    expect(html).toContain(`d="${TRACED_REACTION_D}"`);
    // the D29-46 placeholder was a single SVG elliptical-arc command; the
    // real traced glyph is built entirely of line/quadratic segments.
    expect(TRACED_REACTION_D).not.toMatch(/[Aa]\d+ \d+ \d+ \d+ \d+/);
  });

  it("pins the traced free-action diamond path data (D29-65) — filled, no stroke", () => {
    const html = render();
    expect(html).toContain(`d="${TRACED_FREE_D}"`);
    const symbolIdx = html.indexOf(`id="${GLYPH_IDS.free}"`);
    const nextSymbolIdx = html.indexOf("<symbol", symbolIdx + 1);
    const scoped = html.slice(symbolIdx, nextSymbolIdx === -1 ? undefined : nextSymbolIdx);
    expect(scoped).not.toContain('fill="none"');
    expect(scoped).not.toContain("stroke=");
  });

  it("pins the Four-Point Spark (remaster) path data, filled, single path", () => {
    const html = render();
    expect(html).toContain(`d="${TRACED_SPARK_D}"`);
    const symbolIdx = html.indexOf(`id="${GLYPH_IDS.remaster}"`);
    const nextSymbolIdx = html.indexOf("<symbol", symbolIdx + 1);
    const scoped = html.slice(symbolIdx, nextSymbolIdx === -1 ? undefined : nextSymbolIdx);
    expect((scoped.match(/<path/g) ?? []).length).toBe(1);
    expect(scoped).toContain('fill="currentColor"');
  });

  it("pins the History Ring (legacy) path data — a stroked arc plus a separate filled arrowhead", () => {
    const html = render();
    expect(html).toContain(`d="${TRACED_RING_ARC_D}"`);
    expect(html).toContain(`d="${TRACED_RING_ARROWHEAD_D}"`);
    const symbolIdx = html.indexOf(`id="${GLYPH_IDS.legacy}"`);
    const nextSymbolIdx = html.indexOf("<symbol", symbolIdx + 1);
    const scoped = html.slice(symbolIdx, nextSymbolIdx === -1 ? undefined : nextSymbolIdx);
    expect((scoped.match(/<path/g) ?? []).length).toBe(2);
    expect(scoped).toContain("stroke=");
  });
});
