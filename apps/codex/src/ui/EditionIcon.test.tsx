import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditionIcon, type Edition } from "./EditionIcon";
import { GLYPH_IDS } from "./GlyphDefs";

/**
 * The stakeholder "History vs. Spark" icon pass — mirrors `actionGlyph
 * .test.tsx`'s style: renders both editions via the public `edition` prop
 * and pins the accessibility contract as a regression gate.
 *
 * P8-follow-up dedupe: `EditionIcon` no longer carries its own path data —
 * every instance emits `<use href="#codex-glyph-...">` against the shared
 * `<symbol>` defs in `GlyphDefs.tsx`. The traced path-data regression pin
 * now lives in `GlyphDefs.test.tsx`; this file pins the per-instance
 * contract — accessibility + exactly which shared symbol each edition
 * resolves to, with no inline `<path>` at all.
 */
function renderIcon(edition: Edition): string {
  return renderToStaticMarkup(createElement(EditionIcon, { edition }));
}

describe("EditionIcon — P8-dedupe use/symbol contract", () => {
  it.each<[Edition, string]>([
    ["remaster", "Remaster"],
    ["legacy", "Legacy"],
  ])("edition=%s: role/aria-label/title accessibility contract", (edition, label) => {
    const html = renderIcon(edition);
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain(`<title>${label}</title>`);
  });

  it("carries the shared + per-edition class hooks", () => {
    expect(renderIcon("remaster")).toContain('class="codex-edition-icon codex-edition-remaster"');
    expect(renderIcon("legacy")).toContain('class="codex-edition-icon codex-edition-legacy"');
  });

  it("remaster renders exactly one <use> against the shared spark symbol, no inline path", () => {
    const html = renderIcon("remaster");
    expect(html).toContain(`href="#${GLYPH_IDS.remaster}"`);
    expect((html.match(/<use/g) ?? []).length).toBe(1);
    expect(html).not.toContain("<path");
  });

  it("legacy renders exactly one <use> against the shared ring symbol, no inline path", () => {
    const html = renderIcon("legacy");
    expect(html).toContain(`href="#${GLYPH_IDS.legacy}"`);
    expect((html.match(/<use/g) ?? []).length).toBe(1);
    expect(html).not.toContain("<path");
    expect(html).not.toContain(`href="#${GLYPH_IDS.remaster}"`);
  });

  it("both editions share the same square viewBox (identical bounding box)", () => {
    expect(renderIcon("remaster")).toContain('viewBox="0 0 100 100"');
    expect(renderIcon("legacy")).toContain('viewBox="0 0 100 100"');
  });
});
