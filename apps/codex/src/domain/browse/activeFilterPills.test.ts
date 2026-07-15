import { describe, expect, it, vi } from "vitest";

import { activeFilterPills } from "./activeFilterPills";
import { emptyFilterState, setLevelRange, type BrowseFilterState } from "./filterEngine";

describe("activeFilterPills (P4.5 S4, D29-49)", () => {
  it("an empty filter state yields no pills", () => {
    expect(activeFilterPills(emptyFilterState(), "feat", vi.fn())).toEqual([]);
  });

  it("one pill per active core dimension: rarity, traits, sourceBook, edition, superseded", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      rarity: new Set(["rare", "unique"]),
      traits: { include: new Set(["fire"]), exclude: new Set(["agile"]) },
      sourceBook: new Set(["Player Core"]),
      edition: new Set(["remaster"]),
      superseded: true,
    };
    const pills = activeFilterPills(state, "feat", vi.fn());
    const keys = pills.map((p) => p.key).sort();
    expect(keys).toEqual(["edition", "rarity", "sourceBook", "superseded", "traits"]);
    const traitsPill = pills.find((p) => p.key === "traits");
    expect(traitsPill?.label).toContain("fire");
    expect(traitsPill?.label).toContain("-agile");
  });

  it("a level range filter yields exactly one 'level' pill", () => {
    const state = setLevelRange(emptyFilterState(), { min: 1, max: 5 });
    const pills = activeFilterPills(state, "feat", vi.fn());
    expect(pills.map((p) => p.key)).toEqual(["level"]);
    expect(pills[0]?.label).toContain("1");
    expect(pills[0]?.label).toContain("5");
  });

  it("query/sort never surface a pill (they stay visible in the header, not the drawer)", () => {
    const state: BrowseFilterState = { ...emptyFilterState(), query: "drag", sort: "level" };
    expect(activeFilterPills(state, "feat", vi.fn())).toEqual([]);
  });

  it("a derived facet.enum selection (scoped to the category's own facetKeysFor allowlist) yields one pill", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["actionCost", new Set(["1", "reaction"])]]),
    };
    const pills = activeFilterPills(state, "feat", vi.fn());
    expect(pills.map((p) => p.key)).toEqual(["f.actionCost"]);
    expect(pills[0]?.label.toLowerCase()).toContain("action cost");
  });

  it("a facetEnum selection for a key NOT in the current category's allowlist is ignored (stale/hostile-URL posture)", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      facetEnum: new Map([["notARealFacetForFeat", new Set(["x"])]]),
    };
    expect(activeFilterPills(state, "feat", vi.fn())).toEqual([]);
  });

  it("each pill's onRemove clears exactly its own dimension, leaving every other active dimension untouched", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      rarity: new Set(["rare"]),
      edition: new Set(["remaster"]),
    };
    let latest = state;
    const onChange = (updater: (prev: BrowseFilterState) => BrowseFilterState) => {
      latest = updater(latest);
    };
    const pills = activeFilterPills(state, "feat", onChange);
    const rarityPill = pills.find((p) => p.key === "rarity");
    rarityPill?.onRemove();
    expect(latest.rarity.size).toBe(0);
    expect(latest.edition).toEqual(new Set(["remaster"])); // untouched
  });

  it("removing the 'superseded' pill only flips the boolean, no other field", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      superseded: true,
      rarity: new Set(["rare"]),
    };
    let latest = state;
    const onChange = (updater: (prev: BrowseFilterState) => BrowseFilterState) => {
      latest = updater(latest);
    };
    const pills = activeFilterPills(state, "feat", onChange);
    pills.find((p) => p.key === "superseded")?.onRemove();
    expect(latest.superseded).toBe(false);
    expect(latest.rarity).toEqual(new Set(["rare"]));
  });
});
