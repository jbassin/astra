// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (see `vitest.config.ts`'s own
// comment on why a global widen-to-jsdom broke an unrelated file under
// `vp run -r test`'s full concurrent run) — this file renders real
// interactive React components via `@testing-library/react` and genuinely
// needs a DOM, so it opts in per-file instead.

import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IndexRow } from "@/schema/entity";
import type { EntityPageData } from "@/server/entityPageData";

import { BrowseListing } from "./BrowseListing";
import { emptyFilterState, type BrowseFilterState } from "./filterEngine";
import { searchToFilterState, withEntryPreserved, type BrowseSearch } from "./urlState";

// jsdom (pinned 29.1.1, `vitest.config.ts`'s own environment) doesn't yet
// implement `HTMLDialogElement.showModal()`/`.close()` (real Chromium —
// Playwright's actual test target for the S4 acceptance gates — does) — a
// standard testing-library-era polyfill so `BrowseListing.tsx`'s filter
// drawer can stay idiomatic (real `showModal`/`close`) rather than working
// around a jsdom gap in production code. `open` attribute reflection (used
// by both) already works natively in jsdom.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

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

function entityPageDataFor(sourceRow: IndexRow): EntityPageData {
  return {
    entity: {
      id: sourceRow.id,
      slug: sourceRow.id.split("/")[1] ?? sourceRow.id,
      category: "feat",
      name: sourceRow.name,
      traits: sourceRow.traits,
      source: sourceRow.source,
      edition: sourceRow.edition,
      facets: {},
      body: [],
    } as unknown as EntityPageData["entity"],
    embeds: {},
    knownTraitIds: [],
    embedCapHit: false,
  };
}

/** Forces `window.matchMedia` to report the desktop/split-view breakpoint (or
 * mobile) for the duration of one test — jsdom has no real layout, so the
 * component's click-time `matchMedia` check needs an explicit stand-in. */
