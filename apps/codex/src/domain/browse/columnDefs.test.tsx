import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IndexRow } from "@/schema/entity";
import { createCorpusReader, fixtureCorpusRoot } from "@/server/corpusFs";

import { columnsFor, comparatorForSort, type ColumnDef } from "./columnDefs";
import { sortRows } from "./filterEngine";

function row(overrides: Partial<IndexRow> & Pick<IndexRow, "id" | "name">): IndexRow {
  return {
    traits: [],
    source: { book: "Test Book", license: "unknown" },
    edition: "remaster",
    superseded: false,
    ...overrides,
  };
}

function keysOf(cols: readonly ColumnDef[]): string[] {
  return cols.map((c) => c.key);
}

function renderCell(col: ColumnDef, r: IndexRow): string {
  return renderToStaticMarkup(createElement("div", null, col.render(r)));
}

// ---------------------------------------------------------------------------
// A: totality — every one of the real 88 categories -> a non-empty column
// set (Name/Source are the guaranteed floor), over the SAME hermetic fixture
// corpus `facetDefs.test.ts`'s own conformance suite and `corpusFs.test.ts`
// already use (`fixtures/entities/`, all 88 category dirs present — proven
// below by the exact count, not an approximation).
// ---------------------------------------------------------------------------

describe("columnDefs: totality (D29-78 acceptance gate A)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const categories = reader.categories();

  it("the fixture corpus covers exactly the real 88 categories", () => {
    expect(categories.length).toBe(88);
  });

  it("every category -> a non-empty column set, always including Name and Source", () => {
    for (const category of categories) {
      const cols = columnsFor(category, reader.index(category));
      expect(cols.length, category).toBeGreaterThan(0);
      const keys = keysOf(cols);
      expect(keys, category).toContain("name");
      expect(keys, category).toContain("source");
    }
  });

  it("sidebar (0% level, 0% rarity coverage) renders Name · Source only", () => {
    const cols = columnsFor("sidebar", reader.index("sidebar"));
    expect(keysOf(cols)).toEqual(["name", "source"]);
  });

  it("rules (0% level coverage, rarity cardinality-1) drops both Lvl and Rarity", () => {
    const cols = columnsFor("rules", reader.index("rules"));
    const keys = keysOf(cols);
    expect(keys).not.toContain("level");
    expect(keys).not.toContain("rarity");
    expect(keys).toEqual(["name", "source"]);
  });

  it("trait/source/article: same cardinality-1 rarity drop as rules", () => {
    for (const category of ["trait", "source", "article"]) {
      const keys = keysOf(columnsFor(category, reader.index(category)));
      expect(keys, category).not.toContain("rarity");
    }
  });

  it("spell/creature/feat/equipment (100%-level-covered groups) keep Lvl", () => {
    for (const category of ["spell", "creature", "feat", "equipment"]) {
      expect(keysOf(columnsFor(category, reader.index(category))), category).toContain("level");
    }
  });

  it("creature-ability (0% level coverage despite sharing feat's column group) drops Lvl", () => {
    const keys = keysOf(columnsFor("creature-ability", reader.index("creature-ability")));
    expect(keys).not.toContain("level");
    expect(keys).toContain("actionCost");
    expect(keys).toContain("itemCategory");
  });

  // NOTE: a "no column ever renders every row as an em-dash" check is NOT
  // run against the fixture corpus here — that invariant is guaranteed by
  // `facetKeys.ts`'s own emit-time ≥40%-coverage classifier over the REAL
  // 44,808-entity corpus (independently verified for every group below,
  // this slice's own report), not something a 1-3-row-per-category FIXTURE
  // sample can reproduce (e.g. the fixture's single `equipment`/
  // `creature-ability` row happens to lack `price`/`bulk`/`actionCost` —
  // real coverage there is 51.7%/54.5%/70.5%). The em-dash-renders-for-
  // missing-values contract itself IS covered, per-renderer, below.
});

// ---------------------------------------------------------------------------
// group column sets (D29-78's 5 sets), spot-checked against the spec text
// ---------------------------------------------------------------------------

