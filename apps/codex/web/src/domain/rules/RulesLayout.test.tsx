// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { RulesNavData } from "@/server/entityPageData";

import { RulesLayout } from "./RulesLayout";

// Mirrors the real GMG "Chapter 2: Tools" -> "Building Creatures" ->
// "Ability Modifiers" fully-superseded chain (the same D29-44 fixture
// composition `entityPageData.test.ts`'s `resolveRulesNav` suite exercises)
// — the deliberately awkward case for the sidebar: every node on the path
// to `currentId` is itself `superseded: true`.
const GMG_NAV: RulesNavData = {
  book: {
    book: "Gamemastery Guide",
    edition: "legacy",
    license: "OGL",
    hiddenWhenLegacyOff: 3,
    nodes: [
      {
        name: "Chapter 2: Tools",
        id: "rules/chapter-2-tools",
        superseded: true,
        children: [
          {
            name: "Building Creatures",
            id: "rules/building-creatures@legacy",
            superseded: true,
            children: [
              {
                name: "Ability Modifiers",
                id: "rules/ability-modifiers-2",
                superseded: true,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
  ancestors: [
    { name: "Chapter 2: Tools", id: "rules/chapter-2-tools" },
    { name: "Building Creatures", id: "rules/building-creatures@legacy" },
  ],
  prev: { id: "rules/building-creatures@legacy", name: "Building Creatures", superseded: true },
};

describe("RulesLayout (P4 S3, D29-41)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the wrapped page content", () => {
    render(
      <RulesLayout
        entityId="rules/ability-modifiers-2"
        entityName="Ability Modifiers"
        nav={GMG_NAV}
        superseded={false}
      >
        <div data-testid="page-content">the entity page</div>
      </RulesLayout>,
    );
    expect(screen.getByTestId("page-content")).not.toBeNull();
  });

  it("renders the breadcrumb trail: book -> ancestors -> self", () => {
    render(
      <RulesLayout
        entityId="rules/ability-modifiers-2"
        entityName="Ability Modifiers"
        nav={GMG_NAV}
        superseded={false}
      >
        <div />
      </RulesLayout>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // R10 (D29-68) — the book crumb shows the abbreviation-with-fallback
    // (RulesLayout passes `abbreviateBook(nav.book.book) ?? nav.book.book`
    // into `BreadcrumbTrail`'s `book` prop); "Gamemastery Guide" curates to
    // "GMG".
    expect(nav.textContent).toContain("GMG");
    expect(nav.textContent).toContain("Chapter 2: Tools");
    expect(nav.textContent).toContain("Building Creatures");
  });

  it("renders the pager (a `prev` target here, GMG's own chain tail)", () => {
    render(
      <RulesLayout
        entityId="rules/ability-modifiers-2"
        entityName="Ability Modifiers"
        nav={GMG_NAV}
        superseded={false}
      >
        <div />
      </RulesLayout>,
    );
    expect(screen.getByRole("navigation", { name: "Rules pager" })).not.toBeNull();
  });

  it(
    "the sidebar keeps the current doc's full ancestor branch visible even though every " +
      "node on it is superseded and superseded-visibility defaults off (the pruneForSuperseded " +
      "currentId guard — a sidebar must never lose 'you are here')",
    () => {
      const { container } = render(
        <RulesLayout
          entityId="rules/ability-modifiers-2"
          entityName="Ability Modifiers"
          nav={GMG_NAV}
          superseded={false}
        >
          <div />
        </RulesLayout>,
      );
      const current = container.querySelector(".codex-rules-node-current");
      expect(current).not.toBeNull();
      expect(current?.textContent).toContain("Ability Modifiers");
      // the ancestor chain down to it is force-open (computeOpen's
      // ancestor-of-current rule), so the whole branch is in the DOM, not
      // just the collapsed root.
      const sidebarBody = container.querySelector(".codex-rules-sidebar-body");
      expect(sidebarBody?.textContent).toContain("Chapter 2: Tools");
      expect(sidebarBody?.textContent).toContain("Building Creatures");
    },
  );

  it("the sidebar is a native <details> disclosure, collapsed (no `open` attribute) by default in the server-rendered markup", () => {
    const { container } = render(
      <RulesLayout
        entityId="rules/ability-modifiers-2"
        entityName="Ability Modifiers"
        nav={GMG_NAV}
        superseded={false}
      >
        <div />
      </RulesLayout>,
    );
    const details = container.querySelector("details.codex-rules-sidebar-disclosure");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    // R10 (D29-68) — the summary shows the abbreviation, the full name
    // stays available via `title`.
    expect(details?.querySelector("summary")?.textContent).toBe("GMG contents");
    expect(details?.querySelector("summary")?.getAttribute("title")).toBe("Gamemastery Guide");
  });
});
