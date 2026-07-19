// P13 S1 (D29-122) — the facet-VALUE display humanizer. Distinct from
// `displayCategoryName.ts` (which humanizes a CATEGORY name, e.g. "creature-
// ability" -> "Creature Ability") and from `facetDefs.ts`'s own per-key
// `labelMap` (which owns a SPECIFIC key's raw-value -> label overrides,
// e.g. `size`'s `grg` -> "Gargantuan"). This module is the GENERIC fallback
// every enum facet's raw value flows through when its own def carries no
// `labelMap` entry for that value — the review-corrected mechanism (a
// generic "compound-word split" is mechanically impossible on a GLUED token
// like "ancestryfeature": there's no delimiter to split on) — a curated
// exceptions map is what actually fixes those.
//
// PRECEDENCE (review-pinned, spec D29-122): a facet's existing `facetDefs.ts`
// `labelMap` entry always wins outright; this module is the fallback ONLY
// for values with no labelMap entry. `facetDefs.ts`'s own `humanizedLabelFor`
// implements that precedence (never call this module BEFORE checking a
// def's labelMap, and never run it a second time over a labelMap's own
// output — see that function's doc comment for the "no double-formatting"
// contract `formatFacetValue.test.ts` proves).
//
// Zero imports (deliberately) — a plain, standalone, pure string function so
// every caller (facetDefs.ts, activeFilterPills.ts, a future SearchPage
// wiring) can reach for it with no layering/bundle concern whatsoever.

/**
 * Curated exceptions — the mechanism the spec's adversarial review pinned
 * (`"the curated map IS the mechanism"`): every entry here exists because
 * S1's real-corpus sweep (88 categories, every `FACET_KEYS`-allowlisted enum
 * facet — see the sweep record in the S1 build note) found a value the
 * generic pass below can't fix on its own. Two families:
 *
 *   - **glued compounds** (no delimiter at all): `feat`/`deity`/
 *     `creature-ability`'s `itemCategory` facet ("ancestryfeature" /
 *     "classfeature" / "deityboon" — Foundry's own un-hyphenated slugs).
 *   - **`equipment`/`weapon`'s `usage` facet's 24 glued "worn<slot>" values**
 *     (measured against the real corpus; a hyphenated sibling like
 *     "held-in-one-hand" already reads fine through the generic pass below
 *     and needs NO entry here — only the glued "worn"-prefixed family does).
 *
 * `creature`/`hazard`/`vehicle`/`ancestry`'s `facets.size` codes are ALSO
 * duplicated here (`tiny`/`sm`/`med`/`lg`/`huge`/`grg`) per the spec's own
 * explicit pin, even though `facetDefs.ts`'s own `SIZE_LABELS` labelMap
 * already covers every real call site and wins first (this module's own
 * precedence rule, above) — so a size VALUE reaching this formatter via any
 * OTHER path (no `FacetDef`/labelMap in scope at all) still humanizes
 * correctly instead of showing a raw Foundry slug.
 */
const CURATED_FACET_VALUE_LABELS: Readonly<Record<string, string>> = {
  // --- glued compounds (itemCategory — no delimiter for the generic pass) ---
  ancestryfeature: "Ancestry Feature",
  classfeature: "Class Feature",
  deityboon: "Deity Boon",

  // --- equipment/weapon `usage` — Foundry's own glued "worn<slot>" slugs
  // (24 distinct values measured against the real corpus, S1's sweep) ---
  wornamulet: "Worn (Amulet)",
  wornanklets: "Worn (Anklets)",
  wornarmbands: "Worn (Armbands)",
  wornbackpack: "Worn (Backpack)",
  wornbelt: "Worn (Belt)",
  wornbracelet: "Worn (Bracelet)",
  wornbracers: "Worn (Bracers)",
  worncape: "Worn (Cape)",
  worncirclet: "Worn (Circlet)",
  worncloak: "Worn (Cloak)",
  wornclothing: "Worn (Clothing)",
  worncollar: "Worn (Collar)",
  wornepaulet: "Worn (Epaulet)",
  worneyeglasses: "Worn (Eyeglasses)",
  worneyepiece: "Worn (Eyepiece)",
  worngarment: "Worn (Garment)",
  worngloves: "Worn (Gloves)",
  wornheadwear: "Worn (Headwear)",
  wornhorseshoes: "Worn (Horseshoes)",
  wornmask: "Worn (Mask)",
  wornnecklace: "Worn (Necklace)",
  wornring: "Worn (Ring)",
  wornsaddle: "Worn (Saddle)",
  wornshoes: "Worn (Shoes)",

  // --- `facets.size` codes — see the module comment above for why these
  // are duplicated alongside `facetDefs.ts`'s own `SIZE_LABELS` ---
  tiny: "Tiny",
  sm: "Small",
  med: "Medium",
  lg: "Large",
  huge: "Huge",
  grg: "Gargantuan",
};

