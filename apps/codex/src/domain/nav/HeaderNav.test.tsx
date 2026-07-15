// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (`vitest.config.ts`); this file
// needs a real DOM + `@testing-library/react`, so it opts into jsdom
// per-file (same convention as `Omnibar.test.tsx`/`legacyToggle.test.ts`).
// `HeaderNav` renders only plain `<a>`/`<button>` — no router hook — so a
// bare `render()` needs no `RouterProvider` wrapper (unlike `Omnibar`).
//
// This is the render/keyboard UNIT coverage; the full production-build
// Playwright sweep (real click/hover, no-JS fetch, the Ctrl+K singleton
// across BOTH the header Omnibar and the landing hero search) is the S2
// acceptance gate proper — see the session report.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeaderNav } from "./HeaderNav";
import { allNavCategories } from "./navData";

describe("HeaderNav (D29-47)", () => {
  it("renders every one of the 88 nav-assigned categories as a real <a href>", () => {
    render(<HeaderNav />);
    for (const category of allNavCategories()) {
      const expectedHref = `/${category}`;
      const anchors = screen
        .getAllByRole("menuitem")
        .filter((el) => (el as HTMLAnchorElement).getAttribute("href") === expectedHref);
      const directLink =
        category === "rules" ? screen.queryByRole("link", { name: "Rules" }) : null;
      expect(
        anchors.length > 0 || directLink !== null,
        `"${category}" (${expectedHref}) has no rendered anchor`,
      ).toBe(true);
    }
  });

  it("the Rules split control renders a plain link AND a separate caret trigger, in that tab order", () => {
    render(<HeaderNav />);
    const link = screen.getByRole("link", { name: "Rules" });
    const caret = screen.getByRole("button", { name: "Rules categories" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/rules");
    expect(caret.tagName).toBe("BUTTON");
    // link precedes caret in the DOM (and therefore in tab order).
    expect(link.compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Sources renders as a bare direct link, no caret/dropdown", () => {
    render(<HeaderNav />);
    const link = screen.getByRole("link", { name: "Sources" });
    expect(link.getAttribute("href")).toBe("/sources");
    expect(screen.queryByRole("button", { name: "Sources categories" })).toBeNull();
  });

  it("a dropdown trigger opens on click and shows its panel", () => {
    render(<HeaderNav />);
    const trigger = screen.getByRole("button", { name: "Player" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("Enter on a dropdown trigger opens the panel and focuses the first item", () => {
    render(<HeaderNav />);
    const trigger = screen.getByRole("button", { name: "Spells" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // "Spells" -> spell/ritual/domain/tradition; the first tail category
    // (`navData.ts`'s own order) is "spell" -> humanized "Spell".
    const firstItem = screen.getByRole("menuitem", { name: "Spell" });
    expect(document.activeElement).toBe(firstItem);
  });

  it("ArrowDown on the trigger opens and focuses the first item; ArrowDown again moves to the second", () => {
    render(<HeaderNav />);
    const trigger = screen.getByRole("button", { name: "Setting" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const first = screen.getByRole("menuitem", { name: "Deity" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = screen.getByRole("menuitem", { name: "Deity Category" });
    expect(document.activeElement).toBe(second);
  });

  it("Escape from within an open panel closes it and returns focus to the trigger", () => {
    render(<HeaderNav />);
    const trigger = screen.getByRole("button", { name: "Equipment" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const first = screen.getByRole("menuitem", { name: "Equipment" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("Escape on the trigger itself (panel not yet opened via keyboard) is a no-op close, refocuses trigger", () => {
    render(<HeaderNav />);
    const trigger = screen.getByRole("button", { name: "GM" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("the Rules caret follows the same keyboard contract as a plain dropdown trigger", () => {
    render(<HeaderNav />);
    const caret = screen.getByRole("button", { name: "Rules categories" });
    caret.focus();
    fireEvent.keyDown(caret, { key: "ArrowDown" });
    expect(caret.getAttribute("aria-expanded")).toBe("true");
    const firstTailItem = screen.getByRole("menuitem", { name: "Condition" });
    expect(document.activeElement).toBe(firstTailItem);
    fireEvent.keyDown(firstTailItem, { key: "Escape" });
    expect(caret.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(caret);
  });
});
