import { describe, expect, it } from "vitest";

import { createHeadingIdAssigner, slugifyHeading } from "./headingIds";

describe("slugifyHeading (D29-109b, GitHub-slugger-style)", () => {
  it("lowercases and hyphenates a plain multi-word heading", () => {
    expect(slugifyHeading("Cast a Spell")).toBe("cast-a-spell");
  });

  it("strips punctuation, collapsing runs to a single hyphen", () => {
    expect(slugifyHeading("Frequently Asked Questions: FAQ!")).toBe(
      "frequently-asked-questions-faq",
    );
  });

  it("strips apostrophes without inserting a hyphen in their place", () => {
    expect(slugifyHeading("Hunter's Edge")).toBe("hunters-edge");
  });

  it("trims leading/trailing punctuation-derived hyphens", () => {
    expect(slugifyHeading("  (Optional) Rules  ")).toBe("optional-rules");
  });

  it("falls back to a stable placeholder when the heading has no slug-able text", () => {
    expect(slugifyHeading("!!!")).toBe("section");
    expect(slugifyHeading("")).toBe("section");
  });

  it("preserves diacritics (a different posture than the search-match normalizer)", () => {
    expect(slugifyHeading("ixamè")).toBe("ixamè");
  });
});

describe("createHeadingIdAssigner (D29-109b, per-page collision suffixes)", () => {
  it("the first occurrence of a heading text gets the bare slug", () => {
    const assign = createHeadingIdAssigner();
    expect(assign("Description")).toBe("description");
  });

  it("a repeated heading text gets -2, then -3, on the SAME assigner", () => {
    const assign = createHeadingIdAssigner();
    expect(assign("Description")).toBe("description");
    expect(assign("Description")).toBe("description-2");
    expect(assign("Description")).toBe("description-3");
  });

  it("collisions are keyed on the SLUG, not the raw text — differently-punctuated same-slug text still collides", () => {
    const assign = createHeadingIdAssigner();
    expect(assign("Cast a Spell!")).toBe("cast-a-spell");
    expect(assign("Cast a Spell")).toBe("cast-a-spell-2");
  });

  it("distinct headings never collide with each other", () => {
    const assign = createHeadingIdAssigner();
    expect(assign("Description")).toBe("description");
    expect(assign("Special Abilities")).toBe("special-abilities");
    expect(assign("Description")).toBe("description-2");
    expect(assign("Special Abilities")).toBe("special-abilities-2");
  });

  it("a fresh assigner has independent state — per-PAGE, never carried across pages", () => {
    const pageOne = createHeadingIdAssigner();
    const pageTwo = createHeadingIdAssigner();
    expect(pageOne("Description")).toBe("description");
    expect(pageTwo("Description")).toBe("description"); // NOT description-2
  });
});
