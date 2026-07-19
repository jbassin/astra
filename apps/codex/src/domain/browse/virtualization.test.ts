import { describe, expect, it } from "vitest";

import type { IndexRow } from "@/schema/entity";

import { computeWindowedListing, initialWindowRange, ROW_PITCH_PX } from "./virtualization";

function row(overrides: Partial<IndexRow> & Pick<IndexRow, "id" | "name">): IndexRow {
  return {
    traits: [],
    source: { book: "Test Book", license: "unknown" },
    edition: "remaster",
    superseded: false,
    ...overrides,
  };
}

/** A synthetic, hermetic >60-row fixture (never the real corpus — gate G) —
 * zero-padded names so lexicographic order == numeric order, letting every
 * assertion below check ordering by plain string comparison. */
function manyRows(count: number): IndexRow[] {
  return Array.from({ length: count }, (_, i) =>
    row({
      id: `feat/row-${String(i).padStart(4, "0")}`,
      name: `Row ${String(i).padStart(4, "0")}`,
    }),
  );
}

describe("initialWindowRange (D29-84 — the derived, not asserted, SSR window)", () => {
  it("40 visible rows (960px / 24px) + 20 overscan on EACH side -> exactly [0, 60) for any count >= 60", () => {
    expect(initialWindowRange(60)).toEqual({ startIndex: 0, endIndex: 60 });
    expect(initialWindowRange(8_485)).toEqual({ startIndex: 0, endIndex: 60 });
  });

  it("re-derives (not hardcodes) 60 — the constant IS ROW_PITCH_PX-driven", () => {
    // 40 rows fit in 960px at the pinned 24px pitch; this is the arithmetic
    // proof `endIndex=60` isn't a magic number independent of ROW_PITCH_PX.
    expect(ROW_PITCH_PX).toBe(24);
    expect(40 * ROW_PITCH_PX).toBe(960);
  });

  it("a category smaller than the window returns every row (no windowing needed)", () => {
    expect(initialWindowRange(10)).toEqual({ startIndex: 0, endIndex: 10 });
    expect(initialWindowRange(0)).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it("a count exactly at the visible/overscan boundary (40) still returns everything, no spurious slicing", () => {
    expect(initialWindowRange(40)).toEqual({ startIndex: 0, endIndex: 40 });
  });
});

describe("computeWindowedListing (D29-89 — the loader's SSR-only windowed projection)", () => {
  it("slices exactly the derived window, in ascending name order (the default sort, gate B)", () => {
    const rows = manyRows(200);
    const result = computeWindowedListing("feat", rows, {});
    expect(result.rows).toHaveLength(60);
    expect(result.rows.map((r) => r.name)).toEqual(rows.slice(0, 60).map((r) => r.name));
    expect(result.totalCount).toBe(200);
    expect(result.eligibleCount).toBe(200);
  });

  it("honors a descending sort (?sort=-name) — the window is the LAST 60 names, in descending order", () => {
    const rows = manyRows(200);
    const result = computeWindowedListing("feat", rows, { sort: "-name" });
    const expectedNames = [...rows]
      .map((r) => r.name)
      .sort()
      .reverse()
      .slice(0, 60);
    expect(result.rows.map((r) => r.name)).toEqual(expectedNames);
  });

  it("honors a query filter — totalCount reflects the FILTERED count, not the full corpus", () => {
    const rows = manyRows(200);
    const result = computeWindowedListing("feat", rows, { q: "Row 01" });
    // "Row 01xx" matches rows 0100-0199 (containment, case-insensitive) = 100 rows.
    expect(result.totalCount).toBe(100);
    expect(result.rows).toHaveLength(60);
  });

  it("a category smaller than the window is NOT actually windowed — rows.length === totalCount", () => {
    const rows = manyRows(10);
    const result = computeWindowedListing("feat", rows, {});
    expect(result.rows).toHaveLength(10);
    expect(result.totalCount).toBe(10);
  });

  it("eligibleCount excludes superseded rows by default, includes them under ?superseded=1", () => {
    const rows = [...manyRows(5), row({ id: "feat/legacy", name: "Zzz", superseded: true })];
    const off = computeWindowedListing("feat", rows, {});
    expect(off.eligibleCount).toBe(5);
    const on = computeWindowedListing("feat", rows, { superseded: true });
    expect(on.eligibleCount).toBe(6);
  });

  // D29-111 (P11 S4) — `hiddenCount`: the reveal control's "N hidden" total,
  // fixed per category and INDEPENDENT of the superseded toggle (unlike
  // `eligibleCount` above, which flips meaning with it).
  describe("hiddenCount (D29-111)", () => {
    it("counts every superseded row in the category, regardless of the superseded toggle", () => {
      const rows = [
        ...manyRows(5),
        row({ id: "feat/legacy-a", name: "Zzz A", superseded: true }),
        row({ id: "feat/legacy-b", name: "Zzz B", superseded: true }),
      ];
      const off = computeWindowedListing("feat", rows, {});
      expect(off.hiddenCount).toBe(2);
      const on = computeWindowedListing("feat", rows, { superseded: true });
      expect(on.hiddenCount).toBe(2); // unchanged — a fixed per-category total
    });

    it("is 0 for a category with no superseded rows at all", () => {
      const result = computeWindowedListing("feat", manyRows(5), {});
      expect(result.hiddenCount).toBe(0);
    });

    it("is computed over the FULL row set, not just the windowed slice (a >60-row all-superseded category)", () => {
      // Every row superseded — mirrors the "all N entries here are
      // superseded" empty-state case (e.g. the real corpus's /doctrine),
      // scaled past the 60-row SSR window so a windowed-slice-only count
      // would undercount it.
      const rows = manyRows(90).map((r) => Object.assign(r, { superseded: true }));
      const result = computeWindowedListing("feat", rows, {});
      expect(result.rows).toHaveLength(0); // nothing passes the default superseded-off filter
      expect(result.hiddenCount).toBe(90);
      expect(result.eligibleCount).toBe(0);
    });

    it("a query filter never narrows hiddenCount — it's category-wide, not filtered-view-wide", () => {
      const rows = [
        ...manyRows(5),
        row({ id: "feat/legacy", name: "Superseded Row", superseded: true }),
      ];
      const result = computeWindowedListing("feat", rows, { q: "no-such-substring" });
      expect(result.hiddenCount).toBe(1);
    });
  });

  // P9 S1 — `entryVisible`: found live (a fresh `?entry=` deep link beyond
  // the SSR window incorrectly rendered "isn't shown under the current
  // filters" under NO active filter at all) while verifying this slice
  // against the real corpus; regression-guarded here hermetically.
  it("entryVisible is undefined when no entrySlug is given", () => {
    const result = computeWindowedListing("feat", manyRows(200), {});
    expect(result.entryVisible).toBeUndefined();
  });

  it("entryVisible is true for a row sorted WELL OUTSIDE the SSR window, under no active filter (the live bug)", () => {
    const rows = manyRows(200);
    // "Row 0199" sorts dead last under the default name-ascending order —
    // never in the first-60 window (`result.rows` below), which is exactly
    // the scenario that broke live: a legitimate, unfiltered deep link to a
    // row beyond the window must still read as visible.
    const result = computeWindowedListing("feat", rows, {}, "row-0199");
    expect(result.rows.some((r) => r.id === "feat/row-0199")).toBe(false); // confirms it's OUTSIDE the window
    expect(result.entryVisible).toBe(true);
  });

  it("entryVisible is false for a row genuinely filtered out", () => {
    const rows = manyRows(200);
    const result = computeWindowedListing("feat", rows, { q: "no-such-substring" }, "row-0005");
    expect(result.entryVisible).toBe(false);
  });

  it("entryVisible is false for a slug that doesn't resolve to any row at all", () => {
    const result = computeWindowedListing("feat", manyRows(200), {}, "totally-unknown");
    expect(result.entryVisible).toBe(false);
  });
});
