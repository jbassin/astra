import { describe, expect, it } from "vitest";

import { abbreviateBook } from "@/domain/sources/abbreviations";
import type { IndexRow } from "@/schema/entity";

import {
  ambientRows,
  applyFilters,
  categoryHasLevelCoverage,
  categoryHasRarityCoverage,
  clearAllFilters,
  collidingNames,
  countMissingByValue,
  cycleTraitFilter,
  editionValueOf,
  emptyFilterState,
  enumOptionCounts,
  facetValueOf,
  isEmptyFilterState,
  isRangeFilterActive,
  levelValueOf,
  matchesFilterState,
  missingCount,
  rangeBounds,
  rarityValueOf,
  scalarOptionCounts,
  setFacetRange,
  setSupersededFilter,
  setLevelRange,
  setQuery,
  setSort,
  sortOptionsByActionCostRank,
  sortOptionsByLabel,
  sortOptionsByRarityRank,
  sortOptionsFor,
  sortRows,
  sourceBookValueOf,
  toggleCoreEnumOption,
  toggleFacetEnumOption,
  traitOptionCounts,
  traitTriState,
  type BrowseFilterState,
  type OptionCount,
} from "./filterEngine";

function row(overrides: Partial<IndexRow> & Pick<IndexRow, "id" | "name">): IndexRow {
  return {
    traits: [],
    source: { book: "Test Book", license: "unknown" },
    edition: "remaster",
    superseded: false,
    ...overrides,
  };
}

describe("filterEngine: tri-state trait semantics (D29-32/-35)", () => {
  const fire = row({ id: "feat/a", name: "A", traits: ["fire", "agile"] });
  const nonFire = row({ id: "feat/b", name: "B", traits: ["agile"] });
  const neither = row({ id: "feat/c", name: "C", traits: [] });
  const fireOnly = row({ id: "feat/d", name: "D", traits: ["fire"] });
  const rows = [fire, nonFire, neither, fireOnly];

  it("include-only: AND across includes (must carry every included trait)", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(["fire", "agile"]), exclude: new Set() },
    };
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["feat/a"]);
  });

  it("exclude-only: NOT across excludes (must carry none of the excluded traits)", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(), exclude: new Set(["agile"]) },
    };
    expect(
      applyFilters(rows, state)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["feat/c", "feat/d"]);
  });

  it("include+exclude SIMULTANEOUSLY (traits=fire,-agile — the acceptance C spot-check)", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(["fire"]), exclude: new Set(["agile"]) },
    };
    // fire has both fire+agile -> excluded by -agile; fireOnly has fire, no
    // agile -> matches both the include and the exclude.
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["feat/d"]);
  });

  it("trait matching case-folds (a Magical/magical pair, verbatim corpus data)", () => {
    const magicalUpper = row({ id: "curse/a", name: "A", traits: ["Magical"] });
    const magicalLower = row({ id: "armor/b", name: "B", traits: ["magical"] });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(["magical"]), exclude: new Set() },
    };
    expect(
      applyFilters([magicalUpper, magicalLower], state)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["armor/b", "curse/a"]);
  });

  it("trait option counts fold case variants into one option", () => {
    const magicalUpper = row({ id: "curse/a", name: "A", traits: ["Magical"] });
    const magicalLower = row({ id: "armor/b", name: "B", traits: ["magical"] });
    const counts = traitOptionCounts([magicalUpper, magicalLower]);
    expect(counts).toEqual([{ value: "magical", count: 2 }]);
  });

  it("no trait filter -> every row passes (a proseOnly/traitless row included)", () => {
    expect(applyFilters(rows, emptyFilterState()).length).toBe(rows.length);
  });
});

