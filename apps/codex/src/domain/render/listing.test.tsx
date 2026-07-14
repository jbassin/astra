import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CategoryDirectoryData } from "../../server/directoryData";
import type { CategoryListingData } from "../../server/listingData";
import { CategoryDirectory, CategoryListing } from "./listing";

describe("CategoryDirectory (D29-27)", () => {
  const data: CategoryDirectoryData = {
    totalEntities: 111,
    groups: [
      { group: "spell", categories: [{ category: "spell", count: 100 }] },
      {
        group: "generic",
        categories: [
          { category: "rules", count: 10 },
          { category: "creature-ability", count: 1 },
        ],
      },
    ],
  };

  it("links every category to /{category}", () => {
    const out = renderToStaticMarkup(<CategoryDirectory data={data} />);
    expect(out).toContain('href="/spell"');
    expect(out).toContain('href="/rules"');
    expect(out).toContain('href="/creature-ability"');
  });

  it("humanizes hyphenated category names", () => {
    const out = renderToStaticMarkup(<CategoryDirectory data={data} />);
    expect(out).toContain("Creature Ability");
  });

  it("renders group labels and counts", () => {
    const out = renderToStaticMarkup(<CategoryDirectory data={data} />);
    expect(out).toContain("Spells");
    expect(out).toContain("Everything Else");
    expect(out).toContain("100");
  });
});

describe("CategoryListing (D29-27)", () => {
  const data: CategoryListingData = {
    category: "spell",
    rows: [
      {
        id: "spell/heal",
        name: "Heal",
        level: 1,
        source: { book: "Core Rulebook", license: "ORC" },
        edition: "remaster",
      },
      {
        id: "spell/avatar",
        name: "Avatar",
        rarity: "rare",
        source: { book: "Secrets of Magic", license: "ORC" },
        edition: "remaster",
      },
      {
        id: "spell/heal@legacy",
        name: "Heal",
        source: { book: "Core Rulebook", license: "OGL" },
        edition: "legacy",
      },
    ],
  };

  it("renders every row as a link to /{id}, grouped by first letter", () => {
    const out = renderToStaticMarkup(<CategoryListing data={data} />);
    expect(out).toContain('href="/spell/heal"');
    expect(out).toContain('href="/spell/avatar"');
    expect(out).toContain('href="/spell/heal@legacy"');
    expect(out).toContain('id="letter-A"');
    expect(out).toContain('id="letter-H"');
  });

  it("shows level, rarity, source book, and an edition pill per row", () => {
    const out = renderToStaticMarkup(<CategoryListing data={data} />);
    expect(out).toContain("Lvl 1");
    expect(out).toContain("Rare");
    expect(out).toContain("Core Rulebook");
    expect(out).toContain("Secrets of Magic");
    expect(out).toContain("Remaster");
    expect(out).toContain("Legacy");
  });

  it("does not navigate rows to popovers (no data-crossref on listing rows)", () => {
    const out = renderToStaticMarkup(<CategoryListing data={data} />);
    expect(out).not.toContain("data-crossref");
  });

  it("omits the letter-jump nav when everything falls under one letter", () => {
    const singleLetter: CategoryListingData = {
      category: "x",
      rows: [
        {
          id: "x/a",
          name: "Avatar",
          source: { book: "Book", license: "ORC" },
          edition: "remaster",
        },
      ],
    };
    const out = renderToStaticMarkup(<CategoryListing data={singleLetter} />);
    expect(out).not.toContain("codex-listing-alpha");
  });
});
