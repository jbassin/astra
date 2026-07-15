import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionGlyph, type ActionCost } from "./actionGlyph";

/**
 * R5 (D29-65) — the adversarially-corrected gate basis: the fixture corpus
 * carries zero free-action entities (verified — no `actionGlyph.cost`/
 * `facets.actionCost` token in `fixtures/entities/**` normalizes to
 * `ActionCost` `"free"`), so "all 5 costs on real fixture entities" is
 * unsatisfiable. This is a component-level unit test over synthetic
 * `ActionCost` values instead — it needs no fixture entity, and asserts the
 * REAL traced pf2e glyph shapes render (not the D29-46 placeholder
 * approximations), per `./ACTIONS-GLYPH-SOURCE.md`'s recorded provenance.
 *
 * The 3 expected `d` strings below are duplicated (not imported) from
 * `actionGlyph.tsx`'s internal constants deliberately — the component's
 * public contract stays exactly `{ ActionGlyph, normalizeActionCost,
 * ActionCost }` (unchanged by R5, a pure asset swap), so this test reaches
 * the shapes only through the same public `cost` prop every real call site
 * uses, while still pinning the literal traced path data as a regression
 * gate (a silent revert to a placeholder shape fails this test).
 */
const TRACED_PIP_D =
  "M3.72 3ZM3.72 3 7.5 7.99 3.72 13 1.9 10.56 3.86 8.01 1.9 5.44ZM1.32 6.23 2.67 7.99 1.32 9.78 0 7.99Z";
const TRACED_REACTION_D =
  "M8.85 8.78 8.29 11.62Q8.56 11.52 8.85 11.35Q9.51 11.02 9.98 10.55Q10.51 10.03 10.8 9.36Q10.99 9 11.09 8.61Q11.15 8.29 11.15 7.93Q11.15 7.87 11.15 7.81Q11.15 7.76 11.15 7.7Q11.09 6.97 10.75 6.24Q10.3 5.31 9.4 4.73Q8.71 4.27 7.84 4Q7.29 3.86 6.7 3.79Q6.61 3.79 6.5 3.78Q6.39 3.77 6.31 3.79Q5.78 3.79 5.22 3.89Q4.46 4.08 3.77 4.38Q3.14 4.69 2.69 5.14Q2.5 5.28 2.32 5.49Q2.16 5.68 2 5.85Q2.29 5.04 2.79 4.38Q3.14 3.86 3.61 3.46Q4.27 2.93 5.04 2.59Q5.73 2.28 6.57 2.12Q7.26 2.02 7.89 2Q7.95 2 8.01 2Q8.08 2 8.16 2Q8.71 2 9.35 2.12Q9.98 2.23 10.54 2.48Q11.04 2.71 11.57 3.04Q12.12 3.4 12.55 3.83Q13 4.3 13.31 4.84Q13.58 5.26 13.74 5.69Q14 6.42 14 7.11Q14 7.62 13.84 8.14Q13.68 8.66 13.44 9.22Q13.15 9.79 12.73 10.2Q12.41 10.57 11.81 11.02Q11.3 11.38 10.88 11.62Q10.14 11.98 9.19 12.15Q8.82 12.21 8.45 12.21L9.48 14L3.82 12.53Z";
const TRACED_FREE_D =
  "M8.05 2 14 7.94 7.96 14 2 8.06ZM5.47 6.54 4.17 7.81 5.47 9.07 6.72 7.82ZM8.05 3.65 6.6 5.12 9.45 7.99 6.53 10.94 7.83 12.24 12.27 7.85Z";

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

describe("ActionGlyph — R5 real-traced glyph shapes (D29-65)", () => {
  const costs: readonly ActionCost[] = ["1", "2", "3", "reaction", "free"];

  it.each(costs)("cost=%s: role/aria-label/title accessibility contract unchanged", (cost) => {
    const html = renderGlyph(cost);
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${LABELS[cost]}"`);
    expect(html).toContain(`<title>${LABELS[cost]}</title>`);
  });

  it("cost=1: renders exactly one traced pip chevron", () => {
    const html = renderGlyph("1");
    const pipCount = html.split(`d="${TRACED_PIP_D}"`).length - 1;
    expect(pipCount).toBe(1);
  });

  it("cost=2: renders exactly two traced pip chevrons (the same reused shape)", () => {
    const html = renderGlyph("2");
    const pipCount = html.split(`d="${TRACED_PIP_D}"`).length - 1;
    expect(pipCount).toBe(2);
    // the second pip is offset via `transform="translate(9,0)"`, not a
    // second distinct path shape (D29-65's "single reused Pip" contract).
    expect(html).toContain('transform="translate(9,0)"');
  });

  it("cost=3: renders exactly three traced pip chevrons", () => {
    const html = renderGlyph("3");
    const pipCount = html.split(`d="${TRACED_PIP_D}"`).length - 1;
    expect(pipCount).toBe(3);
    expect(html).toContain('transform="translate(9,0)"');
    expect(html).toContain('transform="translate(18,0)"');
  });

  it("reaction: renders the real traced hook glyph, not the old placeholder arc", () => {
    const html = renderGlyph("reaction");
    expect(html).toContain(`d="${TRACED_REACTION_D}"`);
    // the D29-46 placeholder was a single SVG elliptical-arc command ("a5 5
    // 0 1 1 5 5"); the real traced glyph is built entirely of line/quadratic
    // segments (M/L/Q/Z) with no arc command at all — a structural signal
    // that survives even if path coordinates were ever re-derived.
    expect(html).not.toMatch(/[Aa]\d+ \d+ \d+ \d+ \d+/);
    expect((html.match(/<path/g) ?? []).length).toBe(1);
  });

  it("free: renders the real traced filled diamond glyph, not the old stroked outline", () => {
    const html = renderGlyph("free");
    expect(html).toContain(`d="${TRACED_FREE_D}"`);
    // the D29-46 placeholder was an UNFILLED stroked outline
    // (`fill="none" stroke="currentColor"`); the real traced glyph fills
    // via the font's own nonzero-winding contours instead.
    expect(html).not.toContain('fill="none"');
    expect(html).not.toContain("stroke=");
    expect((html.match(/<path/g) ?? []).length).toBe(1);
  });
});
