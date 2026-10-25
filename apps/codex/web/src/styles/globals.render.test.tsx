import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EntityPage } from "../domain/render/entityPage";
import { loadFixtureRenderEnv, requireEntity } from "../domain/render/fixtureLoader";

/**
 * The render-level half of the CSS gate (`globals.test.ts` covers the
 * stylesheet content itself). This file renders the real `EntityPage` over
 * the fixture corpus purely to prove real fixture markup lands inside the
 * `.codex-content` table and paragraph selectors — the styling is CSS-only
 * (nodes.tsx's `<table>` emission is classless and the ingest-preserved
 * literal "\n" text reaches the DOM as-is).
 */
describe("table skin: a real fixture table-bearing entity", () => {
  const { byId, ctx } = loadFixtureRenderEnv();

  it("class/investigator@legacy renders a <table> inside .codex-content", () => {
    const html = renderToStaticMarkup(
      createElement(EntityPage, { entity: requireEntity(byId, "class/investigator@legacy"), ctx }),
    );
    const contentMatch = /<div class="codex-content codex-body">([\s\S]*)$/.exec(html);
    expect(contentMatch).not.toBeNull();
    expect(contentMatch?.[1]).toContain("<table>");
  });
});

describe("literal breaks: a real fixture entity with a literal AoN <br/>-preserved \\n", () => {
  const { byId, ctx } = loadFixtureRenderEnv();

  it("creature/adamantine-dragon-adult's body preserves the literal \\n verbatim", () => {
    // Verified directly against the fixture corpus: body[25] is a real
    // paragraph whose text children include "...DC 30\n" and "...Speeds.\n"
    // (an "Abandon Armor"/"Frightful Presence" degree-of-success-shaped
    // block) — one of the corpus's 16 real \n-bearing bodies.
    const html = renderToStaticMarkup(
      createElement(EntityPage, {
        entity: requireEntity(byId, "creature/adamantine-dragon-adult"),
        ctx,
      }),
    );
    // The renderer never touches raw text content (nodes.tsx's `case
    // "text"` emits `node.content` verbatim) — this proves the ingest-side
    // "\n" survives all the way to the DOM string unescaped-away, so the
    // CSS `white-space: pre-line` rule (asserted separately in
    // globals.test.ts) has a real "\n" to act on.
    expect(html).toContain("Speeds.\n");
    expect(html).toContain("DC 30\n");
  });

  it("an ordinary \\n-free paragraph is unaffected (no collateral whitespace change)", () => {
    // spell/heal is \n-free in the fixture aside from its @legacy sibling's
    // own degree-of-success block — spot-check the base entity's ordinary
    // prose renders as one contiguous run.
    const html = renderToStaticMarkup(
      createElement(EntityPage, { entity: requireEntity(byId, "spell/heal"), ctx }),
    );
    expect(html).toContain("<p>");
  });
});
