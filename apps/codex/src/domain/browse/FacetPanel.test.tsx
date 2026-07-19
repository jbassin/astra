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
//
// P13 S1 (D29-122/125-127/130) — DELIBERATELY CHANGED PINS from the P11 era,
// enumerated here (see the S1 build record for the full list):
//   - the "Filter source"/"Filter traits" `TypeAheadInput` placeholders die,
//     replaced by `OptionSearch`'s "Search <section>…" family — AND
//     `OptionSearch` only renders (as a magnifier BUTTON first) once a
//     section clears `OPTION_SEARCH_THRESHOLD` (20) options, so the old
//     2-row Source/Traits fixtures are WIDENED here to clear that threshold
//     (below it, D29-125 says no search affordance renders at all — the OLD
//     always-on `TypeAheadInput` pin is obsolete by design, not an oversight).
//   - Rarity's option labels are now Title Case ("Common"/"Uncommon"/"Rare"/
//     "Unique", via `formatFacetValue`) instead of the raw lowercase corpus
//     value — AND Rarity (4 options) now renders as `ToggleChipRow` chips,
//     not `EnumOptionList` checkboxes (`CHIP_MAX_OPTIONS` = 8, D29-126) — so
//     the old `.codex-facet-option-label` selector is replaced with
//     `.codex-toggle-chip`.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IndexRow } from "@/schema/entity";

import { FacetPanel, TRAITS_INITIAL_RENDER_COUNT } from "./FacetPanel";
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
// P13 S1 (D29-125) — OptionSearch: threshold-gated, magnifier-first,
// substring match on BOTH label and raw value.
// ---------------------------------------------------------------------------

/** 22 distinct source books (> `OPTION_SEARCH_THRESHOLD` = 20, so the Source
 * section's `OptionSearch` actually renders) — "Gamemastery Guide"/"Core
 * Rulebook" are kept among them for the label-sort + narrowing assertions
 * (D29-107 a/b's original pins, preserved in spirit). */
const MANY_SOURCE_ROWS: IndexRow[] = [
  row({
    id: "feat/gmg",
    name: "Gmg Feat",
    level: 1,
    source: { book: "Gamemastery Guide", license: "OGL" }, // abbreviates "GMG"
    traits: ["fire", "magical"],
  }),
  row({
    id: "feat/crb",
    name: "Crb Feat",
    level: 2,
    source: { book: "Core Rulebook", license: "ORC" }, // abbreviates "CRB"
    traits: ["cold"],
  }),
  ...Array.from({ length: 20 }, (_, i) =>
    row({
      id: `feat/extra-${i}`,
      name: `Extra Feat ${i}`,
      level: 3,
      source: { book: `Pathfinder #${200 + i}: Filler Volume`, license: "OGL" },
    }),
  ),
];

/** 22 distinct traits (same threshold reasoning as Source above). */
const MANY_TRAIT_ROWS: IndexRow[] = [
  row({ id: "feat/a", name: "A", level: 1, traits: ["fire", "magical"] }),
  row({ id: "feat/b", name: "B", level: 1, traits: ["cold"] }),
  ...Array.from({ length: 20 }, (_, i) =>
    row({ id: `feat/t-${i}`, name: `T ${i}`, traits: [`trait-${i}`] }),
  ),
];

function expandOptionSearch(sectionTitle: string): HTMLInputElement {
  fireEvent.click(screen.getByRole("button", { name: `Search ${sectionTitle}` }));
  return screen.getByPlaceholderText(`Search ${sectionTitle.toLowerCase()}…`);
}