describe("columnDefs: per-group column sets", () => {
  const spellRows = [row({ id: "spell/a", name: "A", level: 1 })];
  const creatureRows = [row({ id: "creature/a", name: "A", level: 1 })];
  const equipmentRows = [row({ id: "equipment/a", name: "A", level: 0 })];
  const featRows = [row({ id: "feat/a", name: "A", level: 1 })];

  it("spell: Name, Lvl, Cast, Range, Source", () => {
    expect(keysOf(columnsFor("spell", spellRows))).toEqual([
      "name",
      "level",
      "castTime",
      "range",
      "source",
    ]);
  });

  it("creature/hazard/vehicle: Name, Lvl, Size, HP, AC, Source", () => {
    for (const category of ["creature", "hazard", "vehicle"]) {
      expect(keysOf(columnsFor(category, creatureRows))).toEqual([
        "name",
        "level",
        "size",
        "hp",
        "ac",
        "source",
      ]);
    }
  });

  it("equipment/weapon/armor/shield: Name, Lvl, Price, Bulk, Source", () => {
    for (const category of ["equipment", "weapon", "armor", "shield"]) {
      expect(keysOf(columnsFor(category, equipmentRows))).toEqual([
        "name",
        "level",
        "price",
        "bulk",
        "source",
      ]);
    }
  });

  it("feat/creature-ability: Name, Lvl, Actions, Type, Source", () => {
    expect(keysOf(columnsFor("feat", featRows))).toEqual([
      "name",
      "level",
      "actionCost",
      "itemCategory",
      "source",
    ]);
  });

  it("every set ends with Source as its last labeled column (the icon is a separate fixed cell, not a ColumnDef)", () => {
    for (const [category, rows] of [
      ["spell", spellRows],
      ["creature", creatureRows],
      ["equipment", equipmentRows],
      ["feat", featRows],
    ] as const) {
      const cols = columnsFor(category, rows);
      expect(cols[cols.length - 1]?.key).toBe("source");
    }
  });
});

// ---------------------------------------------------------------------------
// C: rank comparators
// ---------------------------------------------------------------------------

