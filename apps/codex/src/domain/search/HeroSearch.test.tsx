// @vitest-environment jsdom
//
// Same jsdom-per-file convention as `Omnibar.test.tsx` (a real DOM + a
// router for `useNavigate`). Like that file, queries use `findByRole` (not
// `getByRole`) for the FIRST lookup after render — `RouterProvider`'s initial
// match/load resolves asynchronously, so a synchronous query races it.

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroSearch } from "./HeroSearch";
import { _resetPagefindClientForTests } from "./pagefindClient";

function renderHeroSearch() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HeroSearch,
  });
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/search",
    component: () => <div>search page</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, searchRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return { ...render(<RouterProvider router={router} />), router };
}

describe("HeroSearch (D29-47, adversarial M3)", () => {
  it("renders a search box distinct from the Omnibar (no codex-omnibar-input class)", async () => {
    _resetPagefindClientForTests();
    renderHeroSearch();
    const input = await screen.findByRole("searchbox", { name: /search the codex/i });
    expect(input.className).not.toContain("codex-omnibar-input");
  });

  it("registers NO global Ctrl/Cmd-K document keydown listener", async () => {
    _resetPagefindClientForTests();
    renderHeroSearch();
    const input = (await screen.findByRole("searchbox", {
      name: /search the codex/i,
    })) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    // Unlike the Omnibar, Ctrl+K must NOT focus this input.
    expect(document.activeElement).not.toBe(input);
  });

  it("submitting a query navigates to /search?q=...", async () => {
    _resetPagefindClientForTests();
    const { router } = renderHeroSearch();
    const input = await screen.findByRole("searchbox", { name: /search the codex/i });
    fireEvent.change(input, { target: { value: "fireball" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.state.location.pathname).toBe("/search");
    expect(router.state.location.search).toEqual({ q: "fireball" });
  });

  it("submitting an empty query still navigates to /search with no q param", async () => {
    _resetPagefindClientForTests();
    const { router } = renderHeroSearch();
    const input = await screen.findByRole("searchbox", { name: /search the codex/i });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.state.location.pathname).toBe("/search");
    expect(router.state.location.search).toEqual({});
  });
});
