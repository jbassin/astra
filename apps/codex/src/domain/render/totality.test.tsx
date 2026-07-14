import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EntityPage } from "./entityPage";
import { loadFixtureRenderEnv } from "./fixtureLoader";
import { RENDER_ERROR_ATTR, renderNodes } from "./nodes";

/**
 * D29-29 tier 1 — totality: render EVERY fixture entity (all 88 categories)
 * via `renderToStaticMarkup`. Zero `data-render-error` anywhere; every
 * non-empty `body` yields non-empty HTML; every entity name appears. This is
 * the "the renderer is total over the real corpus's node-kind census" gate
 * (spec §6 risk) exercised against the committed fixture — the same corpus
 * P2's real-corpus S2/S3 gates run against, just smaller.
 */

/** React's SSR text-escaping (apostrophes -> `&#x27;`, etc.) — entity names
 * containing one (e.g. "Seer's Array") won't appear byte-for-byte in the
 * rendered HTML otherwise. Mirrors exactly what `renderToStaticMarkup`
 * does to text content. */
function reactEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

describe("D29-29 tier 1: totality over the full fixture matrix (88 categories)", () => {
  const { entities, ctx } = loadFixtureRenderEnv();

  it("loaded every category (sanity check on the fixture itself)", () => {
    const categories = new Set(entities.map((e) => e.category));
    expect(categories.size).toBe(88);
  });

  it.each(entities.map((e) => [e.id, e] as const))(
    "%s renders with zero data-render-error and its own name present",
    (_id, entity) => {
      let html = "";
      expect(() => {
        html = renderToStaticMarkup(<EntityPage entity={entity} ctx={ctx} />);
      }).not.toThrow();
      expect(html).not.toContain(RENDER_ERROR_ATTR);
      expect(html).toContain(reactEscape(entity.name));
    },
  );

  it.each(entities.map((e) => [e.id, e] as const))(
    "%s: a non-empty body yields non-empty rendered HTML",
    (_id, entity) => {
      if (entity.body.length === 0) return;
      const bodyHtml = renderToStaticMarkup(<>{renderNodes(entity.body, ctx)}</>);
      expect(bodyHtml.length).toBeGreaterThan(0);
    },
  );

  it("zero data-render-error across the WHOLE fixture (belt-and-suspenders single assertion)", () => {
    for (const entity of entities) {
      const html = renderToStaticMarkup(<EntityPage entity={entity} ctx={ctx} />);
      expect(html, `entity ${entity.id} rendered a data-render-error chip`).not.toContain(
        RENDER_ERROR_ATTR,
      );
    }
  });
});
