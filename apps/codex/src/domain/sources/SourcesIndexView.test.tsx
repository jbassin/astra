import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SourceIndexEntry } from "@/schema/sourcesIndex";

import { SourcesIndexView } from "./SourcesIndexView";

function book(overrides: Partial<SourceIndexEntry> = {}): SourceIndexEntry {
  return {
    book: "Some Book",
    license: "unknown",
    edition: "remaster",
    entityCount: 1,
    categoryCounts: { spell: 1 },
    ...overrides,
  };
}

describe("SourcesIndexView (D29-43)", () => {
  it("renders a classified group as a plain (non-collapsed) section", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView books={[book({ book: "Core Rulebook", productLine: "Rulebooks" })]} />,
    );
    expect(html).toContain("Rulebooks");
    expect(html).toContain("Core Rulebook");
    expect(html).not.toContain("<details");
  });

  it("renders the Other bucket as a collapsed <details> (no `open` attribute)", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView books={[book({ book: "Foundry-Only" })]} />,
    );
    expect(html).toContain("<details");
    expect(html).not.toContain('open=""');
    expect(html).toContain("Other");
    expect(html).toContain("Foundry-Only");
  });

  it("an unknown license renders an explicit pill, never blank or a guessed OGL", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView books={[book({ book: "X", license: "unknown" })]} />,
    );
    expect(html).toContain("License unknown");
    expect(html).not.toContain(">OGL<");
  });

  it("a book with a sourceEntityRef links to its own entity page", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView
        books={[book({ book: "Core Rulebook", sourceEntityRef: "source/core-rulebook" })]}
      />,
    );
    expect(html).toContain('href="/source/core-rulebook"');
  });

  it("a sourceless book renders its name without a link", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView books={[book({ book: "No Source Doc" })]} />,
    );
    expect(html).not.toContain('href="/source/');
    expect(html).toContain("No Source Doc");
  });

  it("each category count links into the filtered browse listing with the book pre-selected", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView
        books={[book({ book: "Core Rulebook", categoryCounts: { spell: 12, feat: 3 } })]}
      />,
    );
    expect(html).toContain(`href="/spell?book=${encodeURIComponent("Core Rulebook")}"`);
    expect(html).toContain(`href="/feat?book=${encodeURIComponent("Core Rulebook")}"`);
  });

  it("a comma-bearing book name escapes correctly through the existing URL codec", () => {
    const html = renderToStaticMarkup(
      <SourcesIndexView
        books={[book({ book: "Dragon, Black Edition", categoryCounts: { creature: 1 } })]}
      />,
    );
    // joinCsv backslash-escapes the literal comma, then encodeURIComponent
    // percent-encodes the whole escaped string.
    expect(html).toContain(
      `href="/creature?book=${encodeURIComponent("Dragon\\, Black Edition")}"`,
    );
  });
});