describe("FacetPanel: Source section (D29-107 a/b, D29-125 OptionSearch)", () => {
  it("below the OptionSearch threshold (20), no search affordance renders at all", () => {
    const twoBookRows: IndexRow[] = [
      row({
        id: "feat/gmg",
        name: "Gmg Feat",
        source: { book: "Gamemastery Guide", license: "OGL" },
      }),
      row({ id: "feat/crb", name: "Crb Feat", source: { book: "Core Rulebook", license: "ORC" } }),
    ];
    render(
      <FacetPanel
        category="feat"
        rows={twoBookRows}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Search Source" })).toBeNull();
  });

  it("at/above the threshold, a magnifier button expands to a search input that narrows by the DISPLAYED label", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("GMG")).not.toBeNull();
    expect(screen.getByText("CRB")).not.toBeNull();
    const input = expandOptionSearch("Source");
    fireEvent.change(input, { target: { value: "gmg" } });
    expect(screen.getByText("GMG")).not.toBeNull();
    expect(screen.queryByText("CRB")).toBeNull();
  });

  it("the query also matches the RAW value (a full book title), not just the displayed abbreviation", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const input = expandOptionSearch("Source");
    // "filler volume" appears only in the RAW book title
    // ("Pathfinder #20N: Filler Volume") — the rendered label is the
    // abbreviation ("AP20N"), which does NOT contain this substring, so a
    // match here proves the raw-value fallback fired.
    fireEvent.change(input, { target: { value: "filler volume" } });
    expect(screen.queryByText("GMG")).toBeNull();
    expect(screen.getAllByText(/^AP2\d\d$/).length).toBeGreaterThan(0);
  });

  it("options are ordered by the displayed label, case-insensitively ('CRB' before 'GMG')", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const labels = screen.getAllByText(/^(CRB|GMG)$/).map((el) => el.textContent);
    expect(labels).toEqual(["CRB", "GMG"]);
  });

  it("Esc collapses an expanded search and clears the query", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const input = expandOptionSearch("Source");
    fireEvent.change(input, { target: { value: "gmg" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search source…")).toBeNull();
    // collapsing cleared the query — every option is visible again once
    // re-expanded.
    expandOptionSearch("Source");
    expect(screen.getByText("GMG")).not.toBeNull();
    expect(screen.getByText("CRB")).not.toBeNull();
  });
});

describe("FacetPanel: Traits section (D29-107a, D29-125 OptionSearch, D29-127 restyle)", () => {
  it("at/above the threshold, a magnifier button expands to a search input that narrows the visible trait chips", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_TRAIT_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("fire")).not.toBeNull();
    expect(screen.getByText("cold")).not.toBeNull();
    const input = expandOptionSearch("Traits");
    fireEvent.change(input, { target: { value: "fir" } });
    expect(screen.getByText("fire")).not.toBeNull();
    expect(screen.queryByText("cold")).toBeNull();
  });

  it("renders the tri-state gesture hint line", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_TRAIT_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("click to require · again to exclude · again to reset")).not.toBeNull();
  });

  it("each chip's aria-label encodes its tri-state (plain / required / excluded)", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(["fire"]), exclude: new Set(["cold"]) },
    };
    render(<FacetPanel category="feat" rows={MANY_TRAIT_ROWS} state={state} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "fire — required" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "cold — excluded" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "magical" })).not.toBeNull();
  });

  it("selected (include or exclude) chips render FIRST, ahead of every neutral chip", () => {
    const state: BrowseFilterState = {
      ...emptyFilterState(),
      traits: { include: new Set(["magical"]), exclude: new Set() },
    };
    const { container } = render(
      <FacetPanel category="feat" rows={MANY_TRAIT_ROWS} state={state} onChange={vi.fn()} />,
    );
    const chipTexts = [...container.querySelectorAll(".codex-trait-chip")].map((el) =>
      el.textContent?.replace(/\d+$/, "").trim(),
    );
    expect(chipTexts[0]).toBe("magical");
  });

  it("bounds the initial render to TRAITS_INITIAL_RENDER_COUNT with a 'Show all N' expander, bypassed by a search query", () => {
    const manyTraitRows: IndexRow[] = Array.from({ length: 50 }, (_, i) =>
      row({ id: `feat/mt-${i}`, name: `MT ${i}`, traits: [`unique-trait-${i}`] }),
    );
    const { container } = render(
      <FacetPanel
        category="feat"
        rows={manyTraitRows}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".codex-trait-chips li")).toHaveLength(
      TRAITS_INITIAL_RENDER_COUNT,
    );
    const showAll = screen.getAllByRole("button", { name: /Show all 50/ })[0];
    expect(showAll).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    fireEvent.click(showAll!);
    expect(container.querySelectorAll(".codex-trait-chips li").length).toBeGreaterThanOrEqual(50);
  });
});

