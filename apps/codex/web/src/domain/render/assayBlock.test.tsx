import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AssayEntry } from "../../schema/assay";
import type { CodexEntity } from "../../schema/entity";
import { AssayBlock } from "./assayBlock";
import { noEmbeds, rootRenderCtx } from "./nodes";

/**
 * D30-40 — the render-side half of round 4's assay surface. Every kind +
 * edge the spec's own W-E gate asks for: quantitative, a hybrid
 * (quantitative kind carrying comparables), buff-comparables, a ledger with
 * a KNOWN and an UNKNOWN reasonCode, a summonBand rider, variants, and the
 * r10 thin-data note.
 */

const CTX = rootRenderCtx({ resolveEmbed: noEmbeds(), knownTraitIds: new Set() });

function makeSpell(overrides: Partial<CodexEntity> = {}): CodexEntity {
  return {
    id: "spell/heal",
    slug: "heal",
    category: "spell",
    name: "Heal",
    edition: "remaster",
    source: { book: "Player Core", license: "ORC" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

function html(entity: CodexEntity, assay: AssayEntry | undefined): string {
  return renderToStaticMarkup(<AssayBlock entity={entity} assay={assay} ctx={CTX} />);
}

describe("AssayBlock: absence (D30-40 byte-identical-untouched contract)", () => {
  it("renders nothing when assay is undefined", () => {
    expect(html(makeSpell(), undefined)).toBe("");
  });

  it("renders nothing for a non-spell entity even if an assay entry is (wrongly) supplied", () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 1,
      population: "beneficial",
      verdict: "in band",
    };
    expect(html(makeSpell({ category: "creature" }), entry)).toBe("");
  });
});

describe("AssayBlock: header", () => {
  it('renders the "Assay (experimental)" header', () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 1,
      population: "beneficial",
      verdict: "in band",
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("Assay");
    expect(out).toContain("(experimental)");
    expect(out).toContain("codex-assay-tag");
  });
});

describe("AssayBlock: quantitative", () => {
  it('renders "Power: <verdict>" and "EV X vs budget Y at rank R"', () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 3,
      population: "hostile",
      verdict: "in band",
      ev: 12,
      budget: 12,
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("Power: in band");
    expect(out).toContain("EV 12 vs budget 12 at rank 3");
  });

  it("renders the verdict line alone when ev/budget are absent", () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 3,
      population: "hostile",
      verdict: "+2.3 ranks hot",
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("Power: +2.3 ranks hot");
    expect(out).not.toContain("EV ");
  });
});

describe("AssayBlock: hybrid (quantitative kind carrying comparables)", () => {
  it("renders BOTH the score line AND the comparables list", () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 6,
      population: "hostile",
      verdict: "+1.8 ranks hot",
      ev: 30,
      budget: 24,
      comparables: [
        { id: "spell/fireball", name: "Fireball", rank: 6 },
        { id: "spell/lightning-bolt", name: "Lightning Bolt", rank: 6 },
      ],
      rankRange: [6, 6],
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("Power: +1.8 ranks hot");
    expect(out).toContain("EV 30 vs budget 24 at rank 6");
    expect(out).toContain('href="/spell/fireball"');
    expect(out).toContain("Fireball");
    expect(out).toContain("Lightning Bolt");
    expect(out).toContain("(ranks 6–6)");
  });

  it("comparable links carry the data-crossref popover attributes (D29-28 reuse)", () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 1,
      population: "hostile",
      comparables: [{ id: "spell/magic-missile", name: "Magic Missile", rank: 1 }],
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain('data-crossref=""');
    expect(out).toContain('data-crossref-target="spell/magic-missile"');
  });
});

describe("AssayBlock: buff-comparables + the r10 thin-data note", () => {
  it("renders linked comparable spells and the rank range", () => {
    const entry: AssayEntry = {
      kind: "buff-comparables",
      rank: 3,
      population: "beneficial",
      comparables: [{ id: "spell/heroism", name: "Heroism", rank: 3 }],
      rankRange: [3, 3],
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("Heroism");
    expect(out).toContain("(ranks 3–3)");
    expect(out).not.toContain("thin data");
  });

  it("adds the r10 thin-data note when ANY comparable's own rank is >= 9", () => {
    const entry: AssayEntry = {
      kind: "buff-comparables",
      rank: 1,
      population: "beneficial",
      comparables: [
        { id: "spell/heroism", name: "Heroism", rank: 3 },
        { id: "spell/wish", name: "Wish", rank: 9 },
      ],
      rankRange: [3, 9],
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("(includes rank 9–10 neighbors — thin data)");
  });
});

describe("AssayBlock: summonBand (D30-37 kind precedence — rides alongside kind:quantitative)", () => {
  it("renders the band line alongside the quantitative score", () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 4,
      population: "summon",
      verdict: "in band",
      ev: 20,
      budget: 20,
      summonBand: { baseLevel: 4, curveLevel: 3, delta: 1 },
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("Power: in band");
    expect(out).toContain("base level 4");
    expect(out).toContain("curve");
    expect(out).toContain("+1");
  });
});

describe("AssayBlock: ledger", () => {
  it("a known reasonCode renders the curated copy, never the raw code", () => {
    const entry: AssayEntry = {
      kind: "ledger",
      rank: 2,
      population: null,
      reasonCode: "no-comparable-profile",
    };
    const out = html(makeSpell(), entry);
    expect(out).not.toContain("no-comparable-profile");
    expect(out).toContain("close enough comparable spell");
  });

  it("an unrecognized reasonCode falls back to the generic honest sentence, never the raw code", () => {
    const entry: AssayEntry = {
      kind: "ledger",
      rank: 2,
      population: null,
      reasonCode: "some-brand-new-code-never-seen-before",
    };
    const out = html(makeSpell(), entry);
    expect(out).not.toContain("some-brand-new-code-never-seen-before");
    expect(out).toContain("have enough assay data yet");
  });

  it("a ledger-kind entry with NO reasonCode at all still renders the generic fallback (never an empty card)", () => {
    const entry: AssayEntry = { kind: "ledger", rank: 2, population: null };
    const out = html(makeSpell(), entry);
    expect(out).toContain("have enough assay data yet");
  });
});

describe("AssayBlock: variants render as sub-lines", () => {
  it("renders each variant's own label + its own content, nested under the primary entry", () => {
    const entry: AssayEntry = {
      kind: "quantitative",
      rank: 3,
      population: "hostile",
      verdict: "in band",
      ev: 10,
      budget: 10,
      variants: [
        {
          label: "Heightened (5th)",
          kind: "quantitative",
          rank: 5,
          population: "hostile",
          verdict: "+0.5 ranks hot",
          ev: 18,
          budget: 17.5,
        },
      ],
    };
    const out = html(makeSpell(), entry);
    expect(out).toContain("codex-assay-variant");
    expect(out).toContain("Heightened (5th)");
    expect(out).toContain("Power: in band"); // primary entry's own line
    expect(out).toContain("Power: +0.5 ranks hot"); // the variant's own line
    expect(out).toContain("EV 18 vs budget 17.5 at rank 5"); // variant uses ITS OWN rank
  });
});
