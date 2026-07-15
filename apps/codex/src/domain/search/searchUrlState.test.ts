import { defaultParseSearch } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import {
  emptySearchFilterState,
  filterStateToSearch,
  hasAnyCriteria,
  isCleanSearchPageSearch,
  pagefindFilters,
  searchToFilterState,
  validateSearchPageSearch,
  type SearchFilterState,
  type SearchPageSearch,
} from "./searchUrlState";

/** Same posture as `domain/browse/urlState.test.ts`: run the REAL
 * `@tanstack/router-core` query-string parser, not a hand simulation — this
 * is what actually proves the B1 gotcha (a bare `+` decoding to a space)
 * never regresses on `/search`'s own params. */
function parseQuery(queryString: string): Record<string, unknown> {
  return defaultParseSearch(queryString) as Record<string, unknown>;
}

describe("validateSearchPageSearch", () => {
  it("empty query string -> {}", () => {
    expect(validateSearchPageSearch(parseQuery(""))).toEqual({});
  });

  it("the spec-shaped example round-trips", () => {
    const raw = parseQuery("?q=heal&category=spell,feat&rarity=common&level=1,2");
    const parsed = validateSearchPageSearch(raw);
    expect(parsed).toEqual({
      q: "heal",
      category: "spell,feat",
      rarity: "common",
      level: "1,2",
    });
  });

  it("a `legacy`/`superseded` param is simply dropped (P4.5 D29-48 — search never hides superseded, so this codec carries no such field at all)", () => {
    expect(validateSearchPageSearch(parseQuery("?legacy=1"))).toEqual({});
    expect(validateSearchPageSearch(parseQuery("?superseded=1"))).toEqual({});
  });

  it("an unknown top-level param is dropped, never thrown", () => {
    expect(() => validateSearchPageSearch(parseQuery("?bogus=1"))).not.toThrow();
    expect(validateSearchPageSearch(parseQuery("?bogus=1"))).toEqual({});
  });

  it("empty-string values are dropped (never an empty-string-valued key)", () => {
    expect(validateSearchPageSearch({ q: "", category: "" })).toEqual({});
  });
});

describe("searchToFilterState / filterStateToSearch round trip", () => {
  it("empty state <-> {} (clean URL)", () => {
    const state = emptySearchFilterState();
    const search = filterStateToSearch(state);
    expect(search).toEqual({});
    expect(isCleanSearchPageSearch(search)).toBe(true);
  });

  it("a populated state round-trips through the URL shape", () => {
    const state: SearchFilterState = {
      query: "heal",
      category: new Set(["spell", "feat"]),
      rarity: new Set(["common"]),
      edition: new Set(["remaster"]),
      level: new Set(["1", "2"]),
      traits: new Set(["fire"]),
    };
    const search = filterStateToSearch(state);
    const back = searchToFilterState(search);
    expect(back).toEqual(state);
  });

  it("a comma-bearing value round-trips via the shared backslash-escape codec", () => {
    const state: SearchFilterState = {
      ...emptySearchFilterState(),
      category: new Set(["Dragon, Black"]),
    };
    const search = filterStateToSearch(state);
    expect(search.category).toBe("Dragon\\, Black");
    expect(searchToFilterState(search).category).toEqual(new Set(["Dragon, Black"]));
  });

  it("whitespace-only query trims to absent (q omitted from the URL)", () => {
    const state: SearchFilterState = { ...emptySearchFilterState(), query: "   " };
    expect(filterStateToSearch(state)).toEqual({});
  });
});

describe("hasAnyCriteria", () => {
  it("false for the empty state", () => {
    expect(hasAnyCriteria(emptySearchFilterState())).toBe(false);
  });

  it("true for a bare query", () => {
    expect(hasAnyCriteria({ ...emptySearchFilterState(), query: "heal" })).toBe(true);
  });

  it("true for a filter-only selection (no query text)", () => {
    expect(hasAnyCriteria({ ...emptySearchFilterState(), rarity: new Set(["rare"]) })).toBe(true);
  });
});

describe("pagefindFilters (P4.5 D29-48 — search never hides superseded)", () => {
  it("never sets a superseded filter, even for the empty state", () => {
    expect(pagefindFilters(emptySearchFilterState())).toEqual({});
  });

  it("folds every active dimension into one AND-of-OR filter object, with no superseded key", () => {
    const state: SearchFilterState = {
      query: "",
      category: new Set(["spell"]),
      rarity: new Set(["common", "rare"]),
      edition: new Set(),
      level: new Set(["1"]),
      traits: new Set(["fire"]),
    };
    expect(pagefindFilters(state)).toEqual({
      category: ["spell"],
      rarity: ["common", "rare"],
      level: ["1"],
      traits: ["fire"],
    });
  });
});

describe("validateSearchPageSearch / filterStateToSearch — hostile-input tolerance", () => {
  it("a malformed input never throws, degrades to a safe subset", () => {
    const raw: Record<string, unknown> = { q: { nested: true }, legacy: "nope", category: 42 };
    expect(() => validateSearchPageSearch(raw)).not.toThrow();
    const parsed = validateSearchPageSearch(raw);
    expect(parsed.category).toBe("42");
  });

  it("isCleanSearchPageSearch is false for any non-empty shape", () => {
    const s: SearchPageSearch = { q: "x" };
    expect(isCleanSearchPageSearch(s)).toBe(false);
  });
});
