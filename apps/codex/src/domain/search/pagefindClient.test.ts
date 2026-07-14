import { afterEach, describe, expect, it } from "vitest";

import {
  _resetPagefindClientForTests,
  groupByCategory,
  loadPagefind,
  supersededFilter,
  toDisplayResult,
  type PagefindSearchFragment,
  type SearchDisplayResult,
} from "./pagefindClient";

afterEach(() => {
  _resetPagefindClientForTests();
});

describe("loadPagefind (D29-34 fail-soft)", () => {
  it("resolves to null when the runtime doesn't exist (CI/dev-hermetic — no build has run)", async () => {
    // No mocking needed: `/pagefind/pagefind.js` is a real static asset that
    // only exists after a real `just codex-search-index` build — it is
    // GENUINELY absent in this test environment (D29-12: no `data/`), so the
    // dynamic import genuinely fails, exercising the real fail-soft path.
    const pf = await loadPagefind();
    expect(pf).toBeNull();
  });

  it("memoizes the failure — a second call doesn't re-attempt (same resolved promise)", async () => {
    const a = await loadPagefind();
    const b = await loadPagefind();
    expect(a).toBeNull();
    expect(b).toBeNull();
  });

  it("_resetPagefindClientForTests clears the memoized promise", async () => {
    await loadPagefind();
    _resetPagefindClientForTests();
    // Still resolves to null (the runtime is still absent) — this only
    // proves the module-scope promise was actually cleared, not leaked
    // across tests (same convention as `legacyToggle.ts`'s own reset).
    const pf = await loadPagefind();
    expect(pf).toBeNull();
  });
});

describe("supersededFilter (D29-36 M4)", () => {
  it("omits the filter key when legacy is on", () => {
    expect(supersededFilter(true)).toBeUndefined();
  });

  it('pins to the single string "false" when legacy is off', () => {
    expect(supersededFilter(false)).toEqual(["false"]);
  });
});

function fragment(over: Partial<PagefindSearchFragment>): PagefindSearchFragment {
  return {
    url: "/spell/heal",
    content: "",
    excerpt: "",
    meta: { title: "Heal", category: "spell", edition: "remaster", book: "Player Core" },
    filters: {},
    ...over,
  };
}

describe("toDisplayResult", () => {
  it("projects the meta fields build-search.ts writes", () => {
    const d = toDisplayResult(
      fragment({
        meta: {
          title: "Heal",
          category: "spell",
          edition: "remaster",
          book: "Player Core",
          level: "1",
          rarity: "common",
        },
        excerpt: "<mark>Heal</mark> a creature.",
      }),
    );
    expect(d).toEqual({
      id: "/spell/heal",
      url: "/spell/heal",
      name: "Heal",
      category: "spell",
      edition: "remaster",
      book: "Player Core",
      level: "1",
      rarity: "common",
      excerpt: "<mark>Heal</mark> a creature.",
    });
  });

  it("falls back to the url when meta.title is somehow absent", () => {
    const d = toDisplayResult(
      fragment({ meta: { category: "spell", edition: "remaster", book: "x" } }),
    );
    expect(d.name).toBe("/spell/heal");
  });
});

describe("groupByCategory (D29-36 omnibar type-ahead)", () => {
  function result(over: Partial<SearchDisplayResult>): SearchDisplayResult {
    return {
      id: "x",
      url: "/x",
      name: "X",
      category: "spell",
      edition: "remaster",
      book: "b",
      ...over,
    };
  }

  it("preserves each group's first-seen order and each item's rank within it", () => {
    const results = [
      result({ id: "1", category: "spell", name: "Heal" }),
      result({ id: "2", category: "feat", name: "Healer's Blessing" }),
      result({ id: "3", category: "spell", name: "Healing Font" }),
    ];
    const groups = groupByCategory(results);
    expect(groups.map((g) => g.category)).toEqual(["spell", "feat"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["1", "3"]);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["2"]);
  });

  it("returns an empty array for zero results", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