describe("columnDefs: rank comparators (D29-78 acceptance gate C)", () => {
  it("rarity: uncommon < rare", () => {
    const rows = [
      row({ id: "a", name: "A", rarity: "rare" }),
      row({ id: "b", name: "B", rarity: "uncommon" }),
      row({ id: "c", name: "C", rarity: "common" }),
      row({ id: "d", name: "D", rarity: "unique" }),
    ];
    const cols = columnsFor("condition", rows); // fallback group; rarity present + card>=2 here
    const comparator = comparatorForSort(cols, "rarity");
    expect(comparator).toBeDefined();
    const sorted = sortRows(rows, "rarity", comparator).map((r) => r.rarity);
    expect(sorted).toEqual(["common", "uncommon", "rare", "unique"]);
  });

  it("size: med < lg", () => {
    const rows = [
      row({ id: "a", name: "A", facets: { size: "lg" } }),
      row({ id: "b", name: "B", facets: { size: "tiny" } }),
      row({ id: "c", name: "C", facets: { size: "med" } }),
      row({ id: "d", name: "D", facets: { size: "grg" } }),
      row({ id: "e", name: "E", facets: { size: "huge" } }),
      row({ id: "f", name: "F", facets: { size: "sm" } }),
    ];
    const cols = columnsFor("creature", rows);
    const comparator = comparatorForSort(cols, "size");
    const sorted = sortRows(rows, "size", comparator).map((r) => r.facets?.size);
    expect(sorted).toEqual(["tiny", "sm", "med", "lg", "huge", "grg"]);
  });

  it("feat Actions: passive sorts LAST (tied with missing), both ascending and descending", () => {
    const rows = [
      row({ id: "a", name: "A", facets: { actionCost: "passive" } }),
      row({ id: "b", name: "B", facets: { actionCost: "2" } }),
      row({ id: "c", name: "C", facets: { actionCost: "free" } }),
      row({ id: "d", name: "D" }), // no actionCost at all — the OTHER missing case
      row({ id: "e", name: "E", facets: { actionCost: "reaction" } }),
    ];
    const cols = columnsFor("feat", rows);
    const comparator = comparatorForSort(cols, "actionCost");

    const asc = sortRows(rows, "actionCost", comparator).map((r) => r.id);
    expect(asc.slice(0, 3)).toEqual(["c", "e", "b"]); // free < reaction < 2
    expect(asc.slice(3).sort()).toEqual(["a", "d"]); // passive + missing, tied last (order broken by name)

    const desc = sortRows(rows, "-actionCost", comparator).map((r) => r.id);
    expect(desc.slice(0, 3)).toEqual(["b", "e", "c"]); // 2 < reaction < free, REVERSED
    expect(desc.slice(3).sort()).toEqual(["a", "d"]); // still LAST under desc — the D29-78 rule
  });

  it("actionCost/castTime rank: the 8-token enumerated prefix orders correctly", () => {
    const rows = [
      row({ id: "3", name: "3", facets: { castTime: "3" } }),
      row({ id: "2or3", name: "2or3", facets: { castTime: "2 or 3" } }),
      row({ id: "2", name: "2", facets: { castTime: "2" } }),
      row({ id: "1to3", name: "1to3", facets: { castTime: "1 to 3" } }),
      row({ id: "1or2", name: "1or2", facets: { castTime: "1 or 2" } }),
      row({ id: "1", name: "1", facets: { castTime: "1" } }),
      row({ id: "reaction", name: "reaction", facets: { castTime: "reaction" } }),
      row({ id: "free", name: "free", facets: { castTime: "free" } }),
    ];
    const cols = columnsFor("spell", rows);
    const comparator = comparatorForSort(cols, "castTime");
    const sorted = sortRows(rows, "castTime", comparator).map((r) => r.id);
    expect(sorted).toEqual(["free", "reaction", "1", "1or2", "1to3", "2", "2or3", "3"]);
  });

  it("actionCost/castTime rank: a time-string sorts AFTER the enumerated prefix and BEFORE nothing else real (duration-parsed, not lumped with missing)", () => {
    const rows = [
      row({ id: "day", name: "day", facets: { castTime: "1 day" } }),
      row({ id: "three", name: "three", facets: { castTime: "3" } }),
      row({ id: "minute", name: "minute", facets: { castTime: "1 minute" } }),
      row({ id: "hour", name: "hour", facets: { castTime: "1 hour" } }),
      row({ id: "tenmin", name: "tenmin", facets: { castTime: "10 minutes" } }),
    ];
    const cols = columnsFor("spell", rows);
    const comparator = comparatorForSort(cols, "castTime");
    const sorted = sortRows(rows, "castTime", comparator).map((r) => r.id);
    expect(sorted).toEqual(["three", "minute", "tenmin", "hour", "day"]);
  });

  it("an unenumerated composite ('2 to 2 rounds', the real corpus's 3-occurrence residue) sorts LAST, tied with missing", () => {
    const rows = [
      row({ id: "a", name: "A", facets: { castTime: "2 to 2 rounds" } }),
      row({ id: "b", name: "B", facets: { castTime: "free" } }),
      row({ id: "c", name: "C" }), // no castTime
    ];
    const cols = columnsFor("spell", rows);
    const comparator = comparatorForSort(cols, "castTime");
    const sorted = sortRows(rows, "castTime", comparator).map((r) => r.id);
    expect(sorted).toEqual(["b", "a", "c"]); // "a"/"c" tie-broken by name
  });

  it("missing-last holds under numeric comparators too (HP), ascending and descending", () => {
    const rows = [
      row({ id: "a", name: "A", facets: { hp: 50 } }),
      row({ id: "b", name: "B" }), // no hp
      row({ id: "c", name: "C", facets: { hp: 10 } }),
    ];
    const cols = columnsFor("creature", rows);
    const comparator = comparatorForSort(cols, "hp");
    expect(sortRows(rows, "hp", comparator).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortRows(rows, "-hp", comparator).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("an inapplicable sort key (not on this category's column set) falls back to name — the render-time half of the forever-decode rule", () => {
    const rows = [row({ id: "spell/z", name: "Zebra" }), row({ id: "spell/a", name: "Apple" })];
    const cols = columnsFor("spell", rows);
    // "hp" is a real facetKeys.ts key elsewhere but not on spell's column set.
    const comparator = comparatorForSort(cols, "hp");
    expect(comparator).toBeUndefined();
    expect(sortRows(rows, "hp", comparator).map((r) => r.name)).toEqual(["Apple", "Zebra"]);
  });
});

// ---------------------------------------------------------------------------
// renderers — em-dash for missing, feet->ft, glyphs, the itemCategory map
// ---------------------------------------------------------------------------

describe("columnDefs: cell renderers", () => {
  const featCols = columnsFor("feat", [row({ id: "feat/a", name: "A", level: 1 })]);
  const spellCols = columnsFor("spell", [row({ id: "spell/a", name: "A", level: 1 })]);

  function colByKey(cols: readonly ColumnDef[], key: string): ColumnDef {
    const col = cols.find((c) => c.key === key);
    if (!col) throw new Error(`no column "${key}"`);
    return col;
  }

  it("missing facet values render an em-dash, never blank", () => {
    const r = row({ id: "feat/a", name: "A" }); // no facets at all
    expect(renderCell(colByKey(featCols, "actionCost"), r)).toContain("—");
    expect(renderCell(colByKey(featCols, "itemCategory"), r)).toContain("—");
    expect(renderCell(colByKey(spellCols, "castTime"), r)).toContain("—");
    expect(renderCell(colByKey(spellCols, "range"), r)).toContain("—");
  });

  it("the feat itemCategory 7-value override map", () => {
    const cases: Array<[string, string]> = [
      ["classfeature", "Class Feature"],
      ["ancestryfeature", "Ancestry Feature"],
      ["deityboon", "Deity Boon"],
      ["class", "Class"],
      ["ancestry", "Ancestry"],
      ["skill", "Skill"],
      ["general", "General"],
    ];
    const col = colByKey(featCols, "itemCategory");
    for (const [raw, label] of cases) {
      const r = row({ id: "feat/x", name: "X", facets: { itemCategory: raw } });
      expect(renderCell(col, r)).toContain(label);
    }
  });

  it("simple castTime values render an ActionGlyph (an <svg>, not raw text)", () => {
    const col = colByKey(spellCols, "castTime");
    const r = row({ id: "spell/x", name: "X", facets: { castTime: "2" } });
    expect(renderCell(col, r)).toContain("<svg");
  });

  it("a composite castTime ('1 or 2') renders glyph-connective-glyph", () => {
    const col = colByKey(spellCols, "castTime");
    const r = row({ id: "spell/x", name: "X", facets: { castTime: "1 or 2" } });
    const html = renderCell(col, r);
    expect(html).toContain("codex-col-cast-composite");
    expect((html.match(/<svg/g) ?? []).length).toBe(2);
    expect(html).toContain("or");
  });

  it("a time-string castTime ('1 minute') renders condensed truncated text, not a glyph", () => {
    const col = colByKey(spellCols, "castTime");
    const r = row({ id: "spell/x", name: "X", facets: { castTime: "1 minute" } });
    const html = renderCell(col, r);
    expect(html).not.toContain("<svg");
    expect(html).toContain("1 minute");
    expect(html).toContain('title="1 minute"');
  });

  it("feet -> ft abbreviation on Range, with the full value on title", () => {
    const col = colByKey(spellCols, "range");
    const r = row({
      id: "spell/x",
      name: "X",
      facets: { range: "60 feet; 10-foot radius, 60-foot tall cylinder" },
    });
    const html = renderCell(col, r);
    expect(html).toContain("60 ft; 10-foot radius, 60-foot tall cylinder");
    expect(html).toContain('title="60 feet; 10-foot radius, 60-foot tall cylinder"');
  });

  it("passive actionCost renders plain text, not a glyph", () => {
    const col = colByKey(featCols, "actionCost");
    const r = row({ id: "feat/x", name: "X", facets: { actionCost: "passive" } });
    const html = renderCell(col, r);
    expect(html).not.toContain("<svg");
    expect(html).toContain("Passive");
  });
});

// ---------------------------------------------------------------------------
// Source/Range are deliberately NOT sortable — see this slice's own report
// for the rationale (the spec's enumerated comparator list never names
// either).
// ---------------------------------------------------------------------------

describe("columnDefs: Source and Range are not sortable", () => {
  it("Source", () => {
    const cols = columnsFor("spell", [row({ id: "spell/a", name: "A", level: 1 })]);
    expect(cols.find((c) => c.key === "source")?.sortable).toBe(false);
  });
  it("Range", () => {
    const cols = columnsFor("spell", [row({ id: "spell/a", name: "A", level: 1 })]);
    expect(cols.find((c) => c.key === "range")?.sortable).toBe(false);
  });
});
