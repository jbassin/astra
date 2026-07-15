import { describe, expect, it } from "vitest";

import type { IndexRow } from "@/schema/entity";

import {
  ambientRows,
  applyFilters,
  categoryHasLevelCoverage,
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
  sortRows,
  sourceBookValueOf,
  toggleCoreEnumOption,
  toggleFacetEnumOption,
  traitOptionCounts,
  traitTriState,
  type BrowseFilterState,
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

  it("range filter (min/max, no hasValue) IGNORES missing-key rows — they stay visible", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { min: 10, max: 100 }]]),
    };
    // withHp (50) is inside 10..100; withoutHp has no hp at all but is NOT
    // excluded by the mere presence of a min/max narrowing (D29-32).
    const result = applyFilters(rows, state)
      .map((r) => r.id)
      .sort();
    expect(result).toEqual(["creature/a", "creature/b", "creature/c"]);
  });

  it("range filter with hasValue:true excludes missing-key rows", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { hasValue: true }]]),
    };
    expect(applyFilters(rows, state).map((r) => r.id)).toEqual(["creature/a"]);
  });

  it("range filter with hasValue:true AND bounds still enforces the bounds on present values", () => {
    const outOfRange = row({ id: "creature/d", name: "D", facets: { hp: 5 } });
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetRange: new Map([["hp", { min: 10, max: 100, hasValue: true }]]),
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

  it("level (core, range-shaped) follows the same ignore-unless-hasValue rule", () => {
    const withLevel = row({ id: "feat/a", name: "A", level: 5 });
    const withoutLevel = row({ id: "trait/a", name: "B" });
    const state: BrowseFilterState = { ...emptyFilterState(), level: { min: 0, max: 10 } };
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

  it("isRangeFilterActive is true when any of min/max/hasValue is set", () => {
    expect(isRangeFilterActive({ min: 1 })).toBe(true);
    expect(isRangeFilterActive({ hasValue: true })).toBe(true);
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
