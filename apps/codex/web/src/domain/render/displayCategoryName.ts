import { humanizeSlug } from "@astra/codex-corpus";

/**
 * Category display names. ONE seam — an override map over `humanizeSlug`, seeded from
 * `data/corpus/category-page/*.json` divergences: for each of the 88 real
 * corpus categories, check whether a same-slugged AoN glossary page exists
 * (`category-page/<slug>.json`) and, if so, whether its own resolved `name`
 * disagrees with a naive `humanizeSlug` guess. Only ONE disagreement exists
 * among the 88 (verified against the real corpus): `hunters-edge` -> "Hunter's
 * Edge" (`humanizeSlug` guesses "Hunters Edge", dropping the apostrophe
 * `humanizeSlug`'s hyphen-only splitter can't reconstruct). The other 14
 * mismatches the scope doc found live in AoN glossary category-PAGES that
 * aren't themselves nav/listing top-level categories — out of scope here.
 *
 * Consumers: the root header's title (`HeaderTitle.tsx`), the listing's
 * in-content h1 (`BrowseListing.tsx`), the `/{category}` route's own
 * `<title>` (`routes/$category/index.tsx`), nav labels (`HeaderNav.tsx`'s `NavPanel`),
 * `entityPage.tsx`'s `entityTypeTag`, `/categories` links (`listing.tsx`'s
 * `CategoryDirectory`), Omnibar group titles + SearchPage's Category filter
 * labels/result-row category text (`Omnibar.tsx`/`SearchPage.tsx`), and the
 * BrowseListing empty-state noun (+ its sibling entry-pane "wasn't found in
 * X" message, the same category-name-in-prose pattern).
 */
const CATEGORY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "hunters-edge": "Hunter's Edge",
};

export function displayCategoryName(category: string): string {
  return CATEGORY_NAME_OVERRIDES[category] ?? humanizeSlug(category);
}
