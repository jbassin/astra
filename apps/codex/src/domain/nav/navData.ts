/**
 * P4.5 S2 (D29-47), CURATED P11 S4 (D29-110, R5, #13f) — the global header
 * nav's information architecture. D29-47 originally assigned every one of
 * the 88 real corpus categories to a dropdown group; D29-110 curates that
 * down to a 28-category AoN-mirroring set — the long tail (bloodline,
 * doctrine, muse, the class-subsystem categories, the 10 default-empty/thin
 * categories, …) demotes to `/categories` + the omnibar + in-context links
 * (stakeholder-sanctioned: link/search-only reachability is fine for them).
 *
 * "Rules"/"Sources"/"All categories" are now all bare `kind: "link"` items
 * carrying NO `categories` of their own — the old Rules split control (a
 * `<summary>`-adjacent caret trigger disclosing an 8-category dropdown
 * tail) is GONE, since Rules no longer has a dropdown at all
 * (`HeaderNav.tsx`'s old `RulesNavItem`/this file's old `tailCategoriesFor`
 * are deleted with it — dead code once no `kind: "link"` item carries
 * `categories`). "Everything" (the `article`/`sidebar`/`source` structural
 * catch-all) is replaced by "All categories", a bare link to `/categories`
 * — the full 88-category directory, which is what now surfaces the whole
 * corpus (this module's own union no longer does).
 *
 * `NAV_ITEMS` is the SINGLE source of the curated grouping — imported by
 * `HeaderNav.tsx` (the header island) and its own conformance test.
 * `allNavCategories()`'s union is now the CURATED 28, a strict SUBSET of the
 * real 88 (`navData.test.ts` asserts subset-membership + an exact count of
 * 28; the corpus-census 88 assert stays, anchoring that subset check —
 * `directoryData.test.ts` separately pins that `/categories` still surfaces
 * the full 88).
 */
export interface NavItem {
  readonly label: string;
  readonly kind: "dropdown" | "link";
  readonly categories?: readonly string[];
  readonly href?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Player",
    kind: "dropdown",
    categories: [
      "class",
      "ancestry",
      "heritage",
      "background",
      "feat",
      "archetype",
      "skill",
      "condition",
      "action",
      "trait",
    ],
  },
  {
    label: "Spells",
    kind: "dropdown",
    categories: ["spell", "ritual"],
  },
  {
    label: "Equipment",
    kind: "dropdown",
    categories: ["equipment", "weapon", "armor", "shield", "vehicle"],
  },
  {
    label: "GM",
    kind: "dropdown",
    categories: [
      "creature",
      "creature-family",
      "hazard",
      "warfare-army",
      "kingdom-event",
      "kingdom-structure",
      "curse",
      "disease",
    ],
  },
  {
    label: "Setting",
    kind: "dropdown",
    categories: ["deity", "plane", "language"],
  },
  {
    label: "Rules",
    kind: "link",
    href: "/rules",
  },
  {
    label: "Sources",
    kind: "link",
    href: "/sources",
  },
  {
    label: "All categories",
    kind: "link",
    href: "/categories",
  },
];

/** The category union across every nav item's `categories` — the curated 28
 * (D29-110), a strict subset of the real 88-category corpus. Every
 * `kind: "link"` item (Rules/Sources/All categories) now carries no
 * `categories` at all, so this is exactly the 5 dropdown groups' own
 * category lists concatenated. */
export function allNavCategories(): readonly string[] {
  return NAV_ITEMS.flatMap((item) => item.categories ?? []);
}
