import { defaultParseSearch } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import type { IndexRow } from "@/schema/entity";

import { FACET_DEFS } from "./facetDefs";
import {
  applyFilters,
  emptyFilterState,
  isRangeFilterActive,
  type BrowseFilterState,
  type RangeFilter,
} from "./filterEngine";
import {
  decodeRangeParam,
  encodeRangeParam,
  filterStateToSearch,
  isCleanSearch,
  searchToFilterState,
  validateBrowseSearch,
  type BrowseSearch,
} from "./urlState";

/** `defaultParseSearch`'s return type (`AnySchema`) doesn't expose named
 * property access — this test file only ever treats its result as the same
 * `Record<string, unknown>` `validateBrowseSearch` accepts from the real
 * router pipeline, so a single narrow cast at the call site stands in for
 * the router's own internal typing. */
function parseQuery(queryString: string): Record<string, unknown> {
  return defaultParseSearch(queryString) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// the literal spec example, run through the REAL `@tanstack/router-core`
// query-string parser (not a hand simulation) — this is what actually proves
// the B1 gotcha (a `+` include sigil would be silently eaten by
// `URLSearchParams`) never regresses, since `defaultParseSearch` IS the
// pipeline stage that does that eating.
// ---------------------------------------------------------------------------

describe("urlState: the literal D29-35 example query string, via the real router parser", () => {
  const QUERY =
    "?traits=fire,-agile&level=-2..5&rarity=rare,unique&f.actionCost=1,reaction&q=drag&legacy=1";

  it("defaultParseSearch coerces legacy=1 to the NUMBER 1 (the bare-numeric-coercion gotcha)", () => {
    const raw = parseQuery(QUERY);
    expect(raw.legacy).toBe(1);
    expect(typeof raw.legacy).toBe("number");
  });

  it("round-trips through validateBrowseSearch + searchToFilterState to the exact expected state", () => {
    const raw = parseQuery(QUERY);
    const search = validateBrowseSearch(raw);
    const state = searchToFilterState(search);

    expect(state.query).toBe("drag");
    expect(state.legacy).toBe(true);
    expect([...state.traits.include]).toEqual(["fire"]);
    expect([...state.traits.exclude]).toEqual(["agile"]);
    expect(state.level).toEqual({ min: -2, max: 5 });
    expect([...state.rarity].sort()).toEqual(["rare", "unique"]);
    expect(state.facetEnum.get("actionCost")).toEqual(new Set(["1", "reaction"]));
  });

  it("f.actionCost=1 alone (single numeric-looking value) survives qss's toValue coercion", () => {
    const raw = parseQuery("?f.actionCost=1");
    // qss's toValue turns the bare param value "1" into the NUMBER 1 — proves
    // validateBrowseSearch's String(raw) normalization actually matters, not
    // just for `legacy`.
    expect(typeof raw["f.actionCost"]).toBe("number");
    const search = validateBrowseSearch(raw);
    const state = searchToFilterState(search);
    expect(state.facetEnum.get("actionCost")).toEqual(new Set(["1"]));
  });

  it("a bare `+` (the B1 sigil this codec deliberately avoids) decodes to a space, proving why include has no marker", () => {
    // Demonstrates the actual failure mode a `+`-prefixed include sigil would
    // hit: `URLSearchParams`/`qss` treat `+` as an encoded space.
    const raw = parseQuery("?traits=%2Bholy");
    expect(raw.traits).toBe("+holy");
    // Had the codec used `+` as an include marker, this would have arrived
    // as " holy" for an UNENCODED literal `+` in the query string:
    const rawUnencoded = parseQuery("?traits=+holy");
    expect(rawUnencoded.traits).toBe(" holy");
  });
});

describe("urlState: empty state <-> clean URL (D29-35)", () => {
  it("the empty filter state encodes to {} (a clean URL)", () => {
    const search = filterStateToSearch(emptyFilterState());
    expect(search).toEqual({});
    expect(isCleanSearch(search)).toBe(true);
  });

  it("{} decodes back to the empty filter state", () => {
    const state = searchToFilterState({});
    expect(state).toEqual(emptyFilterState());
  });

  it("validateBrowseSearch({}) never throws and produces {}", () => {
    expect(validateBrowseSearch({})).toEqual({});
  });
});

describe("urlState: range param decode/encode", () => {
  it("decodes -2..5", () => {
    expect(decodeRangeParam("-2..5")).toEqual({ min: -2, max: 5 });
  });
  it("decodes an omitted side", () => {
    expect(decodeRangeParam("..5")).toEqual({ max: 5 });
    expect(decodeRangeParam("-2..")).toEqual({ min: -2 });
  });
  it("decodes the hasValue marker", () => {
    expect(decodeRangeParam("10..100!")).toEqual({ min: 10, max: 100, hasValue: true });
    expect(decodeRangeParam("..!")).toEqual({ hasValue: true });
  });
  it("garbage decodes to {} (never throws)", () => {
    expect(decodeRangeParam("not-a-range")).toEqual({});
    expect(decodeRangeParam("")).toEqual({});
    expect(decodeRangeParam("1..2..3")).toEqual({});
  });
  it("encodeRangeParam omits an inactive filter", () => {
    expect(encodeRangeParam({})).toBeUndefined();
  });
  it("encode/decode round-trips a range filter", () => {
    const filters: RangeFilter[] = [
      { min: -2, max: 5 },
      { min: 10 },
      { max: 100 },
      { hasValue: true },
    ];
    for (const f of filters) expect(decodeRangeParam(encodeRangeParam(f) ?? "")).toEqual(f);
  });
});

// Found via a REAL-corpus S3 spot check (not spec'd up front): `creature.
// family` values are compound comma-bearing strings (e.g. "Dragon, Black",
// 380 occurrences measured) and `source.book` titles carry embedded commas
// too (240 measured) — a naive `.split(",")` silently shredded them into two
// bogus tokens, so `f.family=Dragon, Black` matched zero rows end-to-end
// (verified live against the real server before this fix).
describe("urlState: comma-containing values (the real-corpus family/book bug)", () => {
  it("a single enum value containing a literal comma round-trips whole", () => {
    const original = {
      ...emptyFilterState(),
      facetEnum: new Map([["family", new Set(["Dragon, Black"])]]),
    };
    const restored = searchToFilterState(filterStateToSearch(original));
    expect(restored.facetEnum.get("family")).toEqual(new Set(["Dragon, Black"]));
  });

  it("a multi-value selection MIXING a comma-bearing value with a plain one round-trips both", () => {
    const original = {
      ...emptyFilterState(),
      facetEnum: new Map([["family", new Set(["Dragon, Black", "Owlbear"])]]),
    };
    const restored = searchToFilterState(filterStateToSearch(original));
    expect(restored.facetEnum.get("family")).toEqual(new Set(["Dragon, Black", "Owlbear"]));
  });

  it("filterStateToSearch -> searchToFilterState round-trips a real comma-bearing family selection", () => {
    const original = {
      ...emptyFilterState(),
      facetEnum: new Map([["family", new Set(["Dragon, Black", "Dragon, Adamantine"])]]),
    };
    const search = filterStateToSearch(original);
    const restored = searchToFilterState(search);
    expect(restored.facetEnum.get("family")).toEqual(
      new Set(["Dragon, Black", "Dragon, Adamantine"]),
    );
  });

  it("a comma-bearing source.book selection round-trips", () => {
    const original = {
      ...emptyFilterState(),
      sourceBook: new Set(["Pathfinder #164: Hands of the Devil, Part One"]),
    };
    const search = filterStateToSearch(original);
    const restored = searchToFilterState(search);
    expect(restored.sourceBook).toEqual(new Set(["Pathfinder #164: Hands of the Devil, Part One"]));
  });

  it("a literal backslash in a value also round-trips (the escape char itself)", () => {
    const original = {
      ...emptyFilterState(),
      facetEnum: new Map([["family", new Set(["Weird\\Family, Name"])]]),
    };
    const restored = searchToFilterState(filterStateToSearch(original));
    expect(restored.facetEnum.get("family")).toEqual(new Set(["Weird\\Family, Name"]));
  });

  it("the spec's literal comma-free examples stay BYTE-IDENTICAL (no escaping overhead)", () => {
    const original = {
      ...emptyFilterState(),
      traits: { include: new Set(["fire"]), exclude: new Set(["agile"]) },
      rarity: new Set(["rare", "unique"]),
      facetEnum: new Map([["actionCost", new Set(["1", "reaction"])]]),
    };
    const search = filterStateToSearch(original);
    expect(search.traits).toBe("fire,-agile");
    expect((search.rarity ?? "").split(",").sort()).toEqual(["rare", "unique"]);
    expect(((search["f.actionCost"] as string) ?? "").split(",").sort()).toEqual(["1", "reaction"]);
  });
});

describe("urlState: hostile / unknown params never throw", () => {
  const hostileInputs: Array<Record<string, unknown>> = [
    { traits: 12345 },
    { traits: true },
    { traits: null },
    { traits: undefined },
    { traits: ["fire", "agile"] },
    { traits: { nested: "object" } },
    { level: "not-a-range" },
    { level: 999 },
    { "f.not-a-real-key": "x" },
    { "f.actionCost": ["array", "value"] },
    { totallyUnknownParam: "whatever" },
    { legacy: "yes" }, // not the string "1"/"true" -> falls back to false
    { sort: "banana" },
    { q: 42 },
    {},
  ];

  it.each(hostileInputs)("validateBrowseSearch never throws on %j", (raw) => {
    expect(() => validateBrowseSearch(raw)).not.toThrow();
  });

  it.each(hostileInputs)(
    "the full pipeline (validate -> state -> applyFilters) never throws on %j",
    (raw) => {
      const rows: IndexRow[] = [
        {
          id: "feat/a",
          name: "A",
          traits: ["fire"],
          source: { book: "Test", license: "unknown" },
          edition: "remaster",
          superseded: false,
        },
      ];
      expect(() => {
        const search = validateBrowseSearch(raw);
        const state = searchToFilterState(search);
        applyFilters(rows, state);
      }).not.toThrow();
    },
  );

  it("an unknown top-level param is dropped", () => {
    expect(validateBrowseSearch({ notAThing: "x" })).toEqual({});
  });

  it("an unknown f.* facet key is dropped", () => {
    expect(validateBrowseSearch({ "f.definitelyNotAFacetKey": "x" })).toEqual({});
  });

  it("legacy falls back to false/absent for any value other than 1/true/'1'/'true'", () => {
    expect(validateBrowseSearch({ legacy: "yes" }).legacy).toBeUndefined();
    expect(validateBrowseSearch({ legacy: 0 }).legacy).toBeUndefined();
    expect(validateBrowseSearch({ legacy: false }).legacy).toBeUndefined();
  });

  it("sort falls back to name (absent) for any value other than the literal 'level'", () => {
    expect(validateBrowseSearch({ sort: "banana" }).sort).toBeUndefined();
    expect(validateBrowseSearch({ sort: "level" }).sort).toBe("level");
  });
});

// ---------------------------------------------------------------------------
// property round-trip: encode -> decode -> encode is stable, over a
// hand-rolled deterministic PRNG (no fast-check dependency in this repo, D29
// hard rule: no new dependencies).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  const item = arr[Math.floor(rand() * arr.length)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}

function subset<T>(rand: () => number, arr: readonly T[]): Set<T> {
  const out = new Set<T>();
  for (const item of arr) if (rand() < 0.35) out.add(item);
  return out;
}

const TRAIT_POOL = ["fire", "agile", "magical", "evil", "holy", "reach-15"];
const RARITY_POOL = ["common", "uncommon", "rare", "unique"];
const BOOK_POOL = ["Player Core", "GM Core", "Monster Core"];
const ENUM_FACET_KEYS = Object.entries(FACET_DEFS)
  .filter(([, def]) => def.widget === "enum")
  .map(([key]) => key);
const RANGE_FACET_KEYS = Object.entries(FACET_DEFS)
  .filter(([, def]) => def.widget === "range")
  .map(([key]) => key);

function randomState(rand: () => number): BrowseFilterState {
  const include = subset(rand, TRAIT_POOL);
  const exclude = subset(
    rand,
    TRAIT_POOL.filter((t) => !include.has(t)),
  ); // keep include/exclude disjoint (a real UI would too)

  const level: RangeFilter = {};
  if (rand() < 0.5) level.min = Math.round(rand() * 30) - 2;
  if (rand() < 0.5) level.max = Math.round(rand() * 30) - 2;
  if (rand() < 0.2) level.hasValue = true;

  const facetEnum = new Map<string, Set<string>>();
  for (const key of ENUM_FACET_KEYS) {
    if (rand() < 0.25) {
      const s = subset(rand, ["1", "2", "reaction", "lg", "med", "x", "y"]);
      // An empty selection is semantically identical to "no filter on this
      // facet" (matchesEnum treats selected.size===0 as pass-through) — the
      // codec correctly normalizes it away (omitted param), so the generator
      // shouldn't manufacture a meaningless empty-but-present map entry.
      if (s.size > 0) facetEnum.set(key, s);
    }
  }
  const facetRange = new Map<string, RangeFilter>();
  for (const key of RANGE_FACET_KEYS) {
    if (rand() < 0.25) {
      const r: RangeFilter = {};
      if (rand() < 0.6) r.min = Math.round(rand() * 200);
      if (rand() < 0.6) r.max = Math.round(rand() * 200) + 200;
      if (rand() < 0.2) r.hasValue = true;
      if (r.min !== undefined || r.max !== undefined || r.hasValue) facetRange.set(key, r);
    }
  }

  return {
    query: rand() < 0.4 ? pick(rand, ["drag", "heal", "fire bolt", ""]) : "",
    legacy: rand() < 0.3,
    sort: rand() < 0.3 ? "level" : "name",
    traits: { include, exclude },
    level,
    rarity: subset(rand, RARITY_POOL),
    sourceBook: subset(rand, BOOK_POOL),
    edition: subset(rand, ["remaster", "legacy"]),
    facetEnum,
    facetRange,
  };
}

/** Canonical form for structural comparison — Sets/Maps sorted into plain
 * arrays so iteration-order differences never fail an otherwise-correct
 * round trip. */
function canon(state: BrowseFilterState): unknown {
  return {
    query: state.query,
    legacy: state.legacy,
    sort: state.sort,
    include: [...state.traits.include].sort(),
    exclude: [...state.traits.exclude].sort(),
    level: state.level,
    rarity: [...state.rarity].sort(),
    sourceBook: [...state.sourceBook].sort(),
    edition: [...state.edition].sort(),
    // Empty-effect entries (an empty selected-set, or a range filter with no
    // active bound) are semantically identical to the key being absent
    // entirely — normalized out here so the comparison is over FILTERING
    // BEHAVIOR, not incidental map bookkeeping.
    facetEnum: [...state.facetEnum.entries()]
      .filter(([, v]) => v.size > 0)
      .map(([k, v]) => [k, [...v].sort()] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
    facetRange: [...state.facetRange.entries()]
      .filter(([, v]) => isRangeFilterActive(v))
      .sort((a, b) => a[0].localeCompare(b[0])),
  };
}

describe("urlState: property round-trip (encode -> decode = id)", () => {
  it("200 generated states round-trip exactly through filterStateToSearch -> searchToFilterState", () => {
    const rand = mulberry32(0xc0de29);
    for (let i = 0; i < 200; i++) {
      const original = randomState(rand);
      const search = filterStateToSearch(original);
      const restored = searchToFilterState(search);
      expect(canon(restored), `iteration ${i}`).toEqual(canon(original));
    }
  });

  it("re-encoding the restored state is byte-stable (encode is a fixed point after one round trip)", () => {
    const rand = mulberry32(1337);
    for (let i = 0; i < 50; i++) {
      const original = randomState(rand);
      const search1 = filterStateToSearch(original);
      const state2 = searchToFilterState(search1);
      const search2 = filterStateToSearch(state2);
      expect(search2, `iteration ${i}`).toEqual(search1);
    }
  });

  it("every generated search object survives validateBrowseSearch unchanged (already-clean input)", () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const search = filterStateToSearch(randomState(rand));
      // validateBrowseSearch treats every value as `unknown` from the wire,
      // but a self-produced BrowseSearch is exactly the shape it expects.
      expect(validateBrowseSearch(search as unknown as Record<string, unknown>)).toEqual(search);
    }
  });
});

describe("urlState: BrowseSearch typing sanity", () => {
  it("a facet param key round-trips as a namespaced f.<key> property", () => {
    const search: BrowseSearch = { "f.actionCost": "1,reaction" };
    const state = searchToFilterState(search);
    expect(state.facetEnum.get("actionCost")).toEqual(new Set(["1", "reaction"]));
  });
});
