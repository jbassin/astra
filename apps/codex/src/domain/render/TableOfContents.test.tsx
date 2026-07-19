// @vitest-environment jsdom
//
// Same jsdom-per-file convention as `Popover.test.tsx` — a real DOM,
// no router needed (`TableOfContents` reads no router state). The
// component scans `document.querySelector(".codex-entity-page")` directly
// (not scoped to its own render container), so these tests build that
// sibling DOM by hand before mounting.

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TableOfContents } from "./TableOfContents";

interface HeadingSpec {
  id?: string;
  text: string;
  level: number;
}

function mountEntityPageHeadings(specs: readonly HeadingSpec[]): void {
  const article = document.createElement("article");
  article.className = "codex-entity-page";
  for (const spec of specs) {
    const el = document.createElement(`h${spec.level}`);
    if (spec.id !== undefined) el.id = spec.id;
    el.textContent = spec.text;
    article.appendChild(el);
  }
  document.body.appendChild(article);
}

function headings(count: number): HeadingSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `section-${i}`,
    text: `Section ${i}`,
    level: 2,
  }));
}

describe("TableOfContents (D29-109b, #15)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing (SSR posture) when no .codex-entity-page exists at all", () => {
    const { container } = render(<TableOfContents />);
    expect(container.firstChild).toBeNull();
  });

  it("mounts nothing when fewer than 8 headings carry an id (below MIN_HEADINGS)", () => {
    mountEntityPageHeadings(headings(7));
    const { container } = render(<TableOfContents />);
    expect(container.firstChild).toBeNull();
  });

  it("mounts the collapsible 'On this page' box at exactly the 8-heading threshold", async () => {
    mountEntityPageHeadings(headings(8));
    render(<TableOfContents />);
    expect(await screen.findByText("On this page")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("one link per heading, in document order, hrefs pointing at the heading's own id", async () => {
    mountEntityPageHeadings(headings(9));
    render(<TableOfContents />);
    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(9);
    expect(links[0]?.getAttribute("href")).toBe("#section-0");
    expect(links[0]?.textContent).toBe("Section 0");
    expect(links[8]?.getAttribute("href")).toBe("#section-8");
  });

  it("headings WITHOUT an id are skipped (an id-less heading isn't a valid anchor target)", async () => {
    const specs = [
      ...headings(8),
      { text: "No id here", level: 2 }, // id omitted
    ];
    mountEntityPageHeadings(specs);
    render(<TableOfContents />);
    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(8); // the id-less 9th heading never counted
  });

  it("is collapsible — a real <details>/<summary> disclosure, open by default", async () => {
    mountEntityPageHeadings(headings(8));
    render(<TableOfContents />);
    const details = (await screen.findByText("On this page")).closest("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(true);
  });
});
