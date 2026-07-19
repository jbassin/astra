import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import type { Facets } from "../../schema/entity";
import { EntityPage } from "./entityPage";
import { loadFixtureRenderEnv, requireEntity } from "./fixtureLoader";
import { noEmbeds, rootRenderCtx } from "./nodes";

/**
 * P10 (D29-95) — the header size chip: `facets.size` present AND category in
 * `{creature, vehicle}` renders a human `SIZE_LABELS` chip immediately before
 * `.codex-rarity`; every other category (or an absent facet) renders no
 * element at all, ever — never an empty `<span>`.
 */

const CTX = rootRenderCtx({ resolveEmbed: noEmbeds(), knownTraitIds: new Set() });

function makeEntity(category: string, facets: Facets): CodexEntity {
  return {
    id: `${category}/test-entity`,
    slug: "test-entity",
    category,
    name: "Test Entity",
    edition: "remaster",
    source: { book: "Test Book", license: "ORC" },
    traits: [],
    body: [],
    facets,
  };
}

function html(entity: CodexEntity): string {
  return renderToStaticMarkup(<EntityPage entity={entity} ctx={CTX} />);
}

describe("entityPage.tsx: header size chip (P10, D29-95)", () => {
  it("creature with facets.size renders the human SIZE_LABELS chip", () => {
    const out = html(makeEntity("creature", { size: "lg" }));
    expect(out).toContain('<span class="codex-entity-size">Large</span>');
  });

  it("vehicle with facets.size renders the human SIZE_LABELS chip", () => {
    const out = html(makeEntity("vehicle", { size: "huge" }));
    expect(out).toContain('<span class="codex-entity-size">Huge</span>');
  });

  it("the size chip sits immediately BEFORE the rarity span", () => {
    const entity = { ...makeEntity("creature", { size: "lg" }), rarity: "rare" };
    const out = html(entity);
    const sizeIdx = out.indexOf('class="codex-entity-size"');
    const rarityIdx = out.indexOf('class="codex-rarity"');
    expect(sizeIdx).toBeGreaterThan(-1);
    expect(rarityIdx).toBeGreaterThan(sizeIdx);
  });

  it("hazard is EXCLUDED (D29-95 review-driven exclusion) — no size element even with facets.size present", () => {
    const out = html(makeEntity("hazard", { size: "med" }));
    expect(out).not.toContain("codex-entity-size");
  });

  it("ancestry is EXCLUDED (D29-95 review-driven exclusion) — no size element even with facets.size present", () => {
    const out = html(makeEntity("ancestry", { size: "med" }));
    expect(out).not.toContain("codex-entity-size");
  });

  it("spell (not a size-bearing category at all) renders no size element", () => {
    const out = html(makeEntity("spell", {}));
    expect(out).not.toContain("codex-entity-size");
  });

  it("creature with NO facets.size renders no size element (absent facet, never an empty span)", () => {
    const out = html(makeEntity("creature", {}));
    expect(out).not.toContain("codex-entity-size");
  });
});

describe("entityPage.tsx: GenericFacetLine humanization on the real anadi fixture (P14 S2, D29-138)", () => {
  it("ancestry/anadi renders 'Size: Medium', never the raw facets.size code ('med')", () => {
    // Review note (spec): no committed golden covers ANY GenericFacetLine
    // category — this is the one explicit render-level proof for D29-138,
    // against the REAL anadi fixture (facets.size: "med", per the fixture
    // file itself), not a synthetic entity. The label renders in its own
    // `<strong>` (the D29-50 bold-label grammar), so the raw HTML has a tag
    // boundary between "Size:" and "Medium" — strip tags first, same idiom
    // `facetHeader.test.tsx`'s own `text()` helper uses.
    const { byId, ctx } = loadFixtureRenderEnv();
    const anadi = requireEntity(byId, "ancestry/anadi");
    expect(anadi.facets.size).toBe("med"); // the predicate's own input, pinned
    const rendered = renderToStaticMarkup(<EntityPage entity={anadi} ctx={ctx} />);
    const plainText = rendered.replace(/<[^>]+>/g, "");
    expect(plainText).toContain("Size: Medium");
    expect(plainText).not.toContain("Size: med");
  });
});

describe("entityPage.tsx: trait cross-nav (D29-109c, P11 S5, #16)", () => {
  it("a trait page renders the 'Find everything with this trait' link to /search?traits=<slug>", () => {
    const entity = { ...makeEntity("trait", {}), slug: "fire" };
    const out = html(entity);
    expect(out).toContain('href="/search?traits=fire"');
    expect(out).toContain("Find everything with this trait");
  });

  it("every OTHER category renders no trait cross-nav at all", () => {
    const out = html(makeEntity("spell", {}));
    expect(out).not.toContain("codex-trait-cross-nav");
  });
});
