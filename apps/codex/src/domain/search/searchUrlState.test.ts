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

  it("a `legacy` param is simply dropped — `/search` never carried a `legacy` alias (D29-67: no prior shared-link shape to stay compatible with)", () => {
    expect(validateSearchPageSearch(parseQuery("?legacy=1"))).toEqual({});
  });

  it("P6 R11 (D29-67): `?superseded=1` decodes to `{ superseded: true }`", () => {
    expect(validateSearchPageSearch(parseQuery("?superseded=1"))).toEqual({ superseded: true });
    expect(validateSearchPageSearch(parseQuery("?superseded=true"))).toEqual({ superseded: true });
  });

  it("a falsy/malformed `?superseded=` value decodes to the absent (default-hide) state", () => {
    expect(validateSearchPageSearch(parseQuery("?superseded=0"))).toEqual({});
    expect(validateSearchPageSearch(parseQuery("?superseded=false"))).toEqual({});
    expect(validateSearchPageSearch(parseQuery("?superseded=banana"))).toEqual({});
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
      superseded: false,
    };
    const search = filterStateToSearch(state);
    const back = searchToFilterState(search);
    expect(back).toEqual(state);
  });

  it("P6 R11 (D29-67): `?superseded=` round-trips both directions", () => {
    const revealed: SearchFilterState = { ...emptySearchFilterState(), superseded: true };
    const search = filterStateToSearch(revealed);
    expect(search).toEqual({ superseded: true });
    expect(searchToFilterState(search)).toEqual(revealed);

    // the default-hide state encodes to a clean URL — `superseded` is
    // omitted, never emitted as an explicit `false`.
    expect(filterStateToSearch(emptySearchFilterState())).toEqual({});
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

describe("pagefindFilters (P6 R11/D29-67 — search hides superseded by default, amending P4.5 D29-48)", () => {
  it("the default (empty) state pins the superseded filter to ['false'] — the Pagefind filter-object shape the supersededFilter merge produces", () => {
    expect(pagefindFilters(emptySearchFilterState())).toEqual({ superseded: ["false"] });
  });

  it("state.superseded=true OMITS the superseded key entirely (both editions match)", () => {
    const state: SearchFilterState = { ...emptySearchFilterState(), superseded: true };
    expect(pagefindFilters(state)).toEqual({});
  });

  it("folds every active dimension into one AND-of-OR filter object, plus the default-hide superseded key", () => {
    const state: SearchFilterState = {
      query: "",
      category: new Set(["spell"]),
      rarity: new Set(["common", "rare"]),
      edition: new Set(),
      level: new Set(["1"]),
      traits: new Set(["fire"]),
      superseded: false,
    };
    expect(pagefindFilters(state)).toEqual({
      category: ["spell"],
      rarity: ["common", "rare"],
      level: ["1"],
      traits: ["fire"],
      superseded: ["false"],
    });
  });

  it("the 'magic missile' shape: default-hide filters pin superseded to ['false'], the widened state omits it — the exact Pagefind filter-object contract the live proof (deferred to Integration) exercises end-to-end", () => {
    const hidden: SearchFilterState = { ...emptySearchFilterState(), query: "magic missile" };
    const revealed: SearchFilterState = { ...hidden, superseded: true };
    expect(pagefindFilters(hidden)).toEqual({ superseded: ["false"] });
    expect(pagefindFilters(revealed)).toEqual({});
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
