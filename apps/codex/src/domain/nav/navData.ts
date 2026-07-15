/**
 * P4.5 S2 (D29-47) — the global header nav's information architecture: every
 * one of the 88 real corpus categories assigned to exactly one of the spec's
 * 6 dropdown groups, plus the "Rules" split control's own direct-link
 * category and the "Sources" aggregate direct link. Copied verbatim from the
 * spec's §2 D29-47 table — do not re-derive; the categories were
 * adversarially re-verified against `data/corpus/` at spec-review time (zero
 * drift). A conformance test (`navData.test.ts`) asserts the module's
 * category union equals the full 88-entry corpus category list exactly.
 *
 * `NAV_ITEMS` is the SINGLE source of the grouping — imported by
 * `HeaderNav.tsx` (the header island) and its own conformance test. The
 * "Everything" catch-all's 3 categories (`article`/`sidebar`/`source`) are
 * the ui-map's "structural, not ordinarily browsable" long tail; they get a
 * real dropdown here too (not a special case) — same render path as every
 * other group.
 *
 * **The Rules split control (adversarial M4):** a `<summary>` can't be an
 * `<a>`, so "Rules" is the one `kind: "link"` item that ALSO carries
 * `categories` — its own `rules` category (the item's `href` target) PLUS
 * its 8-category dropdown tail, all in one array so `allNavCategories()`'s
 * union stays exactly 88 without a second field just for this one item.
 * `tailCategoriesFor()` is how a renderer gets JUST the tail (excludes the
 * item's own href-derived self-category).
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
      "class-feature",
      "class-kit",
      "class-sample",
      "ancestry",
      "heritage",
      "background",
      "feat",
      "archetype",
      "animal-companion",
      "animal-companion-advanced",
      "animal-companion-specialization",
      "animal-companion-unique",
      "eidolon",
      "familiar-ability",
      "familiar-specific",
      "bloodline",
      "instinct",
      "racket",
      "muse",
      "doctrine",
      "methodology",
      "hunters-edge",
      "arcane-school",
      "arcane-thesis",
      "druidic-order",
      "patron",
      "mystery",
      "lesson",
      "research-field",
      "tenet",
      "way",
      "element",
      "conscious-mind",
      "subconscious-mind",
      "draconic-exemplar",
      "deviant-ability-classification",
      "cause",
      "innovation",
    ],
  },
  {
    label: "Spells",
    kind: "dropdown",
    categories: ["spell", "ritual", "domain", "tradition"],
  },
  {
    label: "Equipment",
    kind: "dropdown",
    categories: [
      "equipment",
      "weapon",
      "weapon-group",
      "armor",
      "armor-group",
      "shield",
      "item-bonus",
      "relic",
      "set-relic",
      "implement",
      "siege-weapon",
      "vehicle",
      "campsite-meal",
    ],
  },
  {
    label: "GM",
    kind: "dropdown",
    categories: [
      "creature",
      "creature-family",
      "creature-ability",
      "creature-adjustment",
      "creature-theme-template",
      "hazard",
      "weather-hazard",
      "warfare-army",
      "warfare-tactic",
      "kingdom-event",
      "kingdom-structure",
      "apparition",
      "cult-activity",
      "curse",
      "disease",
    ],
  },
  {
    label: "Rules",
    kind: "link",
    href: "/rules",
    categories: [
      "rules",
      "condition",
      "action",
      "trait",
      "skill",
      "skill-general-action",
      "category-page",
      "language",
      "style",
    ],
  },
  {
    label: "Setting",
    kind: "dropdown",
    categories: ["deity", "deity-category", "plane", "epithet", "hellknight-order"],
  },
  {
    label: "Sources",
    kind: "link",
    href: "/sources",
  },
  {
    label: "Everything",
    kind: "dropdown",
    categories: ["article", "sidebar", "source"],
  },
];

/** The category union across every nav item's `categories` — the
 * conformance test's LHS (must equal the full 88-entry corpus category list
 * exactly: every category assigned, none twice, none dropped). */
export function allNavCategories(): readonly string[] {
  return NAV_ITEMS.flatMap((item) => item.categories ?? []);
}

/** For a `kind: "link"` item that ALSO carries `categories` (only "Rules"
 * today — the split control), the dropdown TAIL excludes the item's own
 * `href`-derived self-category (the plain link's target, e.g. `rules` for
 * `href: "/rules"`). A `kind: "dropdown"` item's `categories` are already
 * the full tail (no self-category to exclude). */
export function tailCategoriesFor(item: NavItem): readonly string[] {
  const self = item.href?.replace(/^\//, "");
  return (item.categories ?? []).filter((category) => category !== self);
}
