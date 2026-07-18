// P3 S3 (D29-32) — the UI metadata layer over `src/schema/facetKeys.ts`'s
// per-category KEY allowlist. `facetKeys.ts` owns WHICH keys are worth a
// filter per category; this module owns HOW to render/parse/label each of
// those keys, category-agnostically (the same key name means the same thing
// everywhere it's allowlisted — `weapon.usage` and `equipment.usage` are both
// "how the item is worn/wielded" strings, just different cardinalities of the
// same field, D29-32's own text). `traits` is deliberately absent here — it's
// a CORE facet (every category, tri-state), handled directly by
// `FacetPanel.tsx`/`filterEngine.ts`, never routed through this per-key map.
//
// `FacetDefs` is keyed on the UNION of every key that appears in any
// `FACET_KEYS` entry (21 keys, computed once below and asserted by the
// conformance test in `facetDefs.test.ts`) — NOT per-category, since a
// category dispatch would just duplicate `facetKeys.ts`'s own allowlist for
// no benefit (no def below actually varies its shape by category).

// P10 (D29-95): a relative import, not the `@/*` alias — this module is now
// reachable from `entityPage.tsx` (the header size chip's `SIZE_LABELS`
// reuse), which sits in `regen-goldens.ts`'s import graph; the plain
// `nodeTsResolve.mjs` loader that script runs under can't follow `@/*`
// aliases (a standing gotcha — see the codex-0029 memory), so this stays
// relative rather than reintroducing that failure mode.
import { FACET_KEYS, SPILLOVER_FACET_KEYS } from "../../schema/facetKeys";
import { humanizeFacetKey, humanizeSlug } from "../render/text";

export type FacetWidget = "enum" | "tristate" | "range";

/** A raw `Facets[key]` value: the same union `FacetValue` in `entity.ts`
 * allows (`FacetsSchema`'s catchall) plus the narrower named-field types
 * (`number`, `boolean`, `string[]`) — never re-imported from `entity.ts` to
 * avoid a schema<->domain layering cycle; structurally identical. */
export type RawFacetValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export interface FacetDef {
  /** `src/schema/facetKeys.ts` key this def covers. */
  key: string;
  /** Display name for the facet control itself (e.g. "Action Cost"). */
  label: string;
  widget: FacetWidget;
  /** enum widget only: raw-value -> display-label overrides. Values with no
   * entry fall back to the raw string (or `humanizeSlug`'d, for hyphenated
   * slugs like `ancestrySlug`). NOT required to be total over every
   * theoretically-possible value — only over the value set actually observed
   * in the corpus (the conformance test asserts totality over the FIXTURE
   * corpus, the only corpus available at build/test time). */
  labelMap?: Readonly<Record<string, string>>;
  /** enum widget only: raw value -> the tag(s) a row is filtered by. Returns
   * `undefined`/`null`/`[]` to mean "no usable value" (folds into the
   * missing-key "—" bucket even though the raw field is technically present —
   * e.g. an unparseable `spell.range` string). Defaults to
   * `[String(value)]` for a scalar, `value.map(String)` for an array, when
   * omitted. */
  parse?: (value: RawFacetValue) => readonly string[] | null | undefined;
  /** range widget only: raw value -> a filterable number, or `null` for "no
   * usable numeric value" (same missing-key fold as above). Defaults to the
   * value itself when it's already a `number`. */
  parseNumeric?: (value: RawFacetValue) => number | null;
}

// ---------------------------------------------------------------------------
// price -> copper (D29-32: "pp=1000·gp=100·sp=10·cp=1, a `per 10` batch
// suffix DIVIDES for per-item value"). Format verified against
// `foundryEntities.ts`'s own `formatPrice`: `"<amount> <denom>[, <amount>
// <denom>...][ per <n>]"`, e.g. "1700 gp", "2 sp", "5 gp, 3 sp per 10".
// ---------------------------------------------------------------------------

const COPPER_PER_DENOM: Readonly<Record<string, number>> = { pp: 1000, gp: 100, sp: 10, cp: 1 };
const PRICE_PART_RE = /(\d[\d,]*)\s*(pp|gp|sp|cp)/g;
const PRICE_PER_RE = /\sper\s+(\d+)\s*$/;

/** Parses a formatted price string to a per-item copper value, or `null` if
 * the string carries no recognizable denomination part. Exported for the
 * range slider's display formatter (copper -> the nearest whole-denom label)
 * and for direct unit testing. */