/** Small words that stay lowercase in the generic title-case pass UNLESS
 * they're the very first token — the spec's own worked example
 * ("held-in-one-hand" -> "Held in One Hand", not "Held In One Hand") pins
 * this: a naive per-word capitalize would over-capitalize "in". */
const TITLE_CASE_STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "onto",
  "or",
  "per",
  "the",
  "to",
  "via",
  "with",
]);

function titleCaseWord(word: string, isFirst: boolean): string {
  if (word.length === 0) return word;
  if (!isFirst && TITLE_CASE_STOPWORDS.has(word.toLowerCase())) return word.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** The generic pass: hyphen/space-split + stopword-aware title case. Never
 * called for a value the curated map or the stringified-list parse below
 * already handled. Numeric/symbol tokens ("1", "500+") pass through
 * unchanged (only an alphabetic leading character gets uppercased). */
function genericFormat(value: string): string {
  const words = value.split(/[\s-]+/).filter((w) => w.length > 0);
  if (words.length === 0) return value;
  return words.map((w, i) => titleCaseWord(w, i === 0)).join(" ");
}

const BRACKET_LIST_RE = /^\[([\s\S]*)]$/;

/**
 * Parses a Python-repr-shaped stringified list (`"['arcane', 'divine']"` —
 * the corpus's own serialization artifact on SOME array-typed facet values,
 * per the spec's explicit D29-122 pin) into its member strings, stripping
 * single/double quotes and whitespace per element. `null` when `value`
 * isn't bracket-wrapped at all (the overwhelmingly common case — real
 * facet-value strings are never accidentally bracket-wrapped). An empty
 * list (`"[]"`, or brackets around nothing but whitespace) returns `[]`,
 * distinct from `null`, so the caller can fold it into "Unspecified" same as
 * a genuinely empty string.
 */
function parseStringifiedList(value: string): readonly string[] | null {
  const match = BRACKET_LIST_RE.exec(value.trim());
  if (!match) return null;
  const inner = match[1] ?? "";
  if (inner.trim() === "") return [];
  return inner
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .trim(),
    )
    .filter((part) => part.length > 0);
}

/**
 * The one export. Three passes, in order (see the module comment for why
 * each exists): an exact curated-map lookup, a structural stringified-list
 * parse (member strings re-run through this SAME function, so a curated
 * entry or further generic formatting still applies to each one — e.g.
 * `"['arcane', 'divine']"` -> "Arcane, Divine"), then the generic pass.
 * Total over every string input (unlike `facetDefs.ts`'s `enumTagsFor`,
 * this never returns `null`/`undefined` — a facet VALUE that reaches the UI
 * always has SOME rendered text).
 */
export function formatFacetValue(value: string): string {
  if (value === "") return "Unspecified";

  const curated = CURATED_FACET_VALUE_LABELS[value];
  if (curated !== undefined) return curated;

  const listParts = parseStringifiedList(value);
  if (listParts !== null) {
    if (listParts.length === 0) return "Unspecified";
    return listParts.map((part) => formatFacetValue(part)).join(", ");
  }

  return genericFormat(value);
}
