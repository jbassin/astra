// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (see `vitest.config.ts`'s own
// comment on why a global widen-to-jsdom broke an unrelated file under
// `vp run -r test`'s full concurrent run) — this file renders real
// interactive React components via `@testing-library/react` and genuinely
// needs a DOM, so it opts in per-file instead.

import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
      onEntryPreview={(slug) => setSearch((prev) => ({ ...prev, entry: slug }))}
      onSupersededReveal={(superseded) =>
        setSearch((prev) => ({ ...prev, superseded: superseded || undefined }))
      }
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

/** jsdom (pinned 29.1.1) has no `ResizeObserver` at all — this is a
 * capture-the-callback stand-in (same "polyfill only what jsdom is missing,
 * keep production code idiomatic" posture as the `showModal` polyfill
 * above), letting a test manually fire a fake `contentRect.width` to drive
 * `useNarrowListingContainer` (`BrowseListing.tsx`) without a real layout
 * engine — jsdom does no layout at all, so there's no other way to exercise
 * the container-width branch. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  trigger(width: number): void {
    this.callback(
      [{ contentRect: { width } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

/** P13 S2 (D29-123) — the reactive counterpart to `mockSplitViewViewport`:
 * that helper is a STATIC stand-in (no `change` events ever fire), fine for
 * every pre-P13 click-time `matchMedia` read, but `useTwoColumnFilterTier`
 * (`BrowseListing.tsx`) needs a `MediaQueryList` that can actually FIRE a
 * `change` event mid-test to exercise "tier-crossing while open closes the
 * panel" — jsdom has no real `matchMedia` at all (same gap
 * `mockSplitViewViewport`'s own comment documents), so this is a
 * capture-the-listener stand-in, same posture as `FakeResizeObserver` above. */