export function parsePriceToCopper(raw: string): number | null {
  const perMatch = PRICE_PER_RE.exec(raw);
  const batchSize = perMatch ? Number(perMatch[1]) : 1;
  const body = perMatch ? raw.slice(0, perMatch.index) : raw;
  let total = 0;
  let matched = false;
  for (const m of body.matchAll(PRICE_PART_RE)) {
    const amount = Number(m[1]?.replace(/,/g, ""));
    const denom = m[2] ?? "";
    const perUnit = COPPER_PER_DENOM[denom];
    if (Number.isNaN(amount) || perUnit === undefined) continue;
    total += amount * perUnit;
    matched = true;
  }
  if (!matched || batchSize <= 0) return null;
  return total / batchSize;
}

// ---------------------------------------------------------------------------
// spell.range -> a hybrid bucket (D29-32: "range(parsed hybrid: numeric-feet
// buckets + touch/self special values)"). An `enum` widget over the bucket
// id, not a numeric range slider.
// ---------------------------------------------------------------------------

const RANGE_BUCKET_LABELS: Readonly<Record<string, string>> = {
  touch: "Touch",
  self: "Self",
  varies: "Varies",
  unlimited: "Unlimited",
  "0-30": "Up to 30 feet",
  "30-100": "30–100 feet",
  "100-500": "100–500 feet",
  "500+": "500+ feet",
};

function rangeBucket(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes("touch")) return "touch";
  if (lower.includes("self")) return "self";
  if (lower.includes("varies")) return "varies";
  if (lower.includes("unlimited")) return "unlimited";
  const feet = /(\d[\d,]*)\s*feet/.exec(lower);
  if (!feet) return null;
  const n = Number(feet[1]?.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  if (n <= 30) return "0-30";
  if (n <= 100) return "30-100";
  if (n <= 500) return "100-500";
  return "500+";
}

// ---------------------------------------------------------------------------
// generic scalar/array helpers used by several defs below
// ---------------------------------------------------------------------------

function scalarTags(value: RawFacetValue): readonly string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const tags = value.filter((v) => v !== null && v !== undefined).map((v) => String(v));
    return tags.length > 0 ? tags : null;
  }
  return [String(value)];
}

function asNumber(value: RawFacetValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null;
}

// Foundry PF2e size slugs (verified: exactly this 6-value set, D29-32/
// facetKeys.ts provenance — creature 85.6%/6, hazard 90.2%/2 (a subset),
// vehicle 68.6%/4 (also a subset), ancestry 50.5%/4 (also a subset)).
// Exported (P10, D29-95) so `entityPage.tsx`'s header size chip reuses this
// SAME map rather than writing a third one — the listing column
// (`columnDefs.tsx`'s `renderSize`) deliberately keeps its own raw
// uppercased-slug rendering (a table-density convention), the header wants
// the human label.
export const SIZE_LABELS: Readonly<Record<string, string>> = {
  tiny: "Tiny",
  sm: "Small",
  med: "Medium",
  lg: "Large",
  huge: "Huge",
  grg: "Gargantuan",
};

// `system.time.value` (feat/creature-ability `actionCost`, D29-32/
// facetKeys.ts provenance — feat 70.5%/6, creature-ability 56.5%/6).
const ACTION_COST_LABELS: Readonly<Record<string, string>> = {
  "1": "1 Action",
  "2": "2 Actions",
  "3": "3 Actions",
  reaction: "Reaction",
  free: "Free Action",
  passive: "Passive",
};

