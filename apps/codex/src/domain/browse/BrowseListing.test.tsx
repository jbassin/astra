// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (see `vitest.config.ts`'s own
// comment on why a global widen-to-jsdom broke an unrelated file under
// `vp run -r test`'s full concurrent run) — this file renders real
// interactive React components via `@testing-library/react` and genuinely
// needs a DOM, so it opts in per-file instead.

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { IndexRow } from "@/schema/entity";

import { BrowseListing } from "./BrowseListing";
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

const ROWS: IndexRow[] = [
  row({ id: "feat/alpha", name: "Alpha", level: 1, traits: ["fire"], facets: { actionCost: "1" } }),
  row({
    id: "feat/bravo",
    name: "Bravo",
    level: 2,
    traits: ["agile"],
    facets: { actionCost: "reaction" },
  }),
  row({ id: "feat/charlie", name: "Charlie" }), // no level, no facets
];

function Harness() {
  const [state, setState] = useState<BrowseFilterState>(emptyFilterState());
  return (
    <BrowseListing
      category="feat"
      rows={ROWS}
      state={state}
      onStateChange={(updater) => setState((prev) => updater(prev))}
    />
  );
}

describe("BrowseListing (D29-35)", () => {
  it("renders every row and the 'N of M shown' count with no filters active", () => {
    render(<Harness />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
    expect(screen.getByText("Bravo")).not.toBeNull();
    expect(screen.getByText("Charlie")).not.toBeNull();
  });

  it("does not navigate rows to popovers (D29-28 carried forward — no data-crossref on listing rows)", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector("[data-crossref]")).toBeNull();
  });

  it("the name quick-filter narrows the visible rows and updates the count", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("Filter by name…");
    fireEvent.change(input, { target: { value: "alph" } });
    expect(screen.getByText("1 of 3 shown")).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
    expect(screen.queryByText("Bravo")).toBeNull();
  });

  it("a filtered-to-zero result shows the empty state with a working clear-filters button", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("Filter by name…");
    fireEvent.change(input, { target: { value: "not-a-real-name" } });
    expect(screen.getByText(/No feat match the current filters/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
  });

  it("legacy toggle changes the 'M' denominator (acceptance C)", () => {
    const withSuperseded: IndexRow[] = [
      ...ROWS,
      row({ id: "feat/delta", name: "Delta", superseded: true }),
    ];
    function LegacyHarness({ legacy }: { legacy: boolean }) {
      const state = { ...emptyFilterState(), legacy };
      return (
        <BrowseListing
          category="feat"
          rows={withSuperseded}
          state={state}
          onStateChange={() => {}}
        />
      );
    }
    const { rerender } = render(<LegacyHarness legacy={false} />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull(); // Delta hidden from both N and M
    rerender(<LegacyHarness legacy={true} />);
    expect(screen.getByText("4 of 4 shown")).not.toBeNull();
  });

  it("level sort orders ascending with the '—' (no-level) row LAST, no letter anchors", () => {
    const state = { ...emptyFilterState(), sort: "level" as const };
    render(<BrowseListing category="feat" rows={ROWS} state={state} onStateChange={() => {}} />);
    const names = screen
      .getAllByRole("link")
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => t !== undefined && t !== "");
    expect(names).toEqual(["Alpha", "Bravo", "Charlie"]); // level 1, 2, then level-less
    expect(screen.queryByLabelText("Jump to letter")).toBeNull();
  });

  it("clicking a trait chip cycles include -> exclude -> neutral and narrows results", () => {
    render(<Harness />);
    const chip = screen.getByRole("button", { name: /fire/ });
    fireEvent.click(chip); // include fire
    expect(screen.getByText("1 of 3 shown")).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
    fireEvent.click(chip); // exclude fire
    expect(screen.getByText("2 of 3 shown")).not.toBeNull();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("collision disambiguation appends source.book when two visible rows share a name", () => {
    const collidingRows: IndexRow[] = [
      row({ id: "feat/one", name: "Heal", source: { book: "Player Core", license: "ORC" } }),
      row({ id: "feat/two", name: "Heal", source: { book: "Secrets of Magic", license: "OGL" } }),
    ];
    render(
      <BrowseListing
        category="feat"
        rows={collidingRows}
        state={emptyFilterState()}
        onStateChange={() => {}}
      />,
    );
    const links = screen.getAllByRole("link").map((el) => el.textContent ?? "");
    expect(links.some((t) => t.includes("Heal") && t.includes("(Player Core)"))).toBe(true);
    expect(links.some((t) => t.includes("Heal") && t.includes("(Secrets of Magic)"))).toBe(true);
  });

  it("a range facet with a missing-key row stays visible until the range is actively narrowed", () => {
    const ancestryRows: IndexRow[] = [
      row({ id: "ancestry/a", name: "A", facets: { hp: 8 } }),
      row({ id: "ancestry/b", name: "B" }), // no facets at all
    ];
    render(
      <BrowseListing
        category="ancestry"
        rows={ancestryRows}
        state={emptyFilterState()}
        onStateChange={() => {}}
      />,
    );
    // no filter active -> both visible (the "—" bucket stays by default)
    expect(screen.getByText("2 of 2 shown")).not.toBeNull();
  });
});
