// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (`vitest.config.ts`'s own
// comment) — this file renders real interactive React components via
// `@testing-library/react` and genuinely needs a DOM, so it opts in
// per-file, same as `BrowseListing.test.tsx`.

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { RulesTreeBook, TreeNode } from "@/schema/rulesTree";

import { RulesTree } from "./RulesTree";

function node(overrides: Partial<TreeNode> & Pick<TreeNode, "name">): TreeNode {
  return { children: [], ...overrides };
}

function book(overrides: Partial<RulesTreeBook> & Pick<RulesTreeBook, "book">): RulesTreeBook {
  return { edition: "remaster", license: "ORC", hiddenWhenLegacyOff: 0, nodes: [], ...overrides };
}

// Mirrors the real GMG "Chapter 2: Tools" shape: a fully-superseded parent
// wrapping one never-remastered (visible) child.
const GMG_LIKE: RulesTreeBook = book({
  book: "Gamemastery Guide",
  edition: "legacy",
  license: "OGL",
  hiddenWhenLegacyOff: 2,
  nodes: [
    node({
      name: "Chapter 2: Tools",
      id: "rules/chapter-2-tools",
      superseded: true,
      children: [
        node({
          name: "Building Creatures",
          id: "rules/building-creatures@legacy",
          superseded: true,
        }),
        node({ name: "Item Quirks", id: "rules/item-quirks" }),
      ],
    }),
  ],
});

const FULLY_HIDDEN_BOOK: RulesTreeBook = book({
  book: "Dark Archive",
  edition: "legacy",
  license: "OGL",
  hiddenWhenLegacyOff: 2,
  nodes: [
    node({ name: "Root A", id: "rules/da-a", superseded: true }),
    node({ name: "Root B", id: "rules/da-b", superseded: true }),
  ],
});

const SYNTHETIC_ROOT_BOOK: RulesTreeBook = book({
  book: "Player Core",
  nodes: [
    node({
      name: "Chapter 1: Introduction",
      children: [node({ name: "Tools of Play", id: "rules/tools-of-play" })],
    }),
  ],
});

describe("RulesTree (D29-40)", () => {
  // Collapse state persists to REAL localStorage, keyed only on node id/path
  // (no per-test namespacing) — clear it before every test so one test's
  // expand/collapse click can't leak into the next's initial render.
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders every book name (abbreviation-with-fallback, R10/D29-68) + edition/license pills", () => {
    render(<RulesTree books={[GMG_LIKE]} superseded={false} />);
    // "Gamemastery Guide" curates to "GMG" — the heading shows the
    // abbreviation, the full name stays available via `title`.
    const heading = screen.getByText("GMG");
    expect(heading).not.toBeNull();
    expect(heading.getAttribute("title")).toBe("Gamemastery Guide");
    // "Legacy" appears twice: the book-level edition pill AND the root
    // node's own superseded pill (GMG_LIKE's root doc is itself superseded).
    expect(screen.getAllByText("Legacy").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("OGL")).not.toBeNull();
  });

  it("an unknown-license book renders the explicit unknown pill, never blank", () => {
    render(
      <RulesTree
        books={[book({ book: "Some Foundry-Only Book", license: "unknown" })]}
        superseded={false}
      />,
    );
    expect(screen.getByText("License unknown")).not.toBeNull();
  });

  it("a synthetic (no-id) node renders as plain text, never a link", () => {
    render(<RulesTree books={[SYNTHETIC_ROOT_BOOK]} superseded={true} />);
    const synthetic = screen.getByText("Chapter 1: Introduction");
    expect(synthetic.tagName).not.toBe("A");
  });

  it("a real (id-bearing) node renders as a link to /{category}/{slug}", () => {
    render(<RulesTree books={[GMG_LIKE]} superseded={true} />);
    const link = screen.getByRole("link", { name: "Chapter 2: Tools" });
    expect(link.getAttribute("href")).toBe("/rules/chapter-2-tools");
  });

  it("root nodes render collapsed by default (children hidden until toggled)", () => {
    render(<RulesTree books={[GMG_LIKE]} superseded={true} />);
    expect(screen.queryByText("Item Quirks")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Toggle Chapter 2: Tools" });
    fireEvent.click(toggle);
    expect(screen.getByText("Item Quirks")).not.toBeNull();
    expect(screen.getByText("Building Creatures")).not.toBeNull();
  });

  it(
    "superseded=false: a superseded parent survives as a wrapper down to its one " +
      "never-remastered child, but the superseded sibling is pruned",
    () => {
      render(<RulesTree books={[GMG_LIKE]} superseded={false} />);
      // the wrapper root still renders (it's the path to a visible child)
      const toggle = screen.getByRole("button", { name: "Toggle Chapter 2: Tools" });
      fireEvent.click(toggle);
      expect(screen.getByText("Item Quirks")).not.toBeNull();
      expect(screen.queryByText("Building Creatures")).toBeNull();
      expect(screen.getByText("2 hidden")).not.toBeNull();
    },
  );

  it("a fully-superseded book renders as a collapsed 'all N hidden' header, never silently dropped", () => {
    render(<RulesTree books={[FULLY_HIDDEN_BOOK]} superseded={false} />);
    // "Dark Archive" curates to "DA" (R10/D29-68).
    expect(screen.getByText("DA")).not.toBeNull();
    expect(screen.getByText("all 2 hidden")).not.toBeNull();
    expect(screen.queryByText("Root A")).toBeNull();
    expect(screen.queryByText("Root B")).toBeNull();
  });

  it("superseded=true shows the fully-superseded book's normal tree, no hidden note", () => {
    render(<RulesTree books={[FULLY_HIDDEN_BOOK]} superseded={true} />);
    expect(screen.getByText("Root A")).not.toBeNull();
    expect(screen.getByText("Root B")).not.toBeNull();
    expect(screen.queryByText(/hidden/)).toBeNull();
  });

  it("the name quick-filter narrows to matches with their ancestor chain force-open", () => {
    render(<RulesTree books={[GMG_LIKE]} superseded={true} />);
    // not filtered yet -> Item Quirks isn't rendered (collapsed by default)
    expect(screen.queryByText("Item Quirks")).toBeNull();
    const input = screen.getByPlaceholderText("Filter rules by name…");
    fireEvent.change(input, { target: { value: "item quirks" } });
    // the ancestor chain force-opens: the match is now visible with no click
    expect(screen.getByText("Item Quirks")).not.toBeNull();
    expect(screen.getByText("Chapter 2: Tools")).not.toBeNull(); // ancestor kept
    expect(screen.queryByText("Building Creatures")).toBeNull(); // non-matching sibling pruned
  });

  it("collapse state persists across a re-render (localStorage round-trip)", () => {
    const { unmount } = render(<RulesTree books={[GMG_LIKE]} superseded={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Chapter 2: Tools" }));
    expect(screen.getByText("Item Quirks")).not.toBeNull();
    unmount();
    render(<RulesTree books={[GMG_LIKE]} superseded={true} />);
    // a fresh mount re-seeds from localStorage in its mount effect
    expect(screen.getByText("Item Quirks")).not.toBeNull();
  });
});