describe("filterEngine: missing-key '—' bucket (the likeliest logic-bug nest)", () => {
  const withHp = row({ id: "creature/a", name: "A", facets: { hp: 50 } });
  const withoutHp = row({ id: "creature/b", name: "B" }); // proseOnly-style, no facets at all
  const withSize = row({ id: "creature/c", name: "C", facets: { size: "lg" } });
  const rows = [withHp, withoutHp, withSize];

  it("enum include-selection DROPS missing-key rows", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["size", new Set(["lg"])]]),
    };
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["creature/c"]);
  });

  it("no enum selection -> missing-key rows stay visible", () => {
    expect(applyFilters(rows, emptyFilterState()).length).toBe(rows.length);
  });

  it("a range filter with NO bound ('{}') IGNORES missing-key rows — they stay visible", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", {}]]),
    };
    const result = applyFilters(rows, state)
      .map((r) => r.id)
      .sort();
    expect(result).toEqual(["creature/a", "creature/b", "creature/c"]);
  });

  it("P6 D29-61(b): a typed min/max bound EXCLUDES missing-key rows — bounds imply has-value", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { min: 10, max: 100 }]]),
    };
    // withHp (50) is inside 10..100; withoutHp/withSize have no hp at all
    // and ARE now excluded by the mere presence of a min/max bound — the
    // separate `has-value` gate this rule replaces is gone (D29-61(b)).
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["creature/a"]);
  });

  it("a lone min (no max) also excludes missing-key rows", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { min: 10 }]]),
    };
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["creature/a"]);
  });

  it("a lone max (no min) also excludes missing-key rows", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { max: 1000 }]]),
    };
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["creature/a"]);
  });

  it("bounds still enforce the min/max range on present values, not just presence", () => {
    const outOfRange = row({ id: "creature/d", name: "D", facets: { hp: 5 } });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { min: 10, max: 100 }]]),
    };
    expect(applyFilters([...rows, outOfRange], state).map((r) => r.id)).toEqual(["creature/a"]);
  });

  it("trait exclude-selection never matches a traitless row (stays visible)", () => {
    const traitless = row({ id: "x/a", name: "A" });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(), exclude: new Set(["evil"]) },
    };
    expect(applyFilters([traitless], state)).toEqual([traitless]);
  });

  it("level (core, range-shaped) follows the same bounds-imply-has-value rule (D29-61(b)) — a typed bound excludes a level-missing row", () => {
    const withLevel = row({ id: "feat/a", name: "A", level: 5 });
    const withoutLevel = row({ id: "trait/a", name: "B" });
    const state: BrowseFilterState = { ...emptyFilterState(), level: { min: 0, max: 10 } };
    expect(applyFilters([withLevel, withoutLevel], state).map((r) => r.id)).toEqual(["feat/a"]);
  });

  it("level with NO bound set still includes a level-missing row (unfiltered)", () => {
    const withLevel = row({ id: "feat/a", name: "A", level: 5 });
    const withoutLevel = row({ id: "trait/a", name: "B" });
    const state: BrowseFilterState = { ...emptyFilterState(), level: {} };
    expect(
      applyFilters([withLevel, withoutLevel], state)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["feat/a", "trait/a"]);
  });

  it("rarity include-selection drops a rarity-less row", () => {
    const withRarity = row({ id: "feat/a", name: "A", rarity: "common" });
    const withoutRarity = row({ id: "ancestry/index", name: "Index" });
    const state: BrowseFilterState = { ...emptyFilterState(), rarity: new Set(["common"]) };
    expect(applyFilters([withRarity, withoutRarity], state).map((r) => r.id)).toEqual(["feat/a"]);
  });

  it("missingCount tallies rows lacking a facet key", () => {
    expect(missingCount(rows, "hp")).toBe(2); // withoutHp + withSize
    expect(missingCount(rows, "size")).toBe(2); // withHp + withoutHp
  });

  it("unknown facet keys in state (hostile/stale URL) never throw and are ignored", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["not-a-real-key", new Set(["x"])]]),
      facetRange: new Map([["also-not-real", { min: 1 }]]),
    };
    expect(() => applyFilters(rows, state)).not.toThrow();
    expect(applyFilters(rows, state).length).toBe(rows.length);
  });
});

