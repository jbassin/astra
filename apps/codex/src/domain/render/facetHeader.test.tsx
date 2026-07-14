import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity, Facets } from "../../schema/entity";
import {
  EquipmentFacetHeader,
  FeatFacetHeader,
  GenericFacetLine,
  SpellFacetHeader,
} from "./facetHeader";

function entityWith(
  category: string,
  facets: Facets,
  overrides: Partial<CodexEntity> = {},
): CodexEntity {
  return {
    id: `${category}/x`,
    slug: "x",
    category,
    name: "X",
    edition: "remaster",
    source: { book: "Test", license: "ORC" },
    traits: [],
    body: [],
    facets,
    ...overrides,
  };
}

describe("SpellFacetHeader", () => {
  it("renders every populated named field, joined", () => {
    const entity = entityWith("spell", {
      rank: 1,
      traditions: ["divine", "primal"],
      castTime: "2",
      range: "touch",
      duration: "instantaneous",
      defense: "basic Fortitude",
    });
    const out = renderToStaticMarkup(<SpellFacetHeader entity={entity} />);
    expect(out).toContain("Rank 1");
    expect(out).toContain("divine, primal");
    expect(out).toContain("Cast 2");
    expect(out).toContain("Range touch");
    expect(out).toContain("Duration instantaneous");
    expect(out).toContain("Defense basic Fortitude");
  });

  it("rank 0 renders as Cantrip, not 'Rank 0'", () => {
    const out = renderToStaticMarkup(
      <SpellFacetHeader entity={entityWith("spell", { rank: 0 })} />,
    );
    expect(out).toContain("Cantrip");
    expect(out).not.toContain("Rank 0");
  });

  it("no populated fields -> null (omitted)", () => {
    expect(renderToStaticMarkup(<SpellFacetHeader entity={entityWith("spell", {})} />)).toBe("");
  });
});

describe("EquipmentFacetHeader", () => {
  it("renders price/bulk/hands/usage/itemCategory; ignores featLevel/rank spillover", () => {
    // Exactly the real weapon/chakri-lost-omens facet shape (spillover included).
    const entity = entityWith("weapon", {
      bulk: 0,
      featLevel: 0,
      itemCategory: "advanced",
      price: "2 cp",
      rank: 0,
      usage: "held-in-one-hand",
    });
    const out = renderToStaticMarkup(<EquipmentFacetHeader entity={entity} />);
    expect(out).toContain("Price 2 cp");
    expect(out).toContain("Bulk 0");
    expect(out).toContain("held in one hand");
    expect(out).toContain("Advanced");
    expect(out).not.toContain("Feat");
    expect(out).not.toContain("Rank");
  });

  it("hands absent -> no Hands row", () => {
    const out = renderToStaticMarkup(
      <EquipmentFacetHeader entity={entityWith("weapon", { price: "1 gp" })} />,
    );
    expect(out).not.toContain("Hands");
  });
});

describe("FeatFacetHeader", () => {
  it("renders level, prerequisites, and an actionCost glyph", () => {
    const entity = entityWith("feat", {
      actionCost: "passive",
      featLevel: 13,
      itemCategory: "ancestry",
      prerequisites: ["mottle-coat centaur heritage"],
      rank: 13,
    });
    const out = renderToStaticMarkup(<FeatFacetHeader entity={entity} />);
    expect(out).toContain("Feat 13");
    expect(out).toContain("mottle-coat centaur heritage");
    // "passive" isn't a real ActionCost -> falls back to plain visible text,
    // not a glyph <svg> (actionGlyph.tsx's own "unknown" fallback path).
    expect(out).toContain("passive");
  });

  it("no facets at all -> null (the ~30% empty-facets legacy/AoN-only case, M11)", () => {
    expect(renderToStaticMarkup(<FeatFacetHeader entity={entityWith("feat", {})} />)).toBe("");
  });
});

describe("GenericFacetLine (the ~80 other categories)", () => {
  it("renders whatever populated scalar facets exist, excluding featLevel/rank spillover", () => {
    // The real vehicle/sky-chariot-light shape: creature-named fields
    // populated on a non-creature category are genuine data, NOT spillover.
    const entity = entityWith("vehicle", { ac: 20, fortitudeSave: 14, hp: 80, size: "lg" });
    const out = renderToStaticMarkup(<GenericFacetLine entity={entity} />);
    expect(out).toContain("AC: 20");
    expect(out).toContain("HP: 80");
    expect(out).toContain("Size: lg");
  });

  it("excludes featLevel/rank even when present as spillover on a non-feat/non-spell category", () => {
    const entity = entityWith("vehicle", { ac: 20, featLevel: 0, rank: 0 });
    const out = renderToStaticMarkup(<GenericFacetLine entity={entity} />);
    expect(out).toContain("AC: 20");
    expect(out).not.toMatch(/Feat/);
    expect(out).not.toMatch(/Rank/);
  });

  it("a catchall (arbitrary AoN-only) field renders humanized", () => {
    const entity = entityWith("ancestry", { sizeId: 2 } as unknown as Facets);
    const out = renderToStaticMarkup(<GenericFacetLine entity={entity} />);
    expect(out).toContain("Size Id: 2");
  });

  it("no populated facets -> null", () => {
    expect(renderToStaticMarkup(<GenericFacetLine entity={entityWith("rules", {})} />)).toBe("");
  });
});
