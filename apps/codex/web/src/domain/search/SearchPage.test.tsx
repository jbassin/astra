// @vitest-environment jsdom
//
// The filter-only-search regression test. `/pagefind/pagefind.js`
// genuinely doesn't exist in this test environment (no `data/`), so `loadPagefind()`'s real fail-soft path always resolves `null` and
// there's no way to OBSERVE which argument reaches `pf.search` without
// mocking the module — unlike `Omnibar.test.tsx` (which never needs to,
// since it only ever asserts the fail-soft-disabled-input UI). `SearchPage`
// takes `search`/`onSearchChange` as plain props (no router context needed),
// so it mounts directly.
//
// `filterCountsFixture` (below) is the per-test knob for `pf.filters()`'s
// resolved value, so the facet-rendering describe block can drive `SearchPage`'s shared-primitive sections with arbitrary
// counts without a second mock setup.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const searchSpy = vi.fn().mockResolvedValue({ results: [] });
let filterCountsFixture: Record<string, Record<string, number>> = {};

vi.mock("./pagefindClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pagefindClient")>();
  return {
    ...actual,
    loadPagefind: () =>
      Promise.resolve({
        search: searchSpy,
        filters: () => Promise.resolve(filterCountsFixture),
      }),
  };
});

import { SearchPage } from "./SearchPage";

afterEach(() => {
  searchSpy.mockClear();
  filterCountsFixture = {};
});

describe("SearchPage filter-only search", () => {
  it("passes null (not empty string) to pf.search when the query is empty but a filter is set", async () => {
    render(<SearchPage search={{ traits: "fire" }} onSearchChange={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    const [term, options] = searchSpy.mock.calls[0] as [
      string | null,
      { filters?: Record<string, string[]> },
    ];
    expect(term).toBeNull();
    expect(options.filters?.traits).toEqual(["fire"]);
  });

  it("still passes the real query string when non-empty", async () => {
    render(<SearchPage search={{ q: "fireball" }} onSearchChange={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    const [term] = searchSpy.mock.calls[0] as [string | null];
    expect(term).toBe("fireball");
  });

  it("never calls pf.search when neither a query nor a filter is set", async () => {
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    // Give the debounce+effect window a chance to fire, then assert it didn't.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(searchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SearchPage renders its facet sections through the SAME shared primitives
// `FacetPanel.tsx` uses (`facetControls.tsx`), fed Pagefind's own
// `filterCounts` as data. What these tests pin:
//   - Rarity RANK-orders common/uncommon/rare/unique (not raw-key
//     alphabetical) — `sortOptionsFor`'s general "rarity" dimension
//     exception applies here too.
//   - Edition gets the shared icon+VISIBLE-text label.
//   - Level and Category keep numeric / raw-key order respectively, via an
//     explicit `comparator` passed to the shared `sortOptionsFor`.
//   - The Superseded control uses the same one-line muted caption
//     `FacetPanel.tsx`'s own control uses, not a loud blue callout; the
//     toggle writes `superseded` via `onSearchChange`, with no
//     scroll-behavior concern on this un-paned layout.
// ---------------------------------------------------------------------------

function sectionFor(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const section = heading.closest("section");
  if (!section) throw new Error(`no <section> ancestor for "${title}"`);
  return section;
}

/** A `.codex-toggle-chip`/checkbox-row option's OWN label text — read from
 * the FIRST direct child (text node or element), never a bare
 * `.textContent` (which would also pick up a nested count/code span where
 * one exists) — same idiom `FacetPanel.test.tsx`'s own Source-group tests
 * use for the identical reason. */
function chipLabels(section: HTMLElement): string[] {
  return [...section.querySelectorAll(".codex-toggle-chip")].map(
    (el) => el.childNodes[0]?.textContent ?? "",
  );
}

function checkboxLabels(section: HTMLElement): string[] {
  return [...section.querySelectorAll(".codex-facet-option-label")].map(
    (el) => el.textContent ?? "",
  );
}

describe("SearchPage facet sections via the shared primitives", () => {
  it("Level sorts NUMERICALLY (-2..28), not lexically — the comparator seam `sortOptionsFor` needed for this facet", async () => {
    // >CHIP_MAX_OPTIONS(8) options -> checkbox rows, not chips; lexical
    // order would read "-2","0","1","10","2","20","28","3","5","7" (string
    // sort) — numeric order is the pin under test.
    filterCountsFixture = {
      level: {
        "10": 1,
        "-2": 1,
        "2": 1,
        "0": 1,
        "20": 1,
        "1": 1,
        "3": 1,
        "5": 1,
        "7": 1,
        "28": 1,
      },
    };
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Level")).not.toBeNull());
    const labels = checkboxLabels(sectionFor("Level"));
    expect(labels).toEqual(["-2", "0", "1", "2", "3", "5", "7", "10", "20", "28"]);
  });

  it("Rarity rank-orders common/uncommon/rare/unique — a DELIBERATE pin change (was raw-key alphabetical: common/rare/uncommon/unique)", async () => {
    filterCountsFixture = { rarity: { rare: 1, unique: 1, common: 1, uncommon: 1 } };
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Rarity")).not.toBeNull());
    expect(chipLabels(sectionFor("Rarity"))).toEqual(["Common", "Uncommon", "Rare", "Unique"]);
  });

  it("Category keeps its pre-existing raw-key locale order via an explicit comparator, labels stay humanized once (displayCategoryName, not double-humanized)", async () => {
    filterCountsFixture = { category: { spell: 1, "creature-ability": 1, feat: 1 } };
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Category")).not.toBeNull());
    expect(chipLabels(sectionFor("Category"))).toEqual(["Creature Ability", "Feat", "Spell"]);
  });

  it("Edition renders BOTH the icon and the VISIBLE Remaster/Legacy text — a pin change (was icon-only)", async () => {
    filterCountsFixture = { edition: { remaster: 3, legacy: 2 } };
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Edition")).not.toBeNull());
    const directText = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("");
    const labels = [...sectionFor("Edition").querySelectorAll(".codex-edition-option-label")].map(
      directText,
    );
    expect(labels).toContain("Remaster");
    expect(labels).toContain("Legacy");
  });

  it("Traits still renders every option with no comparator override (raw-value order, unchanged)", async () => {
    filterCountsFixture = { traits: { fire: 1, cold: 1, magical: 1 } };
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Traits")).not.toBeNull());
    expect(chipLabels(sectionFor("Traits"))).toEqual(["cold", "fire", "magical"]);
  });
});

describe("SearchPage Superseded control — shared muted caption", () => {
  it("uses the shared muted caption, not the old loud blue callout", async () => {
    render(<SearchPage search={{}} onSearchChange={() => {}} />);
    await screen.findByLabelText("Include superseded content");
    expect(document.querySelector(".codex-callout-blue")).toBeNull();
    expect(document.querySelector(".codex-facet-superseded-explainer")).toBeNull();
    expect(document.querySelector(".codex-facet-superseded-caption")).not.toBeNull();
  });

  it("toggling the checkbox still writes `superseded` through onSearchChange — the reveal BEHAVIOR is unchanged by the restyle", async () => {
    const onSearchChange = vi.fn();
    render(<SearchPage search={{}} onSearchChange={onSearchChange} />);
    const checkbox = await screen.findByLabelText("Include superseded content");
    fireEvent.click(checkbox);
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    const updater = onSearchChange.mock.calls[0]![0] as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(updater({})).toEqual({ superseded: true });
  });
});
