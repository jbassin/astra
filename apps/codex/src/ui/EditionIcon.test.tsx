import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditionIcon, type Edition } from "./EditionIcon";

/**
 * The stakeholder "History vs. Spark" icon pass — mirrors `actionGlyph
 * .test.tsx`'s style: renders both editions via the public `edition` prop
 * and pins the accessibility contract + the two distinct glyph shapes as a
 * regression gate (a silent revert to the old text pill fails this test).
 */
function renderIcon(edition: Edition): string {
  return renderToStaticMarkup(createElement(EditionIcon, { edition }));
}

describe("EditionIcon", () => {
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

  it("remaster renders the filled four-point spark path, nothing else", () => {
    const html = renderIcon("remaster");
    expect(html).toContain('d="M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z"');
    expect((html.match(/<path/g) ?? []).length).toBe(1);
  });

  it("legacy renders a stroked arc plus a separate filled arrowhead — distinct from remaster's single fill", () => {
    const html = renderIcon("legacy");
    expect((html.match(/<path/g) ?? []).length).toBe(2);
    expect(html).toContain("stroke=");
    expect(html).not.toContain(
      'd="M 50 10 Q 50 50 90 50 Q 50 50 50 90 Q 50 50 10 50 Q 50 50 50 10 Z"',
    );
  });

  it("both editions share the same square viewBox (identical bounding box)", () => {
    expect(renderIcon("remaster")).toContain('viewBox="0 0 100 100"');
    expect(renderIcon("legacy")).toContain('viewBox="0 0 100 100"');
  });
});