describe("filterEngine: enum multi-select OR / AND across facets", () => {
  const a = row({ id: "feat/a", name: "A", facets: { actionCost: "1" } });
  const b = row({ id: "feat/b", name: "B", facets: { actionCost: "2" } });
  const c = row({ id: "feat/c", name: "C", facets: { actionCost: "reaction" } });
  const rows = [a, b, c];

  it("multi-select within a facet is OR", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["actionCost", new Set(["1", "reaction"])]]),
    };
    expect(
      applyFilters(rows, state)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["feat/a", "feat/c"]);
  });

  it("selection across two facets is AND", () => {
    const withCategory = row({
      id: "feat/d",
      name: "D",
      facets: { actionCost: "1", itemCategory: "ancestry" },
    });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([
        ["actionCost", new Set(["1"])],
        ["itemCategory", new Set(["ancestry"])],
      ]),
    };
    expect(applyFilters([...rows, withCategory], state).map((r) => r.id)).toEqual(["feat/d"]);
  });

  it("an array-valued facet (traditions) matches on any overlap (OR within the array too)", () => {
    const arcane = row({ id: "spell/a", name: "A", facets: { traditions: ["arcane"] } });
    const both = row({ id: "spell/b", name: "B", facets: { traditions: ["arcane", "occult"] } });
    const divine = row({ id: "spell/c", name: "C", facets: { traditions: ["divine"] } });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["traditions", new Set(["occult"])]]),
    };
    expect(applyFilters([arcane, both, divine], state).map((r) => r.id)).toEqual(["spell/b"]);
  });
});

describe("filterEngine: superseded visibility + quick filter", () => {
  const live = row({ id: "spell/heal", name: "Heal", superseded: false });
  const superseded = row({ id: "spell/heal@legacy", name: "Heal", superseded: true });
  const rows = [live, superseded];

  it("superseded rows hidden by default", () => {
    expect(applyFilters(rows, emptyFilterState()).map((r) => r.id)).toEqual(["spell/heal"]);
  });

  it("superseded: true shows superseded rows too", () => {
    const state: BrowseFilterState = { ...emptyFilterState(), superseded: true };
    expect(applyFilters(rows, state).length).toBe(2);
  });

  it("name quick-filter is a case-insensitive substring match", () => {
    const drag = row({ id: "spell/dragon-breath", name: "Dragon Breath" });
    const other = row({ id: "spell/heal-2", name: "Heal" });
    const state: BrowseFilterState = { ...emptyFilterState(), query: "DRAG" };
    expect(applyFilters([drag, other], state).map((r) => r.id)).toEqual(["spell/dragon-breath"]);
  });
});

