// @vitest-environment jsdom
//
// P6 R9(c) (D29-61(c)) — the "Must have a value" checkbox is deleted from
// `RangeInputs` outright (not just hidden), since a typed min/max bound now
// implies has-value on its own (`filterEngine.ts`'s bounds-imply-has-value
// rewrite, D29-61(b)). This file is the DOM-assert half of Track C's §5D
// gate ("the checkbox gone from every `FacetPanel` render") — the
// grep-provable half (zero `has-value` references repo-wide) is a plain
// repo-wide grep, not a test. `filterEngine.test.ts` covers the matching
// engine-level half of the gate (a typed bound excluding missing-value
// rows) — this file only proves the UI surface.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IndexRow } from "@/schema/entity";

import { FacetPanel } from "./FacetPanel";
import { emptyFilterState, type BrowseFilterState } from "./filterEngine";

function row(overrides: Partial<IndexRow> & Pick<IndexRow, "id" | "name">): IndexRow {
  return {
    traits: [],
    source: { book: "Test Book", license: "unknown" },
    edition: "remaster",
    superseded: false,
    ...overrides,
  };
}

// A level-bearing category so `LevelSection` (a `RangeInputs` consumer)
// actually renders — `categoryHasLevelCoverage` requires at least one row
// carrying `level`.
const ROWS: IndexRow[] = [
  row({ id: "feat/alpha", name: "Alpha", level: 1 }),
  row({ id: "feat/bravo", name: "Bravo" }), // no level — the missing-key row
];

function renderPanel(state: BrowseFilterState = emptyFilterState()) {
  return render(<FacetPanel category="feat" rows={ROWS} state={state} onChange={vi.fn()} />);
}

describe("FacetPanel range widgets — no 'Must have a value' checkbox anywhere (D29-61(c))", () => {
  it("renders the Level range inputs with zero checkboxes in that section", () => {
    renderPanel();
    const levelHeading = screen.getByText("Level");
    const section = levelHeading.closest("section");
    expect(section).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(section!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("never renders the deleted checkbox's label text, empty or filled range", () => {
    renderPanel();
    expect(screen.queryByText(/must have a value/i)).toBeNull();

    const filled: BrowseFilterState = { ...emptyFilterState(), level: { min: 0, max: 5 } };
    renderPanel(filled);
    expect(screen.queryByText(/must have a value/i)).toBeNull();
  });

  it("never renders the deleted checkbox's CSS hook class", () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll(".codex-facet-has-value")).toHaveLength(0);
  });

  it("min/max inputs stay present and editable with no separate gate control", () => {
    renderPanel();
    expect(screen.getByLabelText("minimum")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("maximum")).toBeInstanceOf(HTMLInputElement);
  });
});

// ---------------------------------------------------------------------------
// P11 S2 (D29-107) — filter-dialog usability: type-ahead inputs (Traits +
// Source), Source label-sorted, Rarity rank-sorted.
// ---------------------------------------------------------------------------

const MULTI_SOURCE_ROWS: IndexRow[] = [
  row({
    id: "feat/alpha",
    name: "Alpha",
    level: 1,
    source: { book: "Gamemastery Guide", license: "OGL" }, // abbreviates "GMG"
    traits: ["fire", "magical"],
  }),
  row({
    id: "feat/bravo",
    name: "Bravo",
    level: 2,
    source: { book: "Core Rulebook", license: "ORC" }, // abbreviates "CRB"
    traits: ["cold"],
  }),
];

const RARITY_ROWS: IndexRow[] = [
  row({ id: "condition/a", name: "A", rarity: "unique" }),
  row({ id: "condition/b", name: "B", rarity: "common" }),
  row({ id: "condition/c", name: "C", rarity: "rare" }),
  row({ id: "condition/d", name: "D", rarity: "uncommon" }),
];

describe("FacetPanel: Source section (D29-107 a/b)", () => {
  it("renders a type-ahead input, and typing narrows the visible options by the DISPLAYED label", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MULTI_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Filter source");
    expect(screen.getByText("GMG")).not.toBeNull();
    expect(screen.getByText("CRB")).not.toBeNull();
    fireEvent.change(input, { target: { value: "gmg" } });
    expect(screen.getByText("GMG")).not.toBeNull();
    expect(screen.queryByText("CRB")).toBeNull();
  });

  it("options are ordered by the displayed label, case-insensitively ('CRB' before 'GMG')", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MULTI_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const labels = screen.getAllByText(/^(CRB|GMG)$/).map((el) => el.textContent);
    expect(labels).toEqual(["CRB", "GMG"]);
  });
});

describe("FacetPanel: Traits section (D29-107a)", () => {
  it("renders a type-ahead input, and typing narrows the visible trait chips", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MULTI_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Filter traits");
    expect(screen.getByText("fire")).not.toBeNull();
    expect(screen.getByText("cold")).not.toBeNull();
    fireEvent.change(input, { target: { value: "fir" } });
    expect(screen.getByText("fire")).not.toBeNull();
    expect(screen.queryByText("cold")).toBeNull();
  });
});

describe("FacetPanel: Rarity section (D29-107c — rank-sorted, never a whitelist)", () => {
  it("renders rarity options in common/uncommon/rare/unique order regardless of row order", () => {
    render(
      <FacetPanel
        category="condition"
        rows={RARITY_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const rarityHeading = screen.getByText("Rarity");
    const section = rarityHeading.closest("section");
    expect(section).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    const labels = [...section!.querySelectorAll(".codex-facet-option-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["common", "uncommon", "rare", "unique"]);
  });
});
