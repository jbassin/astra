// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (`vitest.config.ts`); this file
// needs a real DOM + `@testing-library/react`, so it opts into jsdom
// per-file (same convention as `legacyToggle.test.ts`).
//
// No mocking of `pagefindClient.loadPagefind` — `/pagefind/pagefind.js`
// genuinely doesn't exist in this test environment (D29-12: no `data/`, no
// built index), so every test here exercises the REAL fail-soft path
// end-to-end. The success-path rendering (grouped type-ahead, keyboard nav
// landing on a real result) is proven against the REAL built index via
// Playwright at the S4 gate — see the session report; `pagefindClient.test.ts`
// covers the grouping/collision/projection logic those renders depend on in
// isolation.

import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetLegacyToggleForTests } from "@/domain/browse/legacyToggle";

import { Omnibar } from "./Omnibar";
import { _resetPagefindClientForTests } from "./pagefindClient";

function renderOmnibar() {
  const rootRoute = createRootRoute({ component: Omnibar });
  const router = createRouter({ routeTree: rootRoute });
  return render(<RouterProvider router={router} />);
}

describe("Omnibar (D29-36)", () => {
  beforeEach(() => {
    _resetLegacyToggleForTests();
    _resetPagefindClientForTests();
  });
  afterEach(() => {
    _resetLegacyToggleForTests();
    _resetPagefindClientForTests();
  });

  it("renders an enabled search input", async () => {
    renderOmnibar();
    const input = (await screen.findByRole("searchbox", {
      name: /search the codex/i,
    })) as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it("Ctrl+K focuses the input (global, SSR-safe listener)", async () => {
    renderOmnibar();
    const input = (await screen.findByRole("searchbox", {
      name: /search the codex/i,
    })) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("fails soft to a disabled input with an explanatory title when the index isn't built", async () => {
    renderOmnibar();
    const input = (await screen.findByRole("searchbox", {
      name: /search the codex/i,
    })) as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(input.disabled).toBe(true));
    expect(input.getAttribute("title")).toBe("Search index not built");
  });

  it("Escape never throws even after focusing (dropdown state exercised)", async () => {
    renderOmnibar();
    const input = await screen.findByRole("searchbox", { name: /search the codex/i });
    fireEvent.focus(input);
    expect(() => fireEvent.keyDown(input, { key: "Escape" })).not.toThrow();
  });
});
