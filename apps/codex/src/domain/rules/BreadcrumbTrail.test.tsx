// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" — this renders real React
// components via `@testing-library/react`, same per-file opt-in as
// `RulesTree.test.tsx`.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BreadcrumbTrail } from "./BreadcrumbTrail";

describe("BreadcrumbTrail (P4 S3, D29-41)", () => {
  it("renders book -> ancestors -> self, in order", () => {
    render(
      <BreadcrumbTrail
        book="Gamemastery Guide"
        ancestors={[
          { name: "Chapter 2: Tools", id: "rules/chapter-2-tools" },
          { name: "Building Creatures", id: "rules/building-creatures@legacy" },
        ]}
        currentName="Ability Modifiers"
      />,
    );
    const items = screen.getAllByRole("listitem").map((el) => el.textContent);
    expect(items).toEqual([
      "Gamemastery Guide",
      "Chapter 2: Tools",
      "Building Creatures",
      "Ability Modifiers",
    ]);
  });

  it("a root doc (no ancestors) renders its own trail head: book -> self only", () => {
    render(
      <BreadcrumbTrail book="Gamemastery Guide" ancestors={[]} currentName="Chapter 2: Tools" />,
    );
    const items = screen.getAllByRole("listitem").map((el) => el.textContent);
    expect(items).toEqual(["Gamemastery Guide", "Chapter 2: Tools"]);
  });

  it("the book segment is never a link", () => {
    render(<BreadcrumbTrail book="Player Core" ancestors={[]} currentName="Tools of Play" />);
    const book = screen.getByText("Player Core");
    expect(book.tagName).not.toBe("A");
  });

  it("an id-bearing ancestor links to its own doc page", () => {
    render(
      <BreadcrumbTrail
        book="Gamemastery Guide"
        ancestors={[{ name: "Chapter 2: Tools", id: "rules/chapter-2-tools" }]}
        currentName="Building Creatures"
      />,
    );
    const link = screen.getByRole("link", { name: "Chapter 2: Tools" });
    expect(link.getAttribute("href")).toBe("/rules/chapter-2-tools");
  });

  it("a synthetic (no-id) ancestor renders as plain text, never a link", () => {
    render(
      <BreadcrumbTrail
        book="Player Core"
        ancestors={[{ name: "Chapter 1: Introduction" }, { name: "What is a Roleplaying Game?" }]}
        currentName="Tools of Play"
      />,
    );
    const synthetic = screen.getByText("Chapter 1: Introduction");
    expect(synthetic.tagName).not.toBe("A");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("the current (self) item is always plain text and marked aria-current", () => {
    render(
      <BreadcrumbTrail
        book="Gamemastery Guide"
        ancestors={[{ name: "Chapter 2: Tools", id: "rules/chapter-2-tools" }]}
        currentName="Building Creatures"
      />,
    );
    const current = screen.getByText("Building Creatures");
    expect(current.tagName).not.toBe("A");
    expect(current.closest("li")?.getAttribute("aria-current")).toBe("page");
  });
});
