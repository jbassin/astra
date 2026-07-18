// @vitest-environment jsdom
//
// `Popover` (mounted unconditionally by `EntityRenderPane`) reads
// `useRouterState` (D29-28) — needs a real router context to mount at all,
// same convention `BrowseListing.test.tsx` already uses for its own
// router-dependent island tests.

import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import type { EntityPageData } from "../../server/entityPageData";
import { EntityRenderPane } from "./EntityRenderPane";

/**
 * P10 (D29-95) — "the browse split-view drawer inherits [the size chip] via
 * `EntityRenderPane`" — one assertion suffices, since `EntityRenderPane`
 * passes `entity`/`ctx` into `EntityPage` unmodified (spec R1: reuse
 * verbatim, no extra work).
 */

function renderWithRouter(component: () => ReactElement) {
  const rootRoute = createRootRoute({ component });
  const router = createRouter({ routeTree: rootRoute });
  return render(<RouterProvider router={router} />);
}

const CREATURE_DATA: EntityPageData = {
  entity: {
    id: "creature/test-drawer-creature",
    slug: "test-drawer-creature",
    category: "creature",
    name: "Test Drawer Creature",
    edition: "remaster",
    source: { book: "Test Book", license: "ORC" },
    traits: [],
    body: [],
    facets: { size: "lg" },
  },
  embeds: {},
  knownTraitIds: [],
  embedCapHit: false,
};

describe("EntityRenderPane: size chip drawer inheritance (P10, D29-95)", () => {
  it("the split-view drawer renders the same header size chip as the standalone route", async () => {
    renderWithRouter(() => <EntityRenderPane data={CREATURE_DATA} superseded={false} />);
    await screen.findByText("Test Drawer Creature");
    expect(screen.getByText("Large")).not.toBeNull();
  });
});
