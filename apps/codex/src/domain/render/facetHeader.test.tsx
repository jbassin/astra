import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity, Facets, MastheadExtraEntry } from "../../schema/entity";
import {
  EquipmentFacetHeader,
  FeatFacetHeader,
  GenericFacetLine,
  MastheadExtraFallback,
  SpellFacetHeader,
} from "./facetHeader";
import { noEmbeds, rootRenderCtx } from "./nodes";

const ctx = rootRenderCtx({ resolveEmbed: noEmbeds(), knownTraitIds: new Set() });

/** P4.5 S5 (D29-50): the header lines now wrap each label in a `<strong>`
 * (the bold-label/regular-value grammar, style doc §3.8) — a raw-HTML
 * `toContain("Feat 13")` would fail on the tag boundary between the label
 * and its value even though the two remain adjacent text. Strip markup
 * before asserting so these tests check rendered TEXT content, tolerant of
 * the wrapping tags. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

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
    const out = text(renderToStaticMarkup(<SpellFacetHeader entity={entity} ctx={ctx} />));
    expect(out).toContain("Rank 1");
    expect(out).toContain("divine, primal");
    expect(out).toContain("Cast 2");
    expect(out).toContain("Range touch");
    expect(out).toContain("Duration instantaneous");
    expect(out).toContain("Defense basic Fortitude");
  });

  it("rank 0 renders as Cantrip, not 'Rank 0'", () => {
    const out = text(
      renderToStaticMarkup(
        <SpellFacetHeader entity={entityWith("spell", { rank: 0 })} ctx={ctx} />,
      ),
    );
    expect(out).toContain("Cantrip");
    expect(out).not.toContain("Rank 0");
  });

  it("no populated fields -> null (omitted)", () => {
    expect(
      renderToStaticMarkup(<SpellFacetHeader entity={entityWith("spell", {})} ctx={ctx} />),
    ).toBe("");
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
    const out = text(renderToStaticMarkup(<EquipmentFacetHeader entity={entity} ctx={ctx} />));
    expect(out).toContain("Price 2 cp");
    expect(out).toContain("Bulk 0");
    expect(out).toContain("held in one hand");
    expect(out).toContain("Advanced");
    expect(out).not.toContain("Feat");
    expect(out).not.toContain("Rank");
  });

  it("hands absent -> no Hands row", () => {
    const out = text(
      renderToStaticMarkup(
        <EquipmentFacetHeader entity={entityWith("weapon", { price: "1 gp" })} ctx={ctx} />,
      ),
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
    const out = text(renderToStaticMarkup(<FeatFacetHeader entity={entity} ctx={ctx} />));
    expect(out).toContain("Feat 13");
    expect(out).toContain("mottle-coat centaur heritage");
    // "passive" isn't a real ActionCost -> falls back to plain visible text,
    // not a glyph <svg> (actionGlyph.tsx's own "unknown" fallback path).
    expect(out).toContain("passive");
  });

  it("no facets at all -> null (the ~30% empty-facets legacy/AoN-only case, M11)", () => {
    expect(
      renderToStaticMarkup(<FeatFacetHeader entity={entityWith("feat", {})} ctx={ctx} />),
    ).toBe("");
  });
});

describe("GenericFacetLine (the ~80 other categories)", () => {
  it("renders whatever populated scalar facets exist, excluding featLevel/rank spillover", () => {
    // The real vehicle/sky-chariot-light shape: creature-named fields
    // populated on a non-creature category are genuine data, NOT spillover.
    const entity = entityWith("vehicle", { ac: 20, fortitudeSave: 14, hp: 80, size: "lg" });
    const out = text(renderToStaticMarkup(<GenericFacetLine entity={entity} ctx={ctx} />));
    expect(out).toContain("AC: 20");
    expect(out).toContain("HP: 80");
    expect(out).toContain("Size: lg");
  });

  it("excludes featLevel/rank even when present as spillover on a non-feat/non-spell category", () => {
    const entity = entityWith("vehicle", { ac: 20, featLevel: 0, rank: 0 });
    const out = text(renderToStaticMarkup(<GenericFacetLine entity={entity} ctx={ctx} />));
    expect(out).toContain("AC: 20");
    expect(out).not.toMatch(/Feat/);
    expect(out).not.toMatch(/Rank/);
  });

  it("a catchall (arbitrary AoN-only) field renders humanized", () => {
    const entity = entityWith("ancestry", { sizeId: 2 } as unknown as Facets);
    const out = text(renderToStaticMarkup(<GenericFacetLine entity={entity} ctx={ctx} />));
    expect(out).toContain("Size Id: 2");
  });

  it("no populated facets -> null", () => {
    expect(
      renderToStaticMarkup(<GenericFacetLine entity={entityWith("rules", {})} ctx={ctx} />),
    ).toBe("");
  });
});

// ---------------------------------------------------------------------------
// D29-62 (R3, P6): mastheadExtra rendering across all 5 call sites
// ---------------------------------------------------------------------------

function plainText(content: string): MastheadExtraEntry["value"][number] {
  return { kind: "text", content, marks: { bold: false, italic: false, superscript: false } };
}

function masthead(label: string, content: string): MastheadExtraEntry {
  return { label, value: [plainText(content)] };
}

describe("mastheadExtra rendering (D29-62)", () => {
  it("SpellFacetHeader appends mastheadExtra pairs after its own typed parts", () => {
    const entity = entityWith(
      "spell",
      { rank: 1 },
      { mastheadExtra: [masthead("Target", "1 willing creature")] },
    );
    const out = text(renderToStaticMarkup(<SpellFacetHeader entity={entity} ctx={ctx} />));
    expect(out).toContain("Rank 1");
    expect(out).toContain("Target 1 willing creature");
  });

  it("EquipmentFacetHeader renders itemSubcategory and mastheadExtra", () => {
    const entity = entityWith(
      "equipment",
      { itemCategory: "Runes", itemSubcategory: "Weapon Property Runes" },
      { mastheadExtra: [masthead("Activate", "Interact")] },
    );
    const out = text(renderToStaticMarkup(<EquipmentFacetHeader entity={entity} ctx={ctx} />));
    expect(out).toContain("Runes");
    expect(out).toContain("Weapon Property Runes");
    expect(out).toContain("Activate Interact");
  });

  it("FeatFacetHeader renders even with empty facets when mastheadExtra alone is present", () => {
    const entity = entityWith(
      "feat",
      {},
      { mastheadExtra: [masthead("Frequency", "once per day")] },
    );
    const out = text(renderToStaticMarkup(<FeatFacetHeader entity={entity} ctx={ctx} />));
    expect(out).toContain("Frequency once per day");
  });

  it("GenericFacetLine (ritual's post-R4-move group) appends mastheadExtra after its facet dump", () => {
    const entity = entityWith(
      "ritual",
      {},
      { mastheadExtra: [masthead("Primary Check", "Arcana")] },
    );
    const out = text(renderToStaticMarkup(<GenericFacetLine entity={entity} ctx={ctx} />));
    expect(out).toContain("Primary Check Arcana");
  });

  it("no mastheadExtra -> unaffected (absent field, never rendered as an empty row)", () => {
    const entity = entityWith("spell", { rank: 1 });
    expect(entity.mastheadExtra).toBeUndefined();
    const out = text(renderToStaticMarkup(<SpellFacetHeader entity={entity} ctx={ctx} />));
    expect(out).not.toContain("undefined");
  });

  it("MastheadExtraFallback (the 5th, creature/hazard call site) renders when present, null otherwise", () => {
    const withExtra = entityWith(
      "creature",
      {},
      { mastheadExtra: [masthead("Recall Knowledge", "DC 20")] },
    );
    const out = text(renderToStaticMarkup(<MastheadExtraFallback entity={withExtra} ctx={ctx} />));
    expect(out).toContain("Recall Knowledge DC 20");

    const withoutExtra = entityWith("creature", {});
    expect(renderToStaticMarkup(<MastheadExtraFallback entity={withoutExtra} ctx={ctx} />)).toBe(
      "",
    );
  });
});

// ---------------------------------------------------------------------------
// IMPLEMENTATION-TIME FIX (P6 Track A): mastheadExtra must not duplicate a
// label a header's own typed facet already rendered — a real bug found live
// on spell/heal (Traditions/Range shown twice), armor/breastplate (Price/
// Bulk twice), and feat/camouflage-coat (Prerequisites twice) once R3's
// masthead strip started populating mastheadExtra for real entities.
// ---------------------------------------------------------------------------

describe("mastheadExtra de-duplicates against each header's own typed labels", () => {
  it("SpellFacetHeader: a masthead 'Traditions'/'Range' pair is suppressed when the typed facet already rendered that label", () => {
    const entity = entityWith(
      "spell",
      { rank: 1, traditions: ["divine", "primal"], range: "touch" },
      {
        mastheadExtra: [
          masthead("Traditions", "Divine"), // duplicate of the typed facet -> suppressed
          masthead("Range", "varies"), // duplicate -> suppressed
          masthead("Bloodline", "Angelic"), // no typed counterpart -> kept
        ],
      },
    );
    const out = text(renderToStaticMarkup(<SpellFacetHeader entity={entity} ctx={ctx} />));
    // The typed value survives, exactly once.
    expect(out.match(/Traditions/g)?.length).toBe(1);
    expect(out).toContain("divine, primal");
    expect(out.match(/Range/g)?.length).toBe(1);
    expect(out).toContain("Range touch"); // the TYPED value, not the masthead's "varies"
    // The non-colliding pair still comes through.
    expect(out).toContain("Bloodline Angelic");
  });

  it("EquipmentFacetHeader: a masthead 'Price'/'Bulk' pair is suppressed, 'Category'/'Group' are kept (real armor/breastplate shape)", () => {
    const entity = entityWith(
      "armor",
      { bulk: 2, itemCategory: "medium", price: "8 gp" },
      {
        mastheadExtra: [
          masthead("Price", "8 gp"),
          masthead("AC Bonus", "+4"),
          masthead("Bulk", "2"),
          masthead("Category", "Medium"),
        ],
      },
    );
    const out = text(renderToStaticMarkup(<EquipmentFacetHeader entity={entity} ctx={ctx} />));
    expect(out.match(/Price/g)?.length).toBe(1);
    expect(out.match(/Bulk/g)?.length).toBe(1);
    expect(out).toContain("AC Bonus +4");
    expect(out).toContain("Category Medium");
  });

  it("FeatFacetHeader: a masthead 'Prerequisites' pair is suppressed when the typed facet already rendered it (the real camouflage-coat shape)", () => {
    const entity = entityWith(
      "feat",
      { featLevel: 13, prerequisites: ["mottle-coat centaur heritage"] },
      { mastheadExtra: [masthead("Prerequisites", "Mottle-Coat Centaur heritage")] },
    );
    const out = text(renderToStaticMarkup(<FeatFacetHeader entity={entity} ctx={ctx} />));
    expect(out.match(/Prerequisites/g)?.length).toBe(1);
    expect(out).toContain("mottle-coat centaur heritage"); // the typed (Foundry) value
  });

  it("GenericFacetLine: a masthead pair matching a humanized catchall label (colon-insensitive) is suppressed", () => {
    const entity = entityWith(
      "vehicle",
      { ac: 20 },
      { mastheadExtra: [masthead("AC", "20"), masthead("Speed", "25 feet")] },
    );
    const out = text(renderToStaticMarkup(<GenericFacetLine entity={entity} ctx={ctx} />));
    expect(out.match(/AC/g)?.length).toBe(1);
    expect(out).toContain("Speed 25 feet");
  });
});
