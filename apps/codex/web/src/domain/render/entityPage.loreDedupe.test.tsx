import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import { EntityPage } from "./entityPage";
import { loadFixtureRenderEnv, requireEntity } from "./fixtureLoader";

/**
 * P14 S2 (D29-135) — the Lore-card suppression pass against the REAL
 * `ancestry/anadi` fixture (the review's own "canary set", corrected: no
 * test may assert "You Might…"/"Others Probably…" present IN THE LORE CARD
 * — both are byte-identical in the body too, so they correctly suppress
 * from lore; the body copy is what stays visible). Mirrors
 * `entityPage.dedup.test.tsx`'s `loadFixtureRenderEnv`/`requireEntity`
 * idiom (P7's own precedent for a real-fixture predicate proof).
 */

const LORE_CARD_RE = /<section class="codex-card codex-card-prose codex-lore">[\s\S]*?<\/section>/;

function loreCardHtml(html: string): string | undefined {
  return LORE_CARD_RE.exec(html)?.[0];
}

describe("entityPage.tsx + loreDedupe: ancestry/anadi (P14 S2, D29-135)", () => {
  const { byId, ctx } = loadFixtureRenderEnv();

  function render(entity: CodexEntity): string {
    return renderToStaticMarkup(<EntityPage entity={entity} ctx={ctx} />);
  }

  it("anadi's loreBody preamble (present, duplicating the body's own opening prose) does not survive into the Lore card", () => {
    const anadi = requireEntity(byId, "ancestry/anadi");
    expect(anadi.loreBody).toBeDefined();
    const html = render(anadi);
    const lore = loreCardHtml(html);
    // The preamble's own distinctive opening clause — present in the BODY
    // copy (asserted below) but must not leak into whatever lore content
    // survives.
    const preambleClause = "reclusive, sapient spiders who hail from the jungles";
    expect(html).toContain(preambleClause); // the body copy IS visible
    expect(lore === undefined || !lore.includes(preambleClause)).toBe(true);
  });

  it('"You Might…"/"Others Probably…" render from the BODY, never inside the Lore card (the review-corrected canary — NOT "146 unique callouts")', () => {
    const anadi = requireEntity(byId, "ancestry/anadi");
    const html = render(anadi);
    // Present somewhere on the page (the body copy) …
    expect(html).toContain("You Might");
    expect(html).toContain("Others Probably");
    // … but absent from whatever the Lore card renders.
    const lore = loreCardHtml(html);
    expect(lore === undefined || !lore.includes("You Might")).toBe(true);
    expect(lore === undefined || !lore.includes("Others Probably")).toBe(true);
  });

  it('the genuinely unique "Anadi Heritages" section SURVIVES into the Lore card (the heritage-pattern canary, 52 corpus-wide)', () => {
    const anadi = requireEntity(byId, "ancestry/anadi");
    const html = render(anadi);
    const lore = loreCardHtml(html);
    expect(lore).toBeDefined();
    expect(lore).toContain("Anadi Heritages");
  });

  it("the Lore card, when it survives, carries strictly less content than the raw loreBody would have (real suppression happened, not a no-op)", () => {
    const anadi = requireEntity(byId, "ancestry/anadi");
    const html = render(anadi);
    const lore = loreCardHtml(html);
    expect(lore).toBeDefined();
    // The body-duplicated "Physical Description"/"Society"/"Alignment and
    // Religion" sections must not survive either — only the Heritages tail
    // (and any other genuinely unique section) does.
    expect(lore).not.toContain("Physical Description");
    expect(lore).not.toContain("Society");
  });
});
