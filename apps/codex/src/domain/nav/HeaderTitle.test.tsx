// @vitest-environment jsdom
//
// Same jsdom-per-file convention as `Omnibar.test.tsx`/`HeroSearch.test.tsx`
// (a real DOM + a router for `useMatches`/`Link`).

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deriveHeaderTitle, HeaderTitle } from "./HeaderTitle";

describe("deriveHeaderTitle (D29-112, pure — decoupled from useMatches' own big union type)", () => {
  it("an empty match list -> wordmark (null)", () => {
    expect(deriveHeaderTitle([])).toBeNull();
  });

  it("a listing route (/$category/) -> displayCategoryName(params.category)", () => {
    const title = deriveHeaderTitle([{ routeId: "/$category/", params: { category: "feat" } }]);
    expect(title).toBe("Feat");
  });

  it("a listing route resolves the hunters-edge override through displayCategoryName", () => {
    const title = deriveHeaderTitle([
      { routeId: "/$category/", params: { category: "hunters-edge" } },
    ]);
    expect(title).toBe("Hunter's Edge");
  });

  it("a listing route with no category param -> wordmark (defensive, shouldn't happen in practice)", () => {
    expect(deriveHeaderTitle([{ routeId: "/$category/", params: {} }])).toBeNull();
  });

  it("an entity route (/$category/$slug) -> loaderData.entity.name verbatim", () => {
    const title = deriveHeaderTitle([
      {
        routeId: "/$category/$slug",
        loaderData: { entity: { name: "Heal" } },
      },
    ]);
    expect(title).toBe("Heal");
  });

  it("a rules DOC (category === 'rules', same route) needs no special-casing — same field", () => {
    const title = deriveHeaderTitle([
      {
        routeId: "/$category/$slug",
        params: { category: "rules", slug: "tools-of-play" },
        loaderData: { entity: { name: "Tools of Play" } },
      },
    ]);
    expect(title).toBe("Tools of Play");
  });

  it("an entity route with no loaderData yet (in-flight) -> wordmark, never throws", () => {
    expect(deriveHeaderTitle([{ routeId: "/$category/$slug" }])).toBeNull();
    expect(deriveHeaderTitle([{ routeId: "/$category/$slug", loaderData: {} }])).toBeNull();
    expect(
      deriveHeaderTitle([{ routeId: "/$category/$slug", loaderData: { entity: {} } }]),
    ).toBeNull();
  });

  it("the /rules tree-browser route -> the fixed 'Rules' title", () => {
    expect(deriveHeaderTitle([{ routeId: "/rules" }])).toBe("Rules");
  });

  it("landing/search/categories/sources -> wordmark (null)", () => {
    expect(deriveHeaderTitle([{ routeId: "/" }])).toBeNull();
    expect(deriveHeaderTitle([{ routeId: "/search" }])).toBeNull();
    expect(deriveHeaderTitle([{ routeId: "/categories" }])).toBeNull();
    expect(deriveHeaderTitle([{ routeId: "/sources" }])).toBeNull();
  });

  it("only the LEAF match (last in the array) decides the title, not an ancestor", () => {
    const title = deriveHeaderTitle([
      { routeId: "__root__" },
      { routeId: "/$category/", params: { category: "spell" } },
    ]);
    expect(title).toBe("Spell");
  });
});

describe("HeaderTitle (D29-112) — mounted against a real router", () => {
  it("renders the wordmark + its home Link on an ordinary route (e.g. landing)", async () => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: HeaderTitle,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    const wordmark = await screen.findByRole("link", { name: "codex" });
    expect(wordmark.getAttribute("href")).toBe("/");
    expect(screen.queryByRole("img")).toBeNull(); // no home glyph in wordmark mode
  });

  it("resolves a listing route's category param into a visible title + a home glyph link", async () => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const categoryRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "$category",
      component: () => <Outlet />,
    });
    const categoryIndexRoute = createRoute({
      getParentRoute: () => categoryRoute,
      path: "/",
      component: HeaderTitle,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([categoryRoute.addChildren([categoryIndexRoute])]),
      history: createMemoryHistory({ initialEntries: ["/feat"] }),
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Feat")).not.toBeNull();
    const homeGlyph = screen.getByRole("link", { name: "codex home" });
    expect(homeGlyph.getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "codex" })).toBeNull(); // wordmark gone
  });
});