class FakeMediaQueryList {
  matches: boolean;
  media = "";
  private readonly listeners: Array<(e: MediaQueryListEvent) => void> = [];
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: string, cb: (e: MediaQueryListEvent) => void): void {
    this.listeners.push(cb);
  }
  removeEventListener(_type: string, cb: (e: MediaQueryListEvent) => void): void {
    const i = this.listeners.indexOf(cb);
    if (i !== -1) this.listeners.splice(i, 1);
  }
  trigger(matches: boolean): void {
    this.matches = matches;
    for (const cb of this.listeners) cb({ matches } as MediaQueryListEvent);
  }
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
      onEntryPreview={() => {}}
      onSupersededReveal={(superseded) => setState((prev) => ({ ...prev, superseded }))}
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
          onEntryPreview={() => {}}
          onSupersededReveal={() => {}}
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
      />,
    );
    // no filter active -> both visible (the "—" bucket stays by default)
    expect(screen.getByText("2 of 2 shown")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D29-111 (P11 S4, R3, #13/#3e/#3f) — the superseded-reveal control: the
// count-row's "Show N hidden (superseded) →"/"Hide superseded ←" toggle, and
// the all-superseded empty-state copy for the 10 real-corpus categories with
// zero non-superseded rows (e.g. /doctrine).
// ---------------------------------------------------------------------------

describe("BrowseListing: superseded-reveal control (D29-111)", () => {
  it("renders no reveal control at all when the category has no superseded rows", () => {
    render(<StatefulHarness />);
    expect(screen.queryByText(/hidden \(superseded\)/)).toBeNull();
    expect(screen.queryByText("Hide superseded")).toBeNull();
  });

  it("superseded off, hidden > 0 -> 'Show N hidden (superseded) →'; clicking it reveals the rows", () => {
    const withSuperseded: IndexRow[] = [
      ...ROWS,
      row({ id: "feat/delta", name: "Delta", superseded: true }),
      row({ id: "feat/echo", name: "Echo", superseded: true }),
    ];
    function Fixture() {
      const [state, setState] = useState<BrowseFilterState>(emptyFilterState());
      return (
        <BrowseListing
          category="feat"
          rows={withSuperseded}
          state={state}
          onStateChange={(updater) => setState((prev) => updater(prev))}
          onEntrySelect={() => {}}
          onEntryPreview={() => {}}
          onSupersededReveal={(superseded) => setState((prev) => ({ ...prev, superseded }))}
        />
      );
    }
    render(<Fixture />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    const reveal = screen.getByRole("button", { name: /Show 2 hidden \(superseded\)/ });
    expect(screen.queryByText("Delta")).toBeNull();
    fireEvent.click(reveal);
    expect(screen.getByText("5 of 5 shown")).not.toBeNull();
    expect(screen.getByText("Delta")).not.toBeNull();
    expect(screen.getByText("Echo")).not.toBeNull();
    // widened -> the control flips to the reverse-direction link.
    expect(screen.getByRole("button", { name: "Hide superseded ←" })).not.toBeNull();
    expect(screen.queryByText(/Show 2 hidden/)).toBeNull();
  });

  it("clicking 'Hide superseded ←' narrows back", () => {
    const withSuperseded: IndexRow[] = [
      ...ROWS,
      row({ id: "feat/delta", name: "Delta", superseded: true }),
    ];
    function Fixture() {
      const [state, setState] = useState<BrowseFilterState>({
        ...emptyFilterState(),
        superseded: true,
      });
      return (
        <BrowseListing
          category="feat"
          rows={withSuperseded}
          state={state}
          onStateChange={(updater) => setState((prev) => updater(prev))}
          onEntrySelect={() => {}}
          onEntryPreview={() => {}}
          onSupersededReveal={(superseded) => setState((prev) => ({ ...prev, superseded }))}
        />
      );
    }
    render(<Fixture />);
    expect(screen.getByText("4 of 4 shown")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide superseded ←" }));
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    expect(screen.queryByText("Delta")).toBeNull();
  });

  it("all rows superseded (the all-superseded empty state, e.g. /doctrine): distinct copy from the ordinary empty category, plus its own reveal control", () => {
    const allSuperseded: IndexRow[] = [
      row({ id: "doctrine/a", name: "A", superseded: true }),
      row({ id: "doctrine/b", name: "B", superseded: true }),
    ];
    function Fixture() {
      const [state, setState] = useState<BrowseFilterState>(emptyFilterState());
      return (
        <BrowseListing
          category="doctrine"
          rows={allSuperseded}
          state={state}
          onStateChange={(updater) => setState((prev) => updater(prev))}
          onEntrySelect={() => {}}
          onEntryPreview={() => {}}
          onSupersededReveal={(superseded) => setState((prev) => ({ ...prev, superseded }))}
        />
      );
    }
    render(<Fixture />);
    expect(screen.getByText("All 2 entries here are superseded (legacy).")).not.toBeNull();
    expect(screen.queryByText("Nothing in this category yet.")).toBeNull();
    // the empty-state's own CTA (distinct element from the header bar's copy
    // of the same control — both present, `getAllByRole` not `getByRole`).
    const reveals = screen.getAllByRole("button", { name: /Show 2 hidden \(superseded\)/ });
    expect(reveals.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(reveals[0] as HTMLElement);
    expect(screen.getByText("A")).not.toBeNull();
    expect(screen.getByText("B")).not.toBeNull();
  });

  it("a genuinely empty category (zero rows, superseded or not) keeps the plain 'Nothing in this category yet.' copy", () => {
    render(
      <BrowseListing
        category="feat"
        rows={[]}
        state={emptyFilterState()}
        onStateChange={() => {}}
        onEntrySelect={() => {}}
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
      />,
    );
    expect(screen.getByText("Nothing in this category yet.")).not.toBeNull();
    expect(screen.queryByText(/superseded \(legacy\)/)).toBeNull();
  });

  it("hiddenCountOverride wins over the locally-computed count while present (the P9 SSR-window pending case)", () => {
    render(
      <BrowseListing
        category="feat"
        rows={ROWS} // no superseded rows locally
        hiddenCountOverride={7}
        state={emptyFilterState()}
        onStateChange={() => {}}
        onEntrySelect={() => {}}
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
      />,
    );
    expect(screen.getByText(/Show 7 hidden \(superseded\)/)).not.toBeNull();
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
      />,
    );
    const link = screen.getByText("Alpha");
    // `detail: 1` — a REAL mouse click (jsdom/RTL's `fireEvent.click`
    // defaults `detail` to 0 unless told otherwise, indistinguishable from
    // a keyboard-triggered activation click without this — see the
    // `detail === 0` test right below, which exercises exactly that other
    // branch, D29-82's own "Enter is native link activation" case).
    fireEvent.click(link, { detail: 1 });
    expect(onEntrySelect).toHaveBeenCalledWith("alpha");
  });

  it("P8 S3 (D29-82) — a KEYBOARD-triggered click (detail: 0, e.g. Enter on a focused row) does NOT call onEntrySelect — native link activation opens the full page instead of the split-view preview", () => {
    mockSplitViewViewport(true);
    const onEntrySelect = vi.fn();
    render(
      <BrowseListing
        category="feat"
        rows={ROWS}
        state={emptyFilterState()}
        onStateChange={() => {}}
        onEntrySelect={onEntrySelect}
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
      />,
    );
    const link = screen.getByText("Alpha").closest("a") as HTMLAnchorElement;
    // Real browsers set `detail: 0` on a keyboard-activated (Enter/Space)
    // click, vs >= 1 for a genuine mouse click — the one reliable signal
    // `handleRowClick` uses to let Enter through to native navigation
    // rather than intercepting it into the split-view preview (spec's own
    // "no separate Enter handler").
    fireEvent.click(link, { detail: 0 });
    expect(onEntrySelect).not.toHaveBeenCalled();
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Alpha"), { detail: 1 }); // a real mouse click
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
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
        onEntryPreview={() => {}}
        onSupersededReveal={() => {}}
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
    // P13 S2 (D29-123) — "opening... preserves `?entry=`... closing restores
    // the still-selected preview": no `matchMedia` mock is installed in this
    // describe block, so `isTwoColumnTier` reads its SSR-safe default
    // (`true`) — the pane occupies the entry-pane cell while open, hiding
    // the preview WITHOUT touching `entry` at all; close it (the pane's own
    // ✕) to prove the selection survived underneath the whole time.
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
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
  afterEach(() => {
    // P13 S2 (D29-123) — undo any per-test `matchMedia` stand-in rather than
    // leaking it into later tests (only the row-click-closes-the-pane case
    // below installs one, but a thrown assertion mid-test would otherwise
    // skip an inline cleanup line).
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("no pills render with an empty filter state", () => {
    render(<StatefulHarness />);
    expect(screen.queryByLabelText("Active filters")).toBeNull();
  });

  it("an active facet selection renders a removable pill, and the pill row's 'Clear all' clears it", () => {
    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /fire/ }));
    expect(screen.getByLabelText("Active filters")).not.toBeNull();
    expect(screen.getByText("1 of 3 shown")).not.toBeNull();
    // P13 S2 (D29-123) — DELIBERATELY CHANGED PIN: "Clear all" is no longer
    // unique — the pane header (D29-124) carries its OWN "Clear all" too.
    // Close the pane (the Filters toggle) first, disambiguating back down
    // to the pills row's own button, exactly like a real user would (they
    // can't see two "Clear all"s at once either — only one container is
    // ever live, D29-123's own "exactly one container" pin).
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    expect(screen.queryByLabelText("Active filters")).toBeNull();
  });

  it("P13 S2 (D29-123) — DELIBERATELY CHANGED PIN: the pane (not a <dialog>) carries the unmodified FacetPanel on the two-column tier, and opening it never mutates state", () => {
    render(<StatefulHarness />);
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    // No `matchMedia` mock in this describe block -> `isTwoColumnTier` reads
    // its SSR-safe default (`true`) -> the pane, not the dialog, is the live
    // container (D29-123's own "two-column tier" branch) — the OLD pin here
    // was `document.querySelector("dialog .codex-facet-panel")`.
    expect(document.querySelector(".codex-filter-pane .codex-facet-panel")).not.toBeNull();
    expect(document.querySelector("dialog .codex-facet-panel")).toBeNull();
    // no filter got applied just by opening the pane.
    expect(screen.getByText("3 of 3 shown")).not.toBeNull();
  });

  it("P13 S2 (D29-123) — the Filters button toggles aria-expanded and returns to it on close", () => {
    render(<StatefulHarness />);
    const filtersButton = screen.getByRole("button", { name: /^Filters/ });
    expect(filtersButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(filtersButton);
    expect(filtersButton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(filtersButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(filtersButton); // D29-123: close -> focus returns to the Filters button
  });

  it("P13 S2 (D29-123) — opening focuses the pane's ✕ button", () => {
    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close filters" }));
  });

  it("P13 S2 (D29-123) — row click while filtering closes the pane and shows that entry's preview", () => {
    mockSplitViewViewport(true);
    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(document.querySelector(".codex-filter-pane")).not.toBeNull();
    fireEvent.click(screen.getByText("Alpha"), { detail: 1 });
    expect(document.querySelector(".codex-filter-pane")).toBeNull();
  });

  it("P13 S2 (D29-123) — the focus-after-mount effect never steals focus from an open pane", () => {
    render(<StatefulHarness />);
    // Focus a row first (so the focus-after-mount effect has a persisted
    // `focusedSlug` to act on), then open the pane and change a facet — a
    // facet toggle changes `visible`/`virtualRows`, which is exactly the
    // dependency this effect used to re-fire on unconditionally.
    fireEvent.keyDown(document, { key: "j" });
    const alpha = screen.getByText("Alpha").closest("a");
    expect(document.activeElement).toBe(alpha);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const closeButton = screen.getByRole("button", { name: "Close filters" });
    expect(document.activeElement).toBe(closeButton); // opening moved focus here
    fireEvent.click(screen.getByRole("button", { name: /fire/ })); // narrows `visible` -> would re-fire the guarded effect
    expect(document.activeElement).toBe(closeButton); // still here — never yanked back onto a row
  });
});

describe("BrowseListing pane-swap tier-cross (P13 S2, D29-123)", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("tier-crossing while open closes the panel", () => {
    const mql = new FakeMediaQueryList(true);
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
    render(<StatefulHarness />);
    const filtersButton = screen.getByRole("button", { name: /^Filters/ });
    fireEvent.click(filtersButton);
    expect(document.querySelector(".codex-filter-pane")).not.toBeNull();
    act(() => {
      mql.trigger(false); // window narrows below the split-view breakpoint
    });
    expect(filtersButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".codex-filter-pane")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P8 S1 (D29-78) — the table register: sortable headers, aria-sort on the
// <th> (never the button), the jump strip/letter-header removal (already
// covered above by the pre-existing "no letter anchors" assertion — the
// table register makes that unconditionally true now, not just under level
// sort), and the container-driven FULL/COMPACT collapse.
// ---------------------------------------------------------------------------

describe("BrowseListing: sortable column headers (D29-78 acceptance gate C)", () => {
  it("renders a real <table> with column headers, no Sort <select> anywhere", () => {
    render(<StatefulHarness />);
    expect(document.querySelector("table.codex-listing-table")).not.toBeNull();
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Lvl" })).not.toBeNull();
  });

  it("Name defaults to aria-sort=ascending (the implicit default order)", () => {
    render(<StatefulHarness />);
    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    expect(nameHeader.getAttribute("aria-sort")).toBe("ascending");
  });

  it("aria-sort lives on the <th>, never the inner <button>", () => {
    render(<StatefulHarness />);
    const button = screen.getByRole("button", { name: "Lvl" });
    expect(button.getAttribute("aria-sort")).toBeNull();
    expect(button.tagName).toBe("BUTTON");
  });

  it("clicking a sortable header cycles asc -> desc -> back to the name-asc default; missing-last holds under BOTH directions", () => {
    render(<StatefulHarness />);
    const rowNames = () =>
      screen
        .getAllByRole("link")
        .map((el) => el.textContent?.trim())
        .filter((t): t is string => t !== undefined && t !== "");

    fireEvent.click(screen.getByRole("button", { name: "Lvl" }));
    expect(rowNames()).toEqual(["Alpha", "Bravo", "Charlie"]); // 1, 2, level-less LAST
    expect(screen.getByRole("columnheader", { name: /Lvl/ }).getAttribute("aria-sort")).toBe(
      "ascending",
    );

    fireEvent.click(screen.getByRole("button", { name: "Lvl" }));
    expect(rowNames()).toEqual(["Bravo", "Alpha", "Charlie"]); // 2, 1 — REVERSED, level-less STILL last
    expect(screen.getByRole("columnheader", { name: /Lvl/ }).getAttribute("aria-sort")).toBe(
      "descending",
    );

    fireEvent.click(screen.getByRole("button", { name: "Lvl" }));
    expect(rowNames()).toEqual(["Alpha", "Bravo", "Charlie"]); // back to name-asc default
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
  });

  it("clicking a DIFFERENT column always starts fresh at ascending (not mid-cycle)", () => {
    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Lvl" }));
    fireEvent.click(screen.getByRole("button", { name: "Lvl" })); // now -level (desc)
    fireEvent.click(screen.getByRole("button", { name: "Actions" })); // switch column
    expect(screen.getByRole("columnheader", { name: /Actions/ }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
  });

  it("the alphabet jump strip and letter section headers are gone unconditionally (not just under level sort)", () => {
    render(<StatefulHarness />);
    expect(screen.queryByLabelText("Jump to letter")).toBeNull();
    expect(document.querySelector(".codex-listing-letter")).toBeNull();
    expect(document.querySelector(".codex-listing-alpha")).toBeNull();
  });
});

describe("BrowseListing: container-driven FULL/COMPACT column collapse (D29-78)", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    FakeResizeObserver.instances = [];
  });

  it("a narrow container (< 600px, e.g. the real 416px split-pane width) collapses to Name/Lvl/Source only", () => {
    FakeResizeObserver.instances = [];
    (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
      FakeResizeObserver;
    render(<StatefulHarness />);
    // Full set first (no width reported yet — the SSR/pre-measurement default).
    expect(screen.getByRole("columnheader", { name: /Actions/ })).not.toBeNull();

    act(() => {
      FakeResizeObserver.instances[0]?.trigger(416);
    });

    expect(screen.getByRole("columnheader", { name: "Name" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: /Lvl/ })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Source" })).not.toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Actions/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Type/ })).toBeNull();
    // Rows themselves still render (just fewer cells) — Alpha/Bravo/Charlie
    // all present, nothing dropped from the row SET, only the column set.
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("widening back past 600px restores the full column set", () => {
    FakeResizeObserver.instances = [];
    (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
      FakeResizeObserver;
    render(<StatefulHarness />);
    act(() => {
      FakeResizeObserver.instances[0]?.trigger(416);
    });
    expect(screen.queryByRole("columnheader", { name: /Actions/ })).toBeNull();
    act(() => {
      FakeResizeObserver.instances[0]?.trigger(900);
    });
    expect(screen.getByRole("columnheader", { name: /Actions/ })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P8 S3 (D29-82) — j/k real-focus browsing, the debounced+replace preview
// commit, the input/dialog/narrow-container guards, and the desktop-only
// hint line.
// ---------------------------------------------------------------------------

function PreviewHarness({
  onEntryPreview,
}: {
  onEntryPreview: (slug: string) => void;
}): ReactElement {
  const [search, setSearch] = useState<BrowseSearch>({});
  const state = searchToFilterState(search);
  return (
    <BrowseListing
      category="feat"
      rows={ROWS}
      state={state}
      entrySlug={search.entry}
      onStateChange={(updater) => {
        const next = updater(state);
        setSearch((prev) => withEntryPreserved(next, prev));
      }}
      onEntrySelect={(slug) => setSearch((prev) => ({ ...prev, entry: slug }))}
      onEntryPreview={onEntryPreview}
      onSupersededReveal={(superseded) =>
        setSearch((prev) => ({ ...prev, superseded: superseded || undefined }))
      }
    />
  );
}

describe("BrowseListing keyboard nav + hint (D29-82)", () => {
  afterEach(() => {
    vi.useRealTimers();
    // P13 S2 (D29-123) — undo any per-test `matchMedia` stand-in
    // (`mockSplitViewViewport`) rather than leaking it into later tests in
    // this describe block, same convention `BrowseListing split view`'s own
    // afterEach documents.
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("j moves focus onto the first row anchor, then the next; k moves back", () => {
    render(<PreviewHarness onEntryPreview={() => {}} />);
    const alpha = screen.getByText("Alpha").closest("a");
    const bravo = screen.getByText("Bravo").closest("a");
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(bravo);
    fireEvent.keyDown(document, { key: "k" });
    expect(document.activeElement).toBe(alpha);
  });

  it("j/k clamp at the first/last row rather than wrapping or moving off the ends", () => {
    render(<PreviewHarness onEntryPreview={() => {}} />);
    const alpha = screen.getByText("Alpha").closest("a");
    const charlie = screen.getByText("Charlie").closest("a");
    fireEvent.keyDown(document, { key: "k" }); // nothing focused yet -> lands on the first row
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(document, { key: "k" }); // already first -> stays
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(charlie);
    fireEvent.keyDown(document, { key: "j" }); // already last -> stays
    expect(document.activeElement).toBe(charlie);
  });

  it("guard: j/k are inert while a form control (e.g. the quick-filter input) has focus", () => {
    render(<PreviewHarness onEntryPreview={() => {}} />);
    const input = screen.getByPlaceholderText("Filter by name…");
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(input); // unchanged — "j" was free to type
  });

  // P13 S2 (D29-123) — DELIBERATELY CHANGED PIN, meaning preserved: "j/k
  // inert while focus is in filter UI" now covers BOTH live containers
  // (`FILTER_UI_SELECTOR`, `BrowseListing.tsx`), not just a `<dialog>` — no
  // `matchMedia` mock here means `isTwoColumnTier` defaults `true`, so the
  // live container is the PANE (`.codex-filter-pane`, no "Done" button
  // there — that's sheet-only, D29-124), and the close button (always
  // present in both variants) is the stand-in focus target instead of the
  // old sheet-only "Done".
  it("guard: j/k are inert while focus sits inside the open filter pane", () => {
    render(<PreviewHarness onEntryPreview={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const closeButton = screen.getByRole("button", { name: "Close filters" });
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(closeButton); // no row anchor stole focus
  });

  it("guard: j/k are inert while focus sits inside the open filter SHEET <dialog> (narrow tier)", () => {
    mockSplitViewViewport(false); // forces the narrow tier -> the sheet, not the pane
    render(<PreviewHarness onEntryPreview={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const doneButton = screen.getByRole("button", { name: "Done" });
    doneButton.focus();
    expect(document.activeElement).toBe(doneButton);
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(doneButton); // no row anchor stole focus
  });

  it("preview-follows-focus: commits `?entry=` via onEntryPreview only after a settle window, once per settle (not once per keypress)", () => {
    vi.useFakeTimers();
    const onEntryPreview = vi.fn();
    render(<PreviewHarness onEntryPreview={onEntryPreview} />);
    act(() => {
      fireEvent.keyDown(document, { key: "j" }); // -> Alpha
    });
    act(() => {
      vi.advanceTimersByTime(100); // < 180ms settle — not yet committed
    });
    expect(onEntryPreview).not.toHaveBeenCalled();
    act(() => {
      fireEvent.keyDown(document, { key: "j" }); // -> Bravo, resets the settle timer
    });
    act(() => {
      vi.advanceTimersByTime(100); // still < 180ms since the LAST keypress
    });
    expect(onEntryPreview).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100); // now past 180ms since the last (Bravo) focus
    });
    // Exactly ONE commit, for the LAST focused row only (Bravo, not Alpha).
    expect(onEntryPreview).toHaveBeenCalledTimes(1);
    expect(onEntryPreview).toHaveBeenCalledWith("bravo");
  });

  it("a 10-row j-scan settles to exactly one onEntryPreview call (the history-length-unchanged gate's own precondition)", () => {
    vi.useFakeTimers();
    const onEntryPreview = vi.fn();
    render(<PreviewHarness onEntryPreview={onEntryPreview} />);
    act(() => {
      // Only 3 real rows exist in the fixture, but holding "j" past the last
      // row clamps in place — still exactly one settle-commit, never one
      // per keypress, regardless of how many of the 10 presses actually
      // moved focus.
      for (let i = 0; i < 10; i++) fireEvent.keyDown(document, { key: "j" });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onEntryPreview).toHaveBeenCalledTimes(1);
    expect(onEntryPreview).toHaveBeenCalledWith("charlie"); // clamped at the last row
  });

  it("the hint line renders desktop-only text right of the count line", () => {
    render(<PreviewHarness onEntryPreview={() => {}} />);
    expect(screen.getByText("Ctrl+K search · j/k browse · enter open")).not.toBeNull();
  });

  it("the hint line is hidden under the same narrow-container condition as the compact column set", () => {
    FakeResizeObserver.instances = [];
    (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
      FakeResizeObserver;
    render(<PreviewHarness onEntryPreview={() => {}} />);
    expect(screen.getByText("Ctrl+K search · j/k browse · enter open")).not.toBeNull();
    act(() => {
      FakeResizeObserver.instances[0]?.trigger(416);
    });
    expect(screen.queryByText("Ctrl+K search · j/k browse · enter open")).toBeNull();
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    FakeResizeObserver.instances = [];
  });
});