describe("FacetPanel: Rarity section (D29-107c rank order + D29-126 chips + D29-122 Title Case)", () => {
  const RARITY_ROWS: IndexRow[] = [
    row({ id: "condition/a", name: "A", rarity: "unique" }),
    row({ id: "condition/b", name: "B", rarity: "common" }),
    row({ id: "condition/c", name: "C", rarity: "rare" }),
    row({ id: "condition/d", name: "D", rarity: "uncommon" }),
  ];

  it("renders as a chip row (≤ CHIP_MAX_OPTIONS), Title Case, in common/uncommon/rare/unique rank order", () => {
    const { container } = render(
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
    expect(section!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    const chips = [...container.querySelectorAll(".codex-facet-section")]
      .find((s) => s.querySelector("h3")?.textContent === "Rarity")
      ?.querySelectorAll(".codex-toggle-chip");
    expect(chips).toBeDefined();
    const labels = [...(chips ?? [])].map((el) => el.textContent?.replace(/\d+$/, "").trim());
    expect(labels).toEqual(["Common", "Uncommon", "Rare", "Unique"]);
  });

  it("chips are real buttons with aria-pressed toggle semantics", () => {
    render(
      <FacetPanel
        category="condition"
        rows={RARITY_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /Common/ });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("FacetPanel: Edition section (D29-126 icon + VISIBLE text)", () => {
  it("renders BOTH the icon and the visible 'Remaster'/'Legacy' text, not icon-only", () => {
    const editionRows: IndexRow[] = [
      row({ id: "feat/r", name: "R", edition: "remaster" }),
      row({ id: "feat/l", name: "L", edition: "legacy" }),
    ];
    const { container } = render(
      <FacetPanel
        category="feat"
        rows={editionRows}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    // Scoped to the label span's OWN direct text-node child — `EditionIcon`'s
    // nested `<svg aria-label>`/`<title>` ALSO carries the word "Remaster"/
    // "Legacy" for screen readers (unchanged, pre-existing), so a plain
    // `.textContent` (which recurses into the svg's own `<title>` text too)
    // would double up to "RemasterRemaster" — the whole point of this test
    // is the NEW visible copy specifically, a direct sibling text node of
    // the icon, not the icon's own accessible name.
    const directText = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("");
    const labels = [...container.querySelectorAll(".codex-edition-option-label")].map(directText);
    expect(labels).toContain("Remaster");
    expect(labels).toContain("Legacy");
  });
});

describe("FacetPanel: derived enum facet humanization + 'Unspecified (N)' (D29-122/126)", () => {
  const CREATURE_ROWS: IndexRow[] = [
    row({ id: "creature/a", name: "A", facets: { size: "med" } }),
    row({ id: "creature/b", name: "B", facets: { size: "lg" } }),
    row({ id: "creature/c", name: "C" }), // no facets at all — the missing-key row
  ];

  it("size renders its labelMap value ('Medium'/'Large'), never the raw Foundry code", () => {
    render(
      <FacetPanel
        category="creature"
        rows={CREATURE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Medium")).not.toBeNull();
    expect(screen.getByText("Large")).not.toBeNull();
    expect(screen.queryByText("med")).toBeNull();
    expect(screen.queryByText("lg")).toBeNull();
  });

  it("the missing-value row renders 'Unspecified (N)', not the old '— without data: N'", () => {
    render(
      <FacetPanel
        category="creature"
        rows={CREATURE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Unspecified (1)")).not.toBeNull();
    expect(screen.queryByText(/without data/)).toBeNull();
  });

  it("a glued-compound itemCategory value ('classfeature') humanizes to 'Class Feature'", () => {
    const featRows: IndexRow[] = [
      row({ id: "feat/a", name: "A", facets: { itemCategory: "classfeature" } }),
      row({ id: "feat/b", name: "B", facets: { itemCategory: "ancestry" } }),
    ];
    render(
      <FacetPanel category="feat" rows={featRows} state={emptyFilterState()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Class Feature")).not.toBeNull();
    expect(screen.queryByText("classfeature")).toBeNull();
  });
});

describe("FacetPanel: custom checkbox styling hook (D29-126) present without removing the real input", () => {
  it("a >8-option enum section (Source) still renders a real <input type=checkbox> per option", () => {
    render(
      <FacetPanel
        category="feat"
        rows={MANY_SOURCE_ROWS}
        state={emptyFilterState()}
        onChange={vi.fn()}
      />,
    );
    const sourceHeading = screen.getByText("Source");
    const section = sourceHeading.closest("section");
    expect(section).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    const checkboxes = within(section!).getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
  });
});