const ABILITY_LABELS: Readonly<Record<string, string>> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** enum def with no bespoke labelMap — falls back to `humanizeSlug` for
 * hyphenated raw values (matches `traits.tsx`'s own convention), a plain raw
 * string otherwise (single-word values like `martial`/`arcane` need no
 * humanizing). */
function plainEnumDef(key: string, label?: string): FacetDef {
  return { key, label: label ?? humanizeFacetKey(key), widget: "enum" };
}

function numericRangeDef(key: string, label?: string): FacetDef {
  return { key, label: label ?? humanizeFacetKey(key), widget: "range", parseNumeric: asNumber };
}

// ---------------------------------------------------------------------------
// the map (21 keys — the union of every FACET_KEYS entry)
// ---------------------------------------------------------------------------

export const FACET_DEFS: Readonly<Record<string, FacetDef>> = {
  actionCost: {
    key: "actionCost",
    label: "Action Cost",
    widget: "enum",
    labelMap: ACTION_COST_LABELS,
  },
  itemCategory: plainEnumDef("itemCategory", "Category"),
  size: {
    key: "size",
    label: "Size",
    widget: "enum",
    labelMap: SIZE_LABELS,
  },
  family: plainEnumDef("family", "Family"),
  hp: numericRangeDef("hp", "HP"),
  ac: numericRangeDef("ac", "AC"),
  fortitudeSave: numericRangeDef("fortitudeSave", "Fortitude"),
  reflexSave: numericRangeDef("reflexSave", "Reflex"),
  willSave: numericRangeDef("willSave", "Will"),
  perception: numericRangeDef("perception", "Perception"),
  bulk: numericRangeDef("bulk", "Bulk"),
  price: {
    key: "price",
    label: "Price",
    widget: "range",
    parseNumeric: (value) => (typeof value === "string" ? parsePriceToCopper(value) : null),
  },
  usage: plainEnumDef("usage"),
  traditions: plainEnumDef("traditions"),
  castTime: plainEnumDef("castTime", "Cast Time"),
  range: {
    key: "range",
    label: "Range",
    widget: "enum",
    labelMap: RANGE_BUCKET_LABELS,
    parse: (value) => {
      if (typeof value !== "string") return null;
      const bucket = rangeBucket(value);
      return bucket ? [bucket] : null;
    },
  },
  keyAbility: {
    key: "keyAbility",
    label: "Key Ability",
    widget: "enum",
    labelMap: ABILITY_LABELS,
  },
  trainedSkills: {
    key: "trainedSkills",
    label: "Trained Skills",
    widget: "enum",
    parse: (value) => {
      const tags = scalarTags(value);
      return tags ? tags.map((t) => humanizeSlug(t)) : null;
    },
  },
  valued: {
    key: "valued",
    label: "Tracks a Value",
    widget: "enum",
    labelMap: { true: "Value-tracking", false: "Flat" },
  },
  ancestrySlug: {
    key: "ancestrySlug",
    label: "Ancestry",
    widget: "enum",
    parse: (value) => {
      const tags = scalarTags(value);
      return tags ? tags.map((t) => humanizeSlug(t)) : null;
    },
  },
  speed: numericRangeDef("speed", "Speed"),
};

/** Every facet key any category allowlists (the union `FACET_DEFS` must cover
 * exactly — see `facetDefs.test.ts`'s conformance suite). Computed here
 * rather than hand-duplicated so a future `facetKeys.ts` addition fails the
 * conformance test instead of silently shipping undefined. */
export function allFacetKeys(): readonly string[] {
  const keys = new Set<string>();
  for (const categoryKeys of Object.values(FACET_KEYS)) {
    for (const key of categoryKeys) keys.add(key);
  }
  return [...keys].sort();
}

export function facetDefFor(key: string): FacetDef | undefined {
  return FACET_DEFS[key];
}

/** enum widget: the tag(s) a row's raw facet value contributes to filter
 * matching / option counts. `undefined` in, `null`/`[]` parse result, or a
 * non-enum def all fold to `null` (the missing-key "—" bucket). */
export function enumTagsFor(
  def: FacetDef,
  value: RawFacetValue | undefined,
): readonly string[] | null {
  if (value === undefined || def.widget !== "enum") return null;
  if (def.parse) {
    const parsed = def.parse(value);
    return parsed && parsed.length > 0 ? parsed : null;
  }
  return scalarTags(value);
}

/** range widget: the numeric value a row's raw facet value contributes to
 * range matching. `undefined` in, unparseable, or a non-range def all fold to
 * `null` (the missing-key "—" bucket). */
export function numericValueFor(def: FacetDef, value: RawFacetValue | undefined): number | null {
  if (value === undefined || def.widget !== "range") return null;
  if (def.parseNumeric) return def.parseNumeric(value);
  return asNumber(value);
}

/** enum widget display label for one tag value. */
export function labelFor(def: FacetDef, value: string): string {
  return def.labelMap?.[value] ?? value;
}

// re-exported so a conformance test / the panel can cross-check against the
// allowlist's own banned-keys list without importing facetKeys.ts twice.
export { SPILLOVER_FACET_KEYS };
