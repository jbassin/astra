// @vitest-environment jsdom
//
// Same jsdom-per-file convention as `HeaderTitle.test.tsx` (a real DOM + a
// router). `slugFromPathname` is pure/decoupled (mirrors `HeaderTitle.tsx`'s
// own `deriveHeaderTitle` split) so most of this file needs no router mount
// at all; the last describe block mounts `DefaultNotFoundComponent` against
// a route-tree-free synthetic router (see that block's own comment on why
// the REAL `getRouter()` route tree can't be exercised bare-vitest).

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DefaultNotFoundComponent, getRouter, slugFromPathname } from "./router";

function renderNotFoundAt(pathname: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });
  return render(<RouterProvider router={router} />);
}

describe("slugFromPathname (D29-109e, pure — decoupled from useRouterState)", () => {
  it("strips the leading slash", () => {
    expect(slugFromPathname("/hunters-edge")).toBe("hunters-edge");
  });

  it("strips a trailing slash too", () => {
    expect(slugFromPathname("/creature/nonexistent/")).toBe("creature/nonexistent");
  });

  it("the bare root pathname has no slug worth searching for", () => {
    expect(slugFromPathname("/")).toBe("");
  });

  it("an empty pathname likewise has no slug", () => {
    expect(slugFromPathname("")).toBe("");
  });

  it("percent-decodes an escaped pathname (a real non-ASCII slug attempt)", () => {
    expect(slugFromPathname("/creature/ixam%C3%A8-typo")).toBe("creature/ixamè-typo");
  });

  it("a malformed percent-escape falls back to the raw text rather than throwing", () => {
    expect(() => slugFromPathname("/%E0%A4%A")).not.toThrow();
    expect(slugFromPathname("/%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("a multi-segment garbage path keeps the full remaining path as the slug", () => {
    expect(slugFromPathname("/not/a/real/category")).toBe("not/a/real/category");
  });
});

describe("DefaultNotFoundComponent (D29-109e) — mounted against a SYNTHETIC router", () => {
  // A bare-vitest mount of the REAL `getRouter()` route tree can only prove
  // pure ROUTER-level not-found (no route matches at all, no loader
  // involved) — this app's `/$category/` and `/$category/$slug` routes are
  // dynamic-segment catch-alls that happily MATCH almost any single- or
  // two-segment path, so a "garbage slug" 404 in production actually comes
  // from that route's own loader throwing `notFound()` after a real
  // corpus-reader lookup fails — a server-fn call that only works inside
  // the actual TanStack Start request runtime (`entityPageData.ts`'s own
  // documented "No Start context found in AsyncLocalStorage" gotcha), not
  // bare vitest. So: this describe block mounts the exported
  // `DefaultNotFoundComponent` directly against a route-tree-free synthetic
  // router (mirrors `HeaderTitle.test.tsx`'s own synthetic-router pattern)
  // to unit-test the COMPONENT itself in isolation; the real end-to-end
  // "garbage URL 404s with the search link" gate is proven live via
  // Playwright against the production server (see the session report).
  it("renders the 404 with a working search link carrying the attempted slug", async () => {
    renderNotFoundAt("/totally-not-a-real-slug");
    expect(await screen.findByText("404")).not.toBeNull();
    const link = await screen.findByRole("link", { name: /totally-not-a-real-slug/ });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("/search")).toBe(true);
    const q = new URL(href, "http://localhost").searchParams.get("q");
    expect(q).toBe("totally-not-a-real-slug");
  });

  it("a multi-segment attempted path carries the full path as the search slug", async () => {
    renderNotFoundAt("/not/a/real/route");
    expect(await screen.findByText("404")).not.toBeNull();
    const link = await screen.findByRole("link", { name: /not\/a\/real\/route/ });
    const href = link.getAttribute("href") ?? "";
    const q = new URL(href, "http://localhost").searchParams.get("q");
    expect(q).toBe("not/a/real/route");
  });

  it("the bare root path (no slug) renders the 404 with NO search link at all", async () => {
    renderNotFoundAt("/");
    expect(await screen.findByText("404")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /Search for/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).not.toBeNull();
  });

  it("getRouter() wires THIS exact component as its own defaultNotFoundComponent (construction-only check, no render/navigation)", () => {
    // Doesn't mount/navigate the real app router (that needs the Start
    // runtime, see the block comment above) — just proves the real
    // production router is actually built with this component, not a
    // different/forgotten one.
    const router = getRouter();
    expect(router.options.defaultNotFoundComponent).toBe(DefaultNotFoundComponent);
  });
});