describe("filterEngine: sort", () => {
  it("name sort is plain A-Z", () => {
    const rows = [row({ id: "a", name: "Zebra" }), row({ id: "b", name: "Apple" })];
    expect(sortRows(rows, "name").map((r) => r.name)).toEqual(["Apple", "Zebra"]);
  });

  it("level sort is ascending with the '—' (no-level) bucket LAST", () => {
    const rows = [
      row({ id: "a", name: "B", level: 5 }),
      row({ id: "b", name: "C" }), // no level
      row({ id: "c", name: "A", level: -2 }),
    ];
    expect(sortRows(rows, "level").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("level sort breaks ties by name", () => {
    const rows = [row({ id: "a", name: "Z", level: 1 }), row({ id: "b", name: "A", level: 1 })];
    expect(sortRows(rows, "level").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("level sort never coerces a missing level to 0/1 (M8) — it lands after level 28, not before -2", () => {
    const rows = [
      row({ id: "high", name: "High", level: 28 }),
      row({ id: "none", name: "None" }),
      row({ id: "low", name: "Low", level: -2 }),
    ];
    expect(sortRows(rows, "level").map((r) => r.id)).toEqual(["low", "high", "none"]);
  });

  // P8 S1 (D29-78) — the widened grammar's built-in-only (no comparator arg)
  // half: "-name"/"-level" reuse the exact same built-in name/level logic
  // `sortRows`'s original 2-arg call sites (above) already exercise, just
  // reversed — proving the 2-arg call sites keep compiling AND behaving
  // byte-identically was the whole point of making `comparator` additive-
  // optional rather than replacing the signature.
  it("-name sorts descending Z-A", () => {
    const rows = [row({ id: "a", name: "Apple" }), row({ id: "b", name: "Zebra" })];
    expect(sortRows(rows, "-name").map((r) => r.name)).toEqual(["Zebra", "Apple"]);
  });

  it("-level sorts descending, missing-level bucket STILL last (not first)", () => {
    const rows = [
      row({ id: "a", name: "B", level: 5 }),
      row({ id: "b", name: "C" }), // no level
      row({ id: "c", name: "A", level: -2 }),
    ];
    expect(sortRows(rows, "-level").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  // A custom RowComparator (the shape `columnDefs.ts`'s `comparatorForSort`
  // builds) exercised directly, in isolation from that module — proves
  // `sortRows`'s own missing-last-under-both-directions contract holds for
  // ANY comparator, not just the two built-in ones.
  it("a custom numeric RowComparator: missing-last holds ascending and descending", () => {
    const rows = [
      row({ id: "a", name: "A", facets: { hp: 50 } }),
      row({ id: "b", name: "B" }), // no facets -> missing hp
      row({ id: "c", name: "C", facets: { hp: 10 } }),
    ];
    const hpComparator = { valueOf: (r: IndexRow) => r.facets?.hp };
    expect(sortRows(rows, "hp", hpComparator).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortRows(rows, "-hp", hpComparator).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("a custom RowComparator with an explicit `compare` overrides the default numeric/localeCompare fallback", () => {
    const rows = [
      row({ id: "a", name: "A", facets: { size: "lg" } }),
      row({ id: "b", name: "B", facets: { size: "tiny" } }),
      row({ id: "c", name: "C" }), // missing
    ];
    const order = ["tiny", "sm", "med", "lg", "huge", "grg"];
    const sizeComparator = {
      valueOf: (r: IndexRow) => r.facets?.size,
      compare: (a: string | number, b: string | number) =>
        order.indexOf(String(a)) - order.indexOf(String(b)),
    };
    expect(sortRows(rows, "size", sizeComparator).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("an unknown/inapplicable sort key with NO comparator falls back to name, silently — never throws; the leading '-' direction is still honored", () => {
    const rows = [row({ id: "a", name: "Zebra" }), row({ id: "b", name: "Apple" })];
    expect(() => sortRows(rows, "totally-not-a-real-key")).not.toThrow();
    expect(sortRows(rows, "totally-not-a-real-key").map((r) => r.name)).toEqual(["Apple", "Zebra"]);
    // "-also-fake" is STILL an unknown key (no comparator resolves it), but
    // its leading `-` is honored on the name fallback — "sort by name, in
    // the direction that was asked for" rather than resetting direction too.
    expect(sortRows(rows, "-also-fake").map((r) => r.name)).toEqual(["Zebra", "Apple"]);
  });
});

describe("filterEngine: ambientRows (self-exclusion for option counts)", () => {
  const rows = [
    row({ id: "a", name: "A", facets: { actionCost: "1" } }),
    row({ id: "b", name: "B", facets: { actionCost: "2" } }),
    row({ id: "c", name: "C", facets: { actionCost: "reaction" } }),
  ];

  it("a facet's own selection is excluded from its ambient set (siblings stay countable)", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["actionCost", new Set(["1"])]]),
    };
    const ambient = ambientRows(rows, state, { kind: "facet", key: "actionCost" });
    const counts = enumOptionCounts(ambient, "actionCost");
    // all three options still visible with real counts, not starved to 0 by
    // the active "1" selection.
    expect(counts).toEqual([
      { value: "1", count: 1 },
      { value: "2", count: 1 },
      { value: "reaction", count: 1 },
    ]);
  });

  it("a DIFFERENT facet's selection still narrows this facet's ambient set", () => {
    const withCategory = row({
      id: "d",
      name: "D",
      facets: { actionCost: "1", itemCategory: "ancestry" },
    });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["itemCategory", new Set(["ancestry"])]]),
    };
    const ambient = ambientRows([...rows, withCategory], state, {
      kind: "facet",
      key: "actionCost",
    });
    expect(ambient.map((r) => r.id)).toEqual(["d"]);
  });
});

describe("filterEngine: bounds + level coverage + collisions", () => {
  it("rangeBounds is data-derived, never defaults a lower bound to 0/1 (M8)", () => {
    const rows = [row({ id: "a", name: "A", level: -2 }), row({ id: "b", name: "B", level: 28 })];
    expect(rangeBounds(rows, levelValueOf)).toEqual({ min: -2, max: 28 });
  });

  it("rangeBounds is null when no row carries the facet at all", () => {
    const rows = [row({ id: "a", name: "A" })];
    expect(rangeBounds(rows, facetValueOf("hp"))).toBeNull();
  });

  it("categoryHasLevelCoverage is false for an all-levelless category (e.g. trait/action)", () => {
    const rows = [row({ id: "trait/a", name: "A" }), row({ id: "trait/b", name: "B" })];
    expect(categoryHasLevelCoverage(rows)).toBe(false);
  });

  it("categoryHasLevelCoverage is true when at least one row carries a level", () => {
    const rows = [row({ id: "feat/a", name: "A", level: 1 }), row({ id: "feat/b", name: "B" })];
    expect(categoryHasLevelCoverage(rows)).toBe(true);
  });

  // P8 S1 (D29-78 adversarial B-U3) — the rarity analog, real-corpus-pinned:
  // rules/trait/source/article are 100%-covered but cardinality-1 (every
  // measured row is "common", real numbers this slice's own report
  // records); sidebar is 0%-covered (no row carries `rarity` at all).
  describe("categoryHasRarityCoverage", () => {
    it("false when every row is missing rarity entirely (e.g. sidebar)", () => {
      const rows = [row({ id: "sidebar/a", name: "A" }), row({ id: "sidebar/b", name: "B" })];
      expect(categoryHasRarityCoverage(rows)).toBe(false);
    });

    it("false at 100% coverage but cardinality 1 (e.g. rules — every row is 'common')", () => {
      const rows = [
        row({ id: "rules/a", name: "A", rarity: "common" }),
        row({ id: "rules/b", name: "B", rarity: "common" }),
        row({ id: "rules/c", name: "C", rarity: "common" }),
      ];
      expect(categoryHasRarityCoverage(rows)).toBe(false);
    });

    it("false below the 40% coverage floor even with cardinality >= 2", () => {
      const rows = [
        row({ id: "a", name: "A", rarity: "common" }),
        row({ id: "b", name: "B", rarity: "rare" }),
        row({ id: "c", name: "C" }),
        row({ id: "d", name: "D" }),
        row({ id: "e", name: "E" }),
        row({ id: "f", name: "F" }),
      ]; // 2/6 = 33.3% coverage, well under 40%, despite 2 distinct rarities
      expect(categoryHasRarityCoverage(rows)).toBe(false);
    });

    it("true when coverage clears 40% AND cardinality is >= 2 (e.g. creature)", () => {
      const rows = [
        row({ id: "a", name: "A", rarity: "common" }),
        row({ id: "b", name: "B", rarity: "uncommon" }),
        row({ id: "c", name: "C", rarity: "rare" }),
      ];
      expect(categoryHasRarityCoverage(rows)).toBe(true);
    });

    it("false for an empty row set (no divide-by-zero throw)", () => {
      expect(() => categoryHasRarityCoverage([])).not.toThrow();
      expect(categoryHasRarityCoverage([])).toBe(false);
    });
  });

  it("collidingNames flags only names appearing more than once", () => {
    const rows = [{ name: "Heal" }, { name: "Heal" }, { name: "Grick" }];
    expect(collidingNames(rows)).toEqual(new Set(["Heal"]));
  });
});

describe("filterEngine: emptyFilterState / isEmptyFilterState / isRangeFilterActive", () => {
  it("a fresh state is empty", () => {
    expect(isEmptyFilterState(emptyFilterState())).toBe(true);
  });

  it("any single dimension being set makes it non-empty", () => {
    expect(isEmptyFilterState({ ...emptyFilterState(), superseded: true })).toBe(false);
    expect(isEmptyFilterState({ ...emptyFilterState(), query: "x" })).toBe(false);
    expect(isEmptyFilterState({ ...emptyFilterState(), sort: "level" })).toBe(false);
    expect(
      isEmptyFilterState({
        ...emptyFilterState(),
        traits: { include: new Set(["fire"]), exclude: new Set() },
      }),
    ).toBe(false);
  });

  it("isRangeFilterActive is false for an all-undefined filter", () => {
    expect(isRangeFilterActive({})).toBe(false);
    expect(isRangeFilterActive(undefined)).toBe(false);
  });

  it("isRangeFilterActive is true when either min or max is set (D29-61(b): no separate has-value field anymore)", () => {
    expect(isRangeFilterActive({ min: 1 })).toBe(true);
    expect(isRangeFilterActive({ max: 1 })).toBe(true);
  });
});

describe("filterEngine: matchesFilterState is the single source applyFilters uses", () => {
  it("agrees with applyFilters row-by-row", () => {
    const rows = [
      row({ id: "a", name: "A", level: 1 }),
      row({ id: "b", name: "B", superseded: true }),
    ];
    const state = emptyFilterState();
    const filtered = new Set(applyFilters(rows, state).map((r) => r.id));
    for (const r of rows) expect(matchesFilterState(r, state)).toBe(filtered.has(r.id));
  });
});

describe("filterEngine: state-update helpers (FacetPanel's dispatch layer)", () => {
  it("cycleTraitFilter: neutral -> include -> exclude -> neutral", () => {
    let state = emptyFilterState();
    expect(traitTriState(state.traits, "fire")).toBe("neutral");
    state = cycleTraitFilter(state, "fire");
    expect(traitTriState(state.traits, "fire")).toBe("include");
    state = cycleTraitFilter(state, "fire");
    expect(traitTriState(state.traits, "fire")).toBe("exclude");
    state = cycleTraitFilter(state, "fire");
    expect(traitTriState(state.traits, "fire")).toBe("neutral");
    expect(state.traits.include.size).toBe(0);
    expect(state.traits.exclude.size).toBe(0);
  });

  it("toggleFacetEnumOption adds then removes, cleaning up an empty selection", () => {
    let state = emptyFilterState();
    state = toggleFacetEnumOption(state, "actionCost", "1");
    expect(state.facetEnum.get("actionCost")).toEqual(new Set(["1"]));
    state = toggleFacetEnumOption(state, "actionCost", "reaction");
    expect(state.facetEnum.get("actionCost")).toEqual(new Set(["1", "reaction"]));
    state = toggleFacetEnumOption(state, "actionCost", "1");
    state = toggleFacetEnumOption(state, "actionCost", "reaction");
    expect(state.facetEnum.has("actionCost")).toBe(false);
  });

  it("toggleCoreEnumOption toggles rarity/sourceBook/edition", () => {
    let state = emptyFilterState();
    state = toggleCoreEnumOption(state, "rarity", "rare");
    expect(state.rarity).toEqual(new Set(["rare"]));
    state = toggleCoreEnumOption(state, "rarity", "rare");
    expect(state.rarity).toEqual(new Set());
  });

  it("setFacetRange sets and clears (an inactive filter deletes the map entry)", () => {
    let state = emptyFilterState();
    state = setFacetRange(state, "hp", { min: 10, max: 100 });
    expect(state.facetRange.get("hp")).toEqual({ min: 10, max: 100 });
    state = setFacetRange(state, "hp", {});
    expect(state.facetRange.has("hp")).toBe(false);
  });

  it("setLevelRange / setQuery / setSort / setSupersededFilter set the expected field", () => {
    let state = emptyFilterState();
    state = setLevelRange(state, { min: -2, max: 5 });
    expect(state.level).toEqual({ min: -2, max: 5 });
    state = setQuery(state, "drag");
    expect(state.query).toBe("drag");
    state = setSort(state, "level");
    expect(state.sort).toBe("level");
    state = setSupersededFilter(state, true);
    expect(state.superseded).toBe(true);
  });

  it("clearAllFilters resets to the clean empty state regardless of prior state", () => {
    let state = emptyFilterState();
    state = cycleTraitFilter(state, "fire");
    state = setQuery(state, "drag");
    state = setSupersededFilter(state, true);
    state = setSort(state, "level");
    expect(clearAllFilters()).toEqual(emptyFilterState());
    expect(isEmptyFilterState(clearAllFilters())).toBe(true);
  });
});

describe("filterEngine: core scalar option counts (rarity/source.book/edition)", () => {
  const rows = [
    row({ id: "a", name: "A", rarity: "common" }),
    row({ id: "b", name: "B", rarity: "rare" }),
    row({ id: "c", name: "C" }), // rarity-less
    row({ id: "d", name: "D", rarity: "common" }),
  ];

  it("scalarOptionCounts tallies present values only", () => {
    expect(scalarOptionCounts(rows, rarityValueOf)).toEqual([
      { value: "common", count: 2 },
      { value: "rare", count: 1 },
    ]);
  });

  it("edition/sourceBook are always-present core fields (never contribute a missing bucket)", () => {
    expect(scalarOptionCounts(rows, editionValueOf)).toEqual([{ value: "remaster", count: 4 }]);
    expect(scalarOptionCounts(rows, sourceBookValueOf)).toEqual([{ value: "Test Book", count: 4 }]);
  });

  it("countMissingByValue counts level-less rows (the level facet's own missing bucket)", () => {
    const levelRows = [row({ id: "a", name: "A", level: 1 }), row({ id: "b", name: "B" })];
    expect(countMissingByValue(levelRows, levelValueOf)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P11 S2 (D29-107 b/c) — the two CoreEnumSection option re-sorts.
// ---------------------------------------------------------------------------

describe("sortOptionsByLabel (D29-107b — Source sorts by its DISPLAYED label)", () => {
  it("sorts by the label projection, case-insensitively — NOT the raw value", () => {
    // Raw values pre-sorted the OTHER way round by `scalarOptionCounts`'s own
    // alphabetical-on-raw-value order; the label projection reverses it.
    const options: OptionCount[] = [
      { value: "zzz-raw-first", count: 1 },
      { value: "aaa-raw-second", count: 1 },
    ];
    const labelOf = (v: string) => (v === "zzz-raw-first" ? "Alpha" : "Beta");
    expect(sortOptionsByLabel(options, labelOf).map((o) => o.value)).toEqual([
      "zzz-raw-first", // labeled "Alpha" -> sorts first
      "aaa-raw-second", // labeled "Beta"
    ]);
  });

  it("real Source shape: abbreviateBook() output orders 'CRB' before 'GMG', independent of the raw book-title order", () => {
    const options: OptionCount[] = [
      { value: "Gamemastery Guide", count: 3 }, // abbreviates to "GMG"
      { value: "Core Rulebook", count: 5 }, // abbreviates to "CRB"
    ];
    const sorted = sortOptionsByLabel(options, (v) => abbreviateBook(v) ?? v);
    expect(sorted.map((o) => o.value)).toEqual(["Core Rulebook", "Gamemastery Guide"]);
  });

  it("a book with no abbreviation sorts by its own full title, never a literal '(undefined)'", () => {
    const options: OptionCount[] = [
      { value: "Core Rulebook", count: 1 }, // "CRB"
      { value: "Some Unlisted Zine", count: 1 }, // no curated/generated abbreviation
    ];
    const sorted = sortOptionsByLabel(options, (v) => abbreviateBook(v) ?? v);
    expect(sorted.map((o) => o.value)).toEqual(["Core Rulebook", "Some Unlisted Zine"]);
  });
});

describe("sortOptionsByRarityRank (D29-107c — a SORT, never a whitelist)", () => {
  it("orders common < uncommon < rare < unique, regardless of input/count order", () => {
    const options: OptionCount[] = [
      { value: "unique", count: 2031 },
      { value: "rare", count: 10 },
      { value: "common", count: 100 },
      { value: "uncommon", count: 50 },
    ];
    expect(sortOptionsByRarityRank(options).map((o) => o.value)).toEqual([
      "common",
      "uncommon",
      "rare",
      "unique",
    ]);
  });

  it("never drops a value the way an order-array option SOURCE would — unique survives even alone", () => {
    const options: OptionCount[] = [{ value: "unique", count: 2031 }];
    expect(sortOptionsByRarityRank(options)).toEqual(options);
  });

  it("an unrecognized rarity value sorts LAST, alphabetically among itself", () => {
    const options: OptionCount[] = [
      { value: "zeta-unknown", count: 1 },
      { value: "common", count: 1 },
      { value: "alpha-unknown", count: 1 },
      { value: "rare", count: 1 },
    ];
    expect(sortOptionsByRarityRank(options).map((o) => o.value)).toEqual([
      "common",
      "rare",
      "alpha-unknown",
      "zeta-unknown",
    ]);
  });
});

// ---------------------------------------------------------------------------
// P13 S1 (D29-126) — the unified `sortOptionsFor` entry point.
// ---------------------------------------------------------------------------

describe("sortOptionsByActionCostRank (D29-126 — 1/2/3/free/reaction/passive, the PF2e listing order)", () => {
  it("orders the 6 real observed values 1/2/3/free/reaction/passive regardless of input order", () => {
    const options: OptionCount[] = [
      { value: "passive", count: 3837 },
      { value: "1", count: 894 },
      { value: "2", count: 496 },
      { value: "reaction", count: 454 },
      { value: "free", count: 203 },
      { value: "3", count: 142 },
    ];
    expect(sortOptionsByActionCostRank(options).map((o) => o.value)).toEqual([
      "1",
      "2",
      "3",
      "free",
      "reaction",
      "passive",
    ]);
  });

  it("an unrecognized value sorts LAST, alphabetically among itself", () => {
    const options: OptionCount[] = [
      { value: "zeta-unknown", count: 1 },
      { value: "passive", count: 1 },
      { value: "1", count: 1 },
    ];
    expect(sortOptionsByActionCostRank(options).map((o) => o.value)).toEqual([
      "1",
      "passive",
      "zeta-unknown",
    ]);
  });
});

describe("sortOptionsFor (D29-126 — the ONE convention, declared rank exceptions)", () => {
  it("dimension 'rarity' delegates to the rank sort", () => {
    const options: OptionCount[] = [
      { value: "unique", count: 1 },
      { value: "common", count: 1 },
    ];
    expect(sortOptionsFor("rarity", options).map((o) => o.value)).toEqual(["common", "unique"]);
  });

  it("dimension 'actionCost' delegates to the actionCost rank sort", () => {
    const options: OptionCount[] = [
      { value: "reaction", count: 1 },
      { value: "1", count: 1 },
    ];
    expect(sortOptionsFor("actionCost", options).map((o) => o.value)).toEqual(["1", "reaction"]);
  });

  it("any other dimension falls back to the case-insensitive DISPLAYED-label sort", () => {
    const options: OptionCount[] = [
      { value: "Gamemastery Guide", count: 1 }, // "GMG"
      { value: "Core Rulebook", count: 1 }, // "CRB"
    ];
    const sorted = sortOptionsFor("sourceBook", options, {
      labelOf: (v) => abbreviateBook(v) ?? v,
    });
    expect(sorted.map((o) => o.value)).toEqual(["Core Rulebook", "Gamemastery Guide"]);
  });

  it("an explicit comparator ALWAYS wins, even over a dimension that would otherwise match a rank table", () => {
    const options: OptionCount[] = [
      { value: "3", count: 1 },
      { value: "-2", count: 1 },
      { value: "10", count: 1 },
    ];
    // the S3 `/search` numeric `level` facet's own shape: a plain numeric
    // comparator over string-typed values, nothing to do with rarity/
    // actionCost's rank tables even if `dimension` coincidentally matched one.
    const sorted = sortOptionsFor("rarity", options, {
      comparator: (a, b) => Number(a.value) - Number(b.value),
    });
    expect(sorted.map((o) => o.value)).toEqual(["-2", "3", "10"]);
  });
});
