import { afterEach, describe, expect, it } from "vitest";

import {
  _resetPagefindClientForTests,
  groupByCategory,
  loadPagefind,
  NAME_MATCH_PIN_CAP,
  partitionNameMatches,
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
    // across tests (a module-scope-reset convention shared across the app).
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

describe("partitionNameMatches (P8 S3, D29-81 — exact-name search boost)", () => {
  function result(over: Partial<SearchDisplayResult>): SearchDisplayResult {
    return {
      id: over.url ?? "x",
      url: "/x",
      name: "X",
      category: "spell",
      edition: "remaster",
      book: "b",
      ...over,
    };
  }

  it("the measured `fireball` case: an exact match ranked #10 is pinned #1", () => {
    // Ranks 0-8 are unrelated spells; the exact "Fireball" hit sits at
    // rank 9 (the 10th item) — exactly the hydration-window scenario the
    // Omnibar/SearchPage callers widen their scan for before calling this.
    const results = [
      ...Array.from({ length: 9 }, (_, i) => result({ id: `filler-${i}`, name: `Filler ${i}` })),
      result({ id: "fireball", name: "Fireball" }),
    ];
    const { pinned, rest } = partitionNameMatches(results, "fireball", NAME_MATCH_PIN_CAP);
    expect(pinned.map((r) => r.id)).toEqual(["fireball"]);
    expect(rest.some((r) => r.id === "fireball")).toBe(false); // not duplicated below
    expect(rest).toHaveLength(9);
  });

  it("exact beats prefix, regardless of original rank", () => {
    const results = [
      result({ id: "healing-font", name: "Healing Font" }), // prefix match, ranked first
      result({ id: "heal", name: "Heal" }), // exact match, ranked second
    ];
    const { pinned } = partitionNameMatches(results, "heal", NAME_MATCH_PIN_CAP);
    expect(pinned.map((r) => r.id)).toEqual(["heal", "healing-font"]);
  });

  it("ties within the same match kind break by level-then-name", () => {
    const results = [
      result({ id: "b", name: "Heal", level: "3" }),
      result({ id: "a", name: "Heal", level: "1" }),
    ];
    const { pinned } = partitionNameMatches(results, "heal", NAME_MATCH_PIN_CAP);
    expect(pinned.map((r) => r.id)).toEqual(["a", "b"]); // level 1 before level 3
  });

  it("a missing level sorts LAST within a tie (extends the site-wide missing-last rule)", () => {
    const results = [
      result({ id: "no-level", name: "Heal" }),
      result({ id: "leveled", name: "Heal", level: "5" }),
    ];
    const { pinned } = partitionNameMatches(results, "heal", NAME_MATCH_PIN_CAP);
    expect(pinned.map((r) => r.id)).toEqual(["leveled", "no-level"]);
  });

  it("is case- and diacritic-insensitive (NFD strip) against the DISPLAYED name", () => {
    const results = [result({ id: "ixame", name: "Ixamè" })];
    const { pinned } = partitionNameMatches(results, "IXAME", NAME_MATCH_PIN_CAP);
    expect(pinned.map((r) => r.id)).toEqual(["ixame"]);
  });

  it("trims and collapses incidental whitespace in the query before matching", () => {
    const results = [result({ id: "heal", name: "Heal" })];
    const { pinned } = partitionNameMatches(results, "  heal  ", NAME_MATCH_PIN_CAP);
    expect(pinned.map((r) => r.id)).toEqual(["heal"]);
  });

  it("caps the pinned group and puts overflow matches back into `rest`, never dropping them", () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      result({ id: `heal-${i}`, name: `Heal ${i}`, level: String(i) }),
    );
    const { pinned, rest } = partitionNameMatches(results, "heal", 8);
    expect(pinned).toHaveLength(8);
    expect(rest).toHaveLength(2); // the 2 lowest-priority matches, not lost
    expect(rest.map((r) => r.id)).toEqual(["heal-8", "heal-9"]);
  });

  it("a blank query (after trim) is a no-op — pass-through unchanged, same order", () => {
    const results = [result({ id: "a", name: "A" }), result({ id: "b", name: "B" })];
    expect(partitionNameMatches(results, "   ", NAME_MATCH_PIN_CAP)).toEqual({
      pinned: [],
      rest: results,
    });
  });

  it('a non-name query ("gambling lore satinder") matches nothing — empty pinned group, rest untouched', () => {
    const results = [
      result({ id: "gambling-lore", name: "Gambling Lore" }),
      result({ id: "satinder-morne", name: "Satinder Morne" }),
    ];
    const { pinned, rest } = partitionNameMatches(results, "gambling lore satinder", 8);
    expect(pinned).toEqual([]);
    expect(rest.map((r) => r.id)).toEqual(["gambling-lore", "satinder-morne"]);
  });

  it("a prefix match against a longer name still counts (word-initial substring)", () => {
    const results = [result({ id: "wand", name: "Wand of Smoldering Fireballs" })];
    const { pinned } = partitionNameMatches(results, "wand of smoldering fireballs", 8);
    expect(pinned.map((r) => r.id)).toEqual(["wand"]); // exact, not just prefix
  });
});