function mockSplitViewViewport(isDesktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function Harness({
  entrySlug,
  entryData,
}: {
  entrySlug?: string;
  entryData?: EntityPageData | null;
}) {
  const [search, setSearch] = useState<BrowseSearch>(
    entrySlug !== undefined ? { entry: entrySlug } : {},
  );
  // Mirrors the real route's own `useMemo(() => searchToFilterState(search),
  // [search])` — `state` must be DERIVED from `search`, not a separate
  // constant, else a facet write here would never actually narrow anything.
  const state = searchToFilterState(search);
  return (
    <BrowseListing
      category="feat"
      rows={ROWS}
      state={state}
      entrySlug={search.entry}
      entryData={entryData}
      onStateChange={(updater) => {
        const next = updater(state);
        setSearch((prev) => withEntryPreserved(next, prev));
      }}
      onEntrySelect={(slug) => setSearch((prev) => ({ ...prev, entry: slug }))}
    />
  );
}

/** `EntityRenderPane`'s `<Popover/>` reads `useRouterState` (D29-28) — it
 * needs a real router context to mount at all, same convention
 * `Omnibar.test.tsx` already uses for its own router-dependent island. Only
 * the two tests that actually render entity DATA (and therefore mount
 * `EntityRenderPane`) need this; every other test in this file renders a
 * bare `BrowseListing` with no router context, same as before P4.5 S4. */
function renderWithRouter(component: () => ReactElement) {
  const rootRoute = createRootRoute({ component });
  const router = createRouter({ routeTree: rootRoute });
  return render(<RouterProvider router={router} />);
}

function StatefulHarness() {
  const [state, setState] = useState<BrowseFilterState>(emptyFilterState());
  return (
    <BrowseListing
      category="feat"
      rows={ROWS}
      state={state}
      onStateChange={(updater) => setState((prev) => updater(prev))}
      onEntrySelect={() => {}}
    />
  );
}

describe("BrowseListing (D29-35)", () => {
  it("renders every row and the 'N of M shown' count with no filters active", () => {
    render(<StatefulHarness />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
    expect(screen.getByText("Bravo")).not.toBeNull();
    expect(screen.getByText("Charlie")).not.toBeNull();
  });

  it("does not navigate rows to popovers (D29-28 carried forward — no data-crossref on listing rows)", () => {
    const { container } = render(<StatefulHarness />);
    expect(container.querySelector("[data-crossref]")).toBeNull();
  });

  it("the name quick-filter narrows the visible rows and updates the count", () => {
    render(<StatefulHarness />);
    const input = screen.getByPlaceholderText("Filter by name…");
    fireEvent.change(input, { target: { value: "alph" } });
    expect(screen.getByText("1 of 3 shown")).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
    expect(screen.queryByText("Bravo")).toBeNull();
  });

  it("a filtered-to-zero result shows the empty state with a working clear-filters button", () => {
    render(<StatefulHarness />);
    const input = screen.getByPlaceholderText("Filter by name…");
    fireEvent.change(input, { target: { value: "not-a-real-name" } });
    expect(screen.getByText(/No feat match the current filters/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
  });

  it("superseded visibility changes the 'M' denominator (acceptance C)", () => {
    const withSuperseded: IndexRow[] = [
      ...ROWS,
      row({ id: "feat/delta", name: "Delta", superseded: true }),
    ];
    function SupersededHarness({ superseded }: { superseded: boolean }) {
      const state = { ...emptyFilterState(), superseded };
      return (
        <BrowseListing
          category="feat"
          rows={withSuperseded}
          state={state}
          onStateChange={() => {}}
          onEntrySelect={() => {}}
        />
      );
    }
    const { rerender } = render(<SupersededHarness superseded={false} />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull(); // Delta hidden from both N and M
    rerender(<SupersededHarness superseded={true} />);
    expect(screen.getByText("4 of 4 shown")).not.toBeNull();
  });

  it("level sort orders ascending with the '—' (no-level) row LAST, no letter anchors", () => {
    const state = { ...emptyFilterState(), sort: "level" as const };
    render(
      <BrowseListing
        category="feat"
        rows={ROWS}
        state={state}
        onStateChange={() => {}}
        onEntrySelect={() => {}}
      />,
    );
    const names = screen
      .getAllByRole("link")
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => t !== undefined && t !== "");
    expect(names).toEqual(["Alpha", "Bravo", "Charlie"]); // level 1, 2, then level-less
    expect(screen.queryByLabelText("Jump to letter")).toBeNull();
  });

  it("clicking a trait chip cycles include -> exclude -> neutral and narrows results (via the filter drawer)", () => {
    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const chip = screen.getByRole("button", { name: /fire/ });
    fireEvent.click(chip); // include fire
    expect(screen.getByText("1 of 3 shown")).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
    fireEvent.click(chip); // exclude fire
    expect(screen.getByText("2 of 3 shown")).not.toBeNull();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("collision disambiguation appends source.book (abbreviation-with-fallback, R10/D29-68) when two visible rows share a name", () => {
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
        onEntrySelect={() => {}}
      />,
    );
    const links = screen.getAllByRole("link").map((el) => el.textContent ?? "");
    // "Player Core" -> "PC1", "Secrets of Magic" -> "SoM" (the curated map).
    expect(links.some((t) => t.includes("Heal") && t.includes("(PC1)"))).toBe(true);
    expect(links.some((t) => t.includes("Heal") && t.includes("(SoM)"))).toBe(true);
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
        onEntrySelect={() => {}}
      />,
    );
    // no filter active -> both visible (the "—" bucket stays by default)
    expect(screen.getByText("2 of 2 shown")).not.toBeNull();
  });
});

describe("BrowseListing split view (P4.5 S4, D29-49)", () => {
  afterEach(() => {
    // jsdom has no real `matchMedia` of its own (unlike Playwright's actual
    // Chromium target) — undo the per-test stand-in rather than leaking it
    // into later tests in this file.
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("a desktop-width row click calls onEntrySelect with the row's raw slug (no category prefix), not a full navigation", () => {
    mockSplitViewViewport(true);
    const onEntrySelect = vi.fn();
    render(
      <BrowseListing
        category="feat"
        rows={ROWS}
        state={emptyFilterState()}
        onStateChange={() => {}}
        onEntrySelect={onEntrySelect}
      />,
    );
    const link = screen.getByText("Alpha");
    fireEvent.click(link);
    expect(onEntrySelect).toHaveBeenCalledWith("alpha");
  });

  it("a sub-56rem-viewport row click does NOT call onEntrySelect (mobile: plain full navigation)", () => {
    mockSplitViewViewport(false);
    const onEntrySelect = vi.fn();
    render(
      <BrowseListing
        category="feat"
        rows={ROWS}
        state={emptyFilterState()}
        onStateChange={() => {}}
        onEntrySelect={onEntrySelect}
      />,
    );
    fireEvent.click(screen.getByText("Alpha"));
    expect(onEntrySelect).not.toHaveBeenCalled();
  });

  it("row href is the plain canonical entity URL, and carries ?superseded=1 when the view is widened (adversarial M7)", () => {
    const plain = render(
      <BrowseListing
        category="feat"
        rows={ROWS}
        state={emptyFilterState()}
        onStateChange={() => {}}
        onEntrySelect={() => {}}
      />,
    );
    expect(within(plain.container).getByText("Alpha").closest("a")?.getAttribute("href")).toBe(
      "/feat/alpha",
    );
    plain.unmount();

    const supersededState = { ...emptyFilterState(), superseded: true };
    const widened = render(
      <BrowseListing
        category="feat"
        rows={ROWS}
        state={supersededState}
        onStateChange={() => {}}
        onEntrySelect={() => {}}
      />,
    );
    expect(within(widened.container).getByText("Alpha").closest("a")?.getAttribute("href")).toBe(
      "/feat/alpha?superseded=1",
    );
    widened.unmount();
  });

  it("renders the selected entry's full entity body in the right pane (SSR-provable deep-link content)", async () => {
    const alpha = ROWS[0] as IndexRow;
    renderWithRouter(() => <Harness entrySlug="alpha" entryData={entityPageDataFor(alpha)} />);
    // The entity render pane shows the entity's own header (name appears
    // again — once in the listing row, once in the entity page's own H1).
    // `RouterProvider` resolves its initial match asynchronously (same
    // convention `Omnibar.test.tsx` uses), so the first query is a `find*`.
    await screen.findByText("Open full page →");
    const headings = screen.getAllByText("Alpha");
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it("a facet change preserves `entry` (adversarial B3) — clicking a trait chip does not deselect the right pane", async () => {
    const alpha = ROWS[0] as IndexRow;
    renderWithRouter(() => <Harness entrySlug="alpha" entryData={entityPageDataFor(alpha)} />);
    const filtersButton = await screen.findByRole("button", { name: /^Filters/ });
    fireEvent.click(filtersButton);
    const chip = screen.getByRole("button", { name: /agile/ });
    fireEvent.click(chip); // include "agile" -> filters Alpha OUT of the visible list
    // Alpha is no longer in the filtered listing, but the right pane still
    // renders it — the fail-soft "not shown under current filters" case, not
    // a silent deselect.
    expect(screen.getByText(/isn.t shown under the current filters/)).not.toBeNull();
  });

  it("an unresolvable/unknown `entry` slug shows the not-found message, listing intact", () => {
    render(<Harness entrySlug="zzz-unknown-slug" entryData={null} />);
    expect(screen.getByText(/wasn.t found/)).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull(); // listing renders normally
  });

  it("no entry selected renders the placeholder, not an error", () => {
    render(<Harness />);
    expect(screen.getByText("Select a row to preview it here.")).not.toBeNull();
  });
});

describe("BrowseListing active-filter pills + drawer (P4.5 S4, D29-49)", () => {
  it("no pills render with an empty filter state", () => {
    render(<StatefulHarness />);
    expect(screen.queryByLabelText("Active filters")).toBeNull();
  });

  it("an active facet selection renders a removable pill, and 'Clear all' clears it", () => {
    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /fire/ }));
    expect(screen.getByLabelText("Active filters")).not.toBeNull();
    expect(screen.getByText("1 of 3 shown")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    expect(screen.queryByLabelText("Active filters")).toBeNull();
  });

  it("the drawer contains the unmodified FacetPanel (aside) and opening it never mutates state", () => {
    render(<StatefulHarness />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(document.querySelector("dialog .codex-facet-panel")).not.toBeNull();
    // no filter got applied just by opening the drawer.
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
  });
});
