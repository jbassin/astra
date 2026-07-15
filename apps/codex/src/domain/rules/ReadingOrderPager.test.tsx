// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReadingOrderPager } from "./ReadingOrderPager";

describe("ReadingOrderPager (P4 S3, D29-41)", () => {
  it("renders nothing at all when both ends are absent (a single-doc book, one-sided at BOTH ends)", () => {
    const { container } = render(<ReadingOrderPager />);
    expect(container.firstChild).toBeNull();
  });

  it("book head: only `next` renders, no `prev` link", () => {
    render(
      <ReadingOrderPager
        next={{ id: "rules/building-creatures@legacy", name: "Building Creatures" }}
      />,
    );
    expect(screen.getByRole("link", { name: /Building Creatures/ })).not.toBeNull();
    expect(screen.queryByText(/Previous/)).toBeNull();
  });

  it("book tail: only `prev` renders, no `next` link", () => {
    render(
      <ReadingOrderPager
        prev={{ id: "rules/building-creatures@legacy", name: "Building Creatures" }}
      />,
    );
    expect(screen.getByRole("link", { name: /Building Creatures/ })).not.toBeNull();
    expect(screen.queryByText(/Next/)).toBeNull();
  });

  it("both prev and next link to their own /{id}", () => {
    render(
      <ReadingOrderPager
        prev={{ id: "rules/chapter-2-tools", name: "Chapter 2: Tools" }}
        next={{ id: "rules/ability-modifiers-2", name: "Ability Modifiers" }}
      />,
    );
    expect(screen.getByRole("link", { name: /Chapter 2: Tools/ }).getAttribute("href")).toBe(
      "/rules/chapter-2-tools",
    );
    expect(screen.getByRole("link", { name: /Ability Modifiers/ }).getAttribute("href")).toBe(
      "/rules/ability-modifiers-2",
    );
  });

  it("a superseded target carries the Legacy edition pill (the legacy toggle does NOT re-chain the pager)", () => {
    render(
      <ReadingOrderPager
        next={{
          id: "rules/building-creatures@legacy",
          name: "Building Creatures",
          superseded: true,
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /Building Creatures/ });
    expect(link.textContent).toContain("Legacy");
  });

  it("a non-superseded target carries no edition pill", () => {
    render(<ReadingOrderPager next={{ id: "rules/counteracting-2", name: "Counteracting" }} />);
    const link = screen.getByRole("link", { name: /Counteracting/ });
    expect(link.textContent).not.toContain("Legacy");
  });
});
