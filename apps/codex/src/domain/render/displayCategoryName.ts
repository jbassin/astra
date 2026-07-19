import { humanizeSlug } from "./text";

/**
 * D29-109(d) (#19) — category display names, seam created early by P11 S4
 * (D29-112) since the header title needs it before D29-109d's own slice
 * (S5) lands. ONE seam — an override map over `humanizeSlug`, seeded from
 * `data/corpus/category-page/*.json` divergences: for each of the 88 real
 * corpus categories, check whether a same-slugged AoN glossary page exists
 * (`category-page/<slug>.json`) and, if so, whether its own resolved `name`
 * disagrees with a naive `humanizeSlug` guess. Only ONE disagreement exists
 * among the 88 (re-verified against the real corpus at S4 build time,
 * confirming the spec's own D-19 finding): `hunters-edge` -> "Hunter's
 * Edge" (`humanizeSlug` guesses "Hunters Edge", dropping the apostrophe
 * `humanizeSlug`'s hyphen-only splitter can't reconstruct). The other 14
 * mismatches the scope doc found live in AoN glossary category-PAGES that
 * aren't themselves nav/listing top-level categories — out of scope here.
 *
 * S4 consumes this in exactly the sites D29-112 itself calls out: the root
 * header's title (`HeaderTitle.tsx`), the listing's in-content h1
 * (`BrowseListing.tsx`), and the `/{category}` route's own `<title>`
 * (`routes/$category/index.tsx`). D29-109d's own remaining consumer list
 * (nav labels, entityPage type tag, `/categories` links, Omnibar group
 * titles, SearchPage meta, the BrowseListing empty-state noun) is S5's job
 * — deliberately NOT touched here, so a diff against this slice's scope
 * stays legible.
 */
const CATEGORY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "hunters-edge": "Hunter's Edge",
};

export function displayCategoryName(category: string): string {
  return CATEGORY_NAME_OVERRIDES[category] ?? humanizeSlug(category);
}
