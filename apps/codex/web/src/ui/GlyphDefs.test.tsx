import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GLYPH_IDS, GlyphDefs } from "./GlyphDefs";

/**
 * P8-follow-up SVG `<symbol>`/`<use>` dedupe — `GlyphDefs` is the ONE place
 * the traced glyph shapes' path data lives. Originally 5 shapes
 * (`actionGlyph.tsx`'s pip chevron/reaction hook/free-action diamond +
 * `EditionIcon.tsx`'s Four-Point Spark/History Ring); the 3 action-glyph
 * shapes are GONE now — a stakeholder directive switched `actionGlyph.tsx`
 * to the real Paizo icon font instead (`ACTIONS-GLYPH-SOURCE.md`), so only
 * `EditionIcon.tsx`'s 2 shapes remain here. This test proves the structural
 * dedupe contract (exactly 2 symbols, each id present exactly once, hidden
 * from layout/AT) and pins the traced-path regression pin for those 2 (a
 * silent revert to a placeholder shape fails this test) — the `d=` strings
 * below are duplicated, not imported, deliberately: this test reaches them
 * only through the same public `GlyphDefs` render every real page uses.
 */
const TRACED_SPARK_D = "M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z";
const TRACED_RING_ARC_D = "M 61 20 A 32 32 0 1 1 39 20";
const TRACED_RING_ARROWHEAD_D = "M 39 20 L 50 9 L 55 22 Z";

function render(): string {
  return renderToStaticMarkup(createElement(GlyphDefs));
}

describe("GlyphDefs — the shared <symbol> defs (P8-follow-up dedupe)", () => {
  it("renders exactly 2 <symbol> elements (EditionIcon only, post action-glyph-font switch), each present exactly once", () => {
    const html = render();
    expect((html.match(/<symbol/g) ?? []).length).toBe(2);
    for (const id of Object.values(GLYPH_IDS)) {
      const count = html.split(`id="${id}"`).length - 1;
      expect(count, `symbol id="${id}" should appear exactly once`).toBe(1);
    }
  });

  it("no longer carries the retired action-glyph symbol ids (pip/reaction/free)", () => {
    const html = render();
    expect(html).not.toContain('id="codex-glyph-pip"');
    expect(html).not.toContain('id="codex-glyph-reaction"');
    expect(html).not.toContain('id="codex-glyph-free"');
  });

  it("the host <svg> is hidden from layout and assistive tech (never painted directly)", () => {
    const html = render();
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("display:none");
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
