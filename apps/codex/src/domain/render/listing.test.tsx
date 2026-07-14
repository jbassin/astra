import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CategoryDirectoryData } from "../../server/directoryData";
import { CategoryDirectory } from "./listing";

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

// The `/{category}` A–Z listing this file used to test (`CategoryListing`)
// was REPLACED by P3's faceted `BrowseListing` — see
// `src/domain/browse/BrowseListing.test.tsx` for its render-level letter-
// group/edition-pill/popover-free coverage (the equivalent assertions now
// live there, plus the full facet/filter interaction surface this static
// component never had).
