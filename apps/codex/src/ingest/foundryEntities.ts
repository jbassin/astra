import { mapCategory } from "../../scripts/categoryMap";
import type {
  CodexEntity,
  CreatureStats,
  EmbeddedItem,
  Facets,
  HazardStats,
  Source,
  Stats,
} from "../schema/entity";
import type { BlockNode } from "../schema/nodes";
import type { EnricherContext } from "./enrichers";
import { parseFoundryHtml } from "./foundryHtml";
import { sluggify } from "./sluggify";

/**
 * Foundry pack doc → `CodexEntity` (D29-1/-3/-7/-8/-13, spec §2/§3, Deliverable
 * 3). One call per non-excluded Item/Actor pack doc — the caller (`parse-
 * foundry.ts`) walks packs via `categoryMap.ts` + `uuidResolve.ts`'s pack
 * registry and hands each doc here with a ready-made `EnricherContext` (its
 * `resolveUuid` already bound to THIS doc as the "containing document" for
 * relative `@UUID[.<id>]` resolution, D29-6).
 *
 * S2 scope note (no legacy-suffix / no join): identity here is always the
 * plain `{category}/{slug}` form — D29-1's `@legacy` suffixing requires
 * knowing which same-slug pairs are true remaster/legacy PAIRS (vs. unrelated
 * collisions), which needs the AoN side (`remaster_id`/`legacy_id`) that
 * doesn't exist until S3/S4. Same-slug collisions found here are collected +
 * reported (see `report("slugCollision", ...)`), not resolved — S4's
 * worklist, per the assignment brief.
 *
 * P1.6 widening (D29-19/-20, slice S6): `character`-typed Actors are now
 * EXCLUDED before assembly (D29-19, "npc-only creature import") — see the
 * exclusion check at the top of `assembleFoundryEntity`. `creature`/`hazard`
 * entities additionally gain a typed `stats` projection (`extractCreatureStats`/
 * `extractHazardStats`) and `melee`/`spellcastingEntry` embedded items gain
 * `attackBonus`/`damage`/`dc`/`attack`/`tradition` (`extractStrikeFields`/
 * `extractSpellcastingFields`) — schemaVersion 1->2, `src/ingest/emit.ts`'s
 * `CORPUS_SCHEMA_VERSION`.
 */

// ---------------------------------------------------------------------------
// raw Foundry doc shapes (structural subsets — never leaked past this module)
// ---------------------------------------------------------------------------

interface RawPublication {
  license?: string;
  remaster?: boolean;
  title?: string;
}

interface RawTraits {
  value?: string[];
  rarity?: string;
  size?: { value?: string };
  traditions?: string[];
}

/** `system.attributes.speed` (D29-20/P1.6, creature). */
interface RawSpeed {
  value?: number;
  otherSpeeds?: Array<{ type?: string; value?: number }>;
}

/** `system.attributes.{immunities,resistances,weaknesses}[]` entries (D29-20/
 * P1.6) — immunities carry only `type`; resistances/weaknesses also carry a
 * numeric `value`. One shared raw shape covers both (immunities simply never
 * populate `value`). */
interface RawTypedValue {
  type?: string;
  value?: number;
}

/** `system.perception` (D29-20/P1.6, creature). */
interface RawPerception {
  mod?: number;
  details?: string;
  senses?: Array<{ type?: string; acuity?: string; range?: number }>;
}

/** `system.attributes.stealth` (D29-20/P1.6, hazard). */
interface RawStealth {
  value?: number;
  details?: string;
}

interface RawSystem {
  description?: { value?: string };
  publication?: RawPublication;
  details?: {
    publication?: RawPublication;
    level?: { value?: number };
    /** D29-20/P1.6 (hazard): `system.details.languages` doesn't exist —
     * languages live here only for creatures; kept on the shared `details`
     * shape since both Actor kinds nest their type-specific fields under it. */
    languages?: { value?: string[] };
    /** D29-20/P1.6 (hazard): enricher HTML, parsed via `parseFoundryHtml`
     * (`foundryEntities.ts`'s `extractHazardStats`), not a scalar. */
    disable?: string;
    routine?: string;
    reset?: string;
    isComplex?: boolean;
  };
  traits?: RawTraits;
  attributes?: {
    hp?: { max?: number };
    ac?: { value?: number };
    speed?: RawSpeed;
    immunities?: RawTypedValue[];
    resistances?: RawTypedValue[];
    weaknesses?: RawTypedValue[];
    /** D29-20/P1.6 (hazard). */
    hardness?: number;
    stealth?: RawStealth;
  };
  saves?: {
    fortitude?: { value?: number };
    reflex?: { value?: number };
    will?: { value?: number };
  };
  perception?: RawPerception;
  /** D29-20/P1.6 (creature): `system.abilities.*.mod`. */
  abilities?: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", { mod?: number }>>;
  /** D29-20/P1.6 (creature): `system.skills.*.base`, keyed on the skill slug. */
  skills?: Record<string, { base?: number }>;
  level?: { value?: number };
  actionType?: { value?: string };
  actions?: { value?: number | null };
  prerequisites?: { value?: Array<{ value?: string }> };
  price?: { value?: Record<string, number>; per?: number };
  bulk?: { value?: number };
  usage?: { value?: string };
  category?: string;
  time?: { value?: string };
  range?: { value?: string };
  area?: { type?: string; value?: number };
  duration?: { value?: string; sustained?: boolean };
  defense?: { save?: { basic?: boolean; statistic?: string } };
  /** D29-20/P1.6 (`melee`-typed embedded item): `system.bonus.value`. */
  bonus?: { value?: number };
  /** D29-20/P1.6 (`melee`-typed embedded item): `system.damageRolls`, an
   * object keyed on an opaque per-roll id — iteration/`Object.values` order is
   * the JSON's own on-disk key order, stable across re-transforms (the D-gate
   * reads the same bytes off disk every run). */
  damageRolls?: Record<string, { damage?: string; damageType?: string }>;
  /** D29-20/P1.6 (`spellcastingEntry`-typed embedded item). */
  spelldc?: { dc?: number; value?: number };
  tradition?: { value?: string };

  // ---- P3 S1 (D29-33a): the 5 extractor-gap categories. These raw field
  // NAMES are not guaranteed structurally unique across categories the way
  // e.g. `price`/`bulk` are — `extractGapFacets` below gates every read on
  // `category` before touching them (see that function's own comment). ----
  /** ancestry Item `system.hp` — a bare number (verified on Tengu: `"hp":
   * 6` at the system root), NOT the nested Actor `attributes.hp.max` path
   * `hp`'s existing generic read above targets. */
  hp?: number;
  /** ancestry Item `system.size` — a bare string (verified on Tengu:
   * `"size": "med"`), NOT the nested Actor `traits.size.value` path. */
  size?: string;
  /** ancestry Item `system.speed` — a bare number (verified on Tengu:
   * `"speed": 25`), distinct from the Actor `attributes.speed` object the
   * `RawSpeed`/`extractSpeeds` stats path reads. */
  speed?: number;
  /** class Item `system.keyAbility.value` (verified on Swashbuckler `["dex"]`,
   * Champion `["dex","str"]`, Psychic `[]`). */
  keyAbility?: { value?: string[] };
  /** background Item `system.trainedSkills` — `.value` is the fixed
   * skill-slug list (read); `.lore` is free-text background flavor (e.g.
   * "Academia Lore") — real, typed here for shape-fidelity, but
   * deliberately NOT read by `extractGapFacets` (near-1:1 cardinality,
   * would fail the classifier). */
  trainedSkills?: { value?: string[]; lore?: string[] };
  /** condition Item `system.value` — `.isValued` is read; `.value` (the
   * numeric magnitude itself, e.g. clumsy 1/2/3) is real, typed for
   * shape-fidelity, but out of this slice's scope (a per-condition numeric
   * range, not a flat facet). */
  value?: { isValued?: boolean; value?: number | null };
  /** heritage Item `system.ancestry` — `.slug` is read; `.name`/`.uuid` are
   * real (typed for shape-fidelity) but redundant with the slug for facet
   * purposes. */
  ancestry?: { name?: string; slug?: string; uuid?: string };
}

export interface RawFoundryDoc {
  _id: string;
  name: string;
  type?: string;
  system?: RawSystem;
  items?: RawFoundryDoc[];
}

export type ReportFn = (cls: string, detail: string) => void;

// ---------------------------------------------------------------------------
// source/edition (D29-13)
// ---------------------------------------------------------------------------

/** Actors carry publication at `system.details.publication`; every other
 * Item-shaped doc carries it at `system.publication` (D29-13, verified on
 * Balor vs. Fireball/weapons/feats/etc). */
function readPublication(
  system: RawSystem | undefined,
  docClass: "Actor" | "Item",
): RawPublication | undefined {
  return docClass === "Actor" ? system?.details?.publication : system?.publication;
}

/**
 * D29-13: `source.license` + `edition` from the doc's own publication data.
 * Missing publication (163 real docs — Kingmaker armies, iconics, pregens,
 * verified) or a license value outside ORC/OGL resolves `"unknown"`
 * (report-counted, per spec allowed as residue reviewed at S4). `remaster`
 * absent OR `false` both read as `edition: "legacy"` — a doc with genuinely no
 * publication metadata has no signal either way, so defaulting to the more
 * conservative (non-remaster) edition is the documented S2 choice, distinct
 * from the `missingPublication` report class that already flags it for
 * review.
 */
function deriveSourceAndEdition(
  publication: RawPublication | undefined,
  report: ReportFn,
): { source: Source; edition: "remaster" | "legacy" } {
  if (!publication) {
    report("missingPublication", "(no system.publication / system.details.publication)");
    return { source: { book: "unknown", license: "unknown" }, edition: "legacy" };
  }
  const license =
    publication.license === "ORC" || publication.license === "OGL"
      ? publication.license
      : "unknown";
  if (license === "unknown") report("unknownLicense", publication.license ?? "(none)");
  const book = publication.title && publication.title.length > 0 ? publication.title : "unknown";
  return {
    source: { book, license },
    edition: publication.remaster === true ? "remaster" : "legacy",
  };
}

// ---------------------------------------------------------------------------
// facets (field-presence-driven, not category-gated — every field below is
// optional in FacetsSchema, and reading a field that happens not to exist for
// a given category is harmless; this avoids a second, redundant category
// dispatch alongside categoryMap.ts's, per the deliverable's "facets per
// entity.ts's typed sets" brief)
// ---------------------------------------------------------------------------

const DENOM_ORDER = ["pp", "gp", "sp", "cp"] as const;

function formatPrice(price: RawSystem["price"]): string | undefined {
  if (!price?.value) return undefined;
  const parts = DENOM_ORDER.filter((d) => price.value?.[d]).map((d) => `${price.value?.[d]} ${d}`);
  if (parts.length === 0) return undefined;
  const base = parts.join(", ");
  return price.per !== undefined && price.per !== 1 ? `${base} per ${price.per}` : base;
}

function formatArea(area: RawSystem["area"]): string | undefined {
  if (!area?.type || area.value === undefined) return undefined;
  return `${area.value}-foot ${area.type}`;
}

function formatDuration(duration: RawSystem["duration"]): string | undefined {
  if (duration?.sustained) return duration.value ? `sustained (${duration.value})` : "sustained";
  return duration?.value && duration.value.length > 0 ? duration.value : undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDefense(defense: RawSystem["defense"]): string | undefined {
  const statistic = defense?.save?.statistic;
  if (!statistic) return undefined;
  return defense.save?.basic ? `basic ${capitalize(statistic)}` : capitalize(statistic);
}

/** `system.actionType.value` ("action"/"reaction"/"free"/"passive") +
 * `system.actions.value` (1/2/3, only meaningful when actionType is "action")
 * → the display action-cost token entity.ts's `actionCost` field expects. */
function extractActionCost(system: RawSystem | undefined): string | undefined {
  const actionType = system?.actionType?.value;
  if (!actionType) return undefined;
  if (actionType === "action") {
    const n = system?.actions?.value;
    return n === null || n === undefined ? undefined : String(n);
  }
  return actionType;
}

/**
 * S4 emit-gate finding (real corpus, not caught by any S2/S3 unit fixture): a
 * real minority of docs carry an explicit JSON `null` for a field this module
 * otherwise treats as "absent" (`system.category`, `system.attributes.ac.value`,
 * a hazard's AC, ...) — a bare `!== undefined` check let those literal
 * `null`s through into a non-nullable-typed `Facets` field, failing
 * `CodexEntitySchema.parse` at emit time (acceptance C's 100%-Zod-valid gate
 * is the FIRST real runtime validation of a full `CodexEntity`, so this is
 * exactly the kind of drift it exists to catch). A type-guard narrows the
 * same optional-chain expression the same way `!== undefined` did, so every
 * call site below is a mechanical swap, not a logic change. */
function present<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

/**
 * P3 S1 (D29-33a): the 5 extractor-gap categories — ancestry (hp/size/speed),
 * class (keyAbility/hp), background (trainedSkills), condition (the
 * value-bearing flag), heritage (ancestry linkage). CATEGORY-GATED (unlike
 * `extractFacets`'s field-presence-driven posture above) because these raw
 * field names aren't provably unique across every one of the corpus's other
 * ~85 categories the way `price`/`bulk`/`usage` are (verified only for these
 * 5's own doc shapes) — gating on `category` is what keeps a same-named
 * field on some unrelated category's doc from silently becoming a bogus
 * facet. Every candidate here still ships into `entity.facets` regardless of
 * whether it clears `facetKeys.ts`'s classifier (report.md's facet-coverage
 * section records the measured outcome; a failing candidate stays
 * page-detail-only, never a browse/search filter, per D29-33a's "no silent
 * junk facets" guard).
 */
function extractGapFacets(category: string, system: RawSystem | undefined): Facets {
  switch (category) {
    case "ancestry": {
      const facets: Facets = {};
      if (present(system?.hp)) facets.hp = system.hp;
      if (present(system?.size)) facets.size = system.size;
      if (present(system?.speed)) facets.speed = system.speed;
      return facets;
    }
    case "class": {
      const facets: Facets = {};
      if (present(system?.hp)) facets.hp = system.hp;
      if (present(system?.keyAbility?.value)) facets.keyAbility = system.keyAbility.value;
      return facets;
    }
    case "background": {
      const facets: Facets = {};
      if (present(system?.trainedSkills?.value)) facets.trainedSkills = system.trainedSkills.value;
      return facets;
    }
    case "condition": {
      const facets: Facets = {};
      if (present(system?.value?.isValued)) facets.valued = system.value.isValued;
      return facets;
    }
    case "heritage": {
      const facets: Facets = {};
      if (present(system?.ancestry?.slug)) facets.ancestrySlug = system.ancestry.slug;
      return facets;
    }
    default:
      return {};
  }
}

function extractFacets(system: RawSystem | undefined, category: string): Facets {
  const facets: Facets = { ...extractGapFacets(category, system) };

  // creature (Actor)
  if (present(system?.attributes?.hp?.max)) facets.hp = system.attributes.hp.max;
  if (present(system?.attributes?.ac?.value)) facets.ac = system.attributes.ac.value;
  if (present(system?.saves?.fortitude?.value)) facets.fortitudeSave = system.saves.fortitude.value;
  if (present(system?.saves?.reflex?.value)) facets.reflexSave = system.saves.reflex.value;
  if (present(system?.saves?.will?.value)) facets.willSave = system.saves.will.value;
  if (present(system?.perception?.mod)) facets.perception = system.perception.mod;
  if (present(system?.traits?.size?.value)) facets.size = system.traits.size.value;

  // spell
  if (present(system?.level?.value)) facets.rank = system.level.value;
  if (present(system?.traits?.traditions)) facets.traditions = system.traits.traditions;
  if (present(system?.time?.value)) facets.castTime = system.time.value;
  if (present(system?.range?.value)) facets.range = system.range.value;
  const area = formatArea(system?.area);
  if (area !== undefined) facets.area = area;
  const duration = formatDuration(system?.duration);
  if (duration !== undefined) facets.duration = duration;
  const defense = formatDefense(system?.defense);
  if (defense !== undefined) facets.defense = defense;

  // equipment family
  const price = formatPrice(system?.price);
  if (price !== undefined) facets.price = price;
  if (present(system?.bulk?.value)) facets.bulk = system.bulk.value;
  if (present(system?.usage?.value)) facets.usage = system.usage.value;
  if (present(system?.category)) facets.itemCategory = system.category;

  // feat
  if (present(system?.level?.value)) facets.featLevel = system.level.value;
  if (present(system?.prerequisites?.value)) {
    facets.prerequisites = system.prerequisites.value
      .map((p) => p.value)
      .filter((v): v is string => v !== undefined);
  }
  const actionCost = extractActionCost(system);
  if (actionCost !== undefined) facets.actionCost = actionCost;

  return facets;
}

// ---------------------------------------------------------------------------
// stats (D29-20, P1.6 addendum) — deterministic field mapping off the Actor
// `system.*` shape into the typed `CreatureStats`/`HazardStats` union. Every
// helper here follows the same convention as `extractFacets` above: absent
// source field -> absent (never defaulted/never an empty array/object) — see
// `present()`'s own doc comment for why a bare `!==undefined` isn't enough.
// ---------------------------------------------------------------------------

function extractSpeeds(speed: RawSpeed | undefined): CreatureStats["speeds"] | undefined {
  const other = (speed?.otherSpeeds ?? [])
    .filter((s): s is { type: string; value: number } => present(s.type) && present(s.value))
    .map((s) => ({ type: s.type, value: s.value }));
  if (!present(speed?.value) && other.length === 0) return undefined;
  return {
    ...(present(speed?.value) ? { base: speed.value } : {}),
    ...(other.length > 0 ? { other } : {}),
  };
}

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

function extractAbilityMods(
  abilities: RawSystem["abilities"],
): CreatureStats["abilityMods"] | undefined {
  if (!abilities) return undefined;
  const out: Partial<Record<(typeof ABILITY_KEYS)[number], number>> = {};
  for (const key of ABILITY_KEYS) {
    const mod = abilities[key]?.mod;
    if (present(mod)) out[key] = mod;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extractSenses(perception: RawPerception | undefined): CreatureStats["senses"] | undefined {
  const list = (perception?.senses ?? [])
    .filter((s): s is { type: string; acuity?: string; range?: number } => present(s.type))
    .map((s) => {
      const entry: { type: string; acuity?: string; range?: number } = { type: s.type };
      if (present(s.acuity)) entry.acuity = s.acuity;
      if (present(s.range)) entry.range = s.range;
      return entry;
    });
  const details =
    present(perception?.details) && perception.details.length > 0 ? perception.details : undefined;
  if (!present(perception?.mod) && list.length === 0 && details === undefined) return undefined;
  return {
    ...(present(perception?.mod) ? { mod: perception.mod } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(list.length > 0 ? { list } : {}),
  };
}

function extractLanguages(details: RawSystem["details"]): string[] | undefined {
  const langs = details?.languages?.value;
  return langs && langs.length > 0 ? langs : undefined;
}

function extractImmunities(
  attributes: RawSystem["attributes"],
): CreatureStats["immunities"] | undefined {
  const list = attributes?.immunities;
  if (!list || list.length === 0) return undefined;
  const out = list.map((i) => i?.type).filter((t): t is string => present(t));
  return out.length > 0 ? out : undefined;
}

function extractTypedValues(
  list: RawTypedValue[] | undefined,
): Array<{ type: string; value?: number }> | undefined {
  if (!list || list.length === 0) return undefined;
  const out = list
    .filter((v): v is RawTypedValue & { type: string } => present(v?.type))
    .map((v) => {
      const entry: { type: string; value?: number } = { type: v.type };
      if (present(v.value)) entry.value = v.value;
      return entry;
    });
  return out.length > 0 ? out : undefined;
}

function extractSkills(skills: RawSystem["skills"]): CreatureStats["skills"] | undefined {
  if (!skills) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(skills)) {
    if (present(value?.base)) out[key] = value.base;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Extracts `CreatureStats` from an Actor's `system` — only called for
 * `category === "creature"` docs (npc/familiar; `character` docs never reach
 * assembly at all, D29-19). Returns `undefined` when nothing at all is
 * extractable (e.g. a bare-bones familiar) rather than an all-empty object,
 * matching `embeddedItems`/`loreBody`'s own "never an empty placeholder"
 * convention. */
function extractCreatureStats(system: RawSystem | undefined): CreatureStats | undefined {
  const speeds = extractSpeeds(system?.attributes?.speed);
  const abilityMods = extractAbilityMods(system?.abilities);
  const senses = extractSenses(system?.perception);
  const languages = extractLanguages(system?.details);
  const immunities = extractImmunities(system?.attributes);
  const resistances = extractTypedValues(system?.attributes?.resistances);
  const weaknesses = extractTypedValues(system?.attributes?.weaknesses);
  const skills = extractSkills(system?.skills);
  if (
    speeds === undefined &&
    abilityMods === undefined &&
    senses === undefined &&
    languages === undefined &&
    immunities === undefined &&
    resistances === undefined &&
    weaknesses === undefined &&
    skills === undefined
  ) {
    return undefined;
  }
  return {
    kind: "creature",
    ...(speeds !== undefined ? { speeds } : {}),
    ...(abilityMods !== undefined ? { abilityMods } : {}),
    ...(senses !== undefined ? { senses } : {}),
    ...(languages !== undefined ? { languages } : {}),
    ...(immunities !== undefined ? { immunities } : {}),
    ...(resistances !== undefined ? { resistances } : {}),
    ...(weaknesses !== undefined ? { weaknesses } : {}),
    ...(skills !== undefined ? { skills } : {}),
  };
}

/** `disable`/`routine`/`reset` are enricher HTML parsed via the existing
 * `parseFoundryHtml` path — but fail-SOFT per field (report class
 * `hazardStatsHtmlFailed`, field omitted), unlike the entity `body` path's
 * hard-fail posture. Rationale (S6 real-transform finding): exactly one
 * upstream pack doc (`pfs-season-6-bestiary/6-00/historys-repetition-7-8`)
 * carries a genuine TYPO in its `disable` field (`@Check[thievery|dc:28
 * (expert)` — the closing `]` is missing in the published pack), markup that
 * was never parsed before P1.6 opened these three fields. A hard fail there
 * would abort the whole transform on data this pipeline can't fix; omitting
 * the one broken field and counting it keeps the failure loud + report-
 * visible (spec §5 B's "explicitly allowlisted, report-visible decision")
 * without weakening the body path's drift tripwire. */
function parseHazardHtmlSoft(
  html: string | null | undefined,
  field: string,
  ctx: EnricherContext,
  report: ReportFn,
): BlockNode[] | undefined {
  if (!present(html) || html.length === 0) return undefined;
  try {
    return parseFoundryHtml(html, ctx);
  } catch (e) {
    report("hazardStatsHtmlFailed", `${field}: ${String(e)}`);
    return undefined;
  }
}

/** Extracts `HazardStats` from a hazard Actor's `system` — only called for
 * `category === "hazard"` docs. `disable`/`routine`/`reset` are enricher HTML
 * (D29-20: NOT scalars), parsed via the same `parseFoundryHtml(html, ctx)`
 * path every other body field in this module already uses (fail-soft per
 * field — see `parseHazardHtmlSoft` above). */
function extractHazardStats(
  system: RawSystem | undefined,
  ctx: EnricherContext,
  report: ReportFn,
): HazardStats | undefined {
  const hardness = present(system?.attributes?.hardness) ? system.attributes.hardness : undefined;
  const stealthRaw = system?.attributes?.stealth;
  const stealthDetails =
    present(stealthRaw?.details) && stealthRaw.details.length > 0 ? stealthRaw.details : undefined;
  const stealth =
    present(stealthRaw?.value) || stealthDetails !== undefined
      ? {
          ...(present(stealthRaw?.value) ? { value: stealthRaw.value } : {}),
          ...(stealthDetails !== undefined ? { details: stealthDetails } : {}),
        }
      : undefined;
  // `present()` (not a bare `!== undefined`) throughout — the real corpus
  // carries literal JSON `null` for routine/disable/reset/isComplex on a
  // minority of hazard docs (the S4 emit-gate lesson, re-proven live on the
  // first S6 real-transform run).
  const isComplex = present(system?.details?.isComplex) ? system.details.isComplex : undefined;
  const disable = parseHazardHtmlSoft(system?.details?.disable, "disable", ctx, report);
  const routine = parseHazardHtmlSoft(system?.details?.routine, "routine", ctx, report);
  const reset = parseHazardHtmlSoft(system?.details?.reset, "reset", ctx, report);
  if (
    hardness === undefined &&
    stealth === undefined &&
    isComplex === undefined &&
    disable === undefined &&
    routine === undefined &&
    reset === undefined
  ) {
    return undefined;
  }
  return {
    kind: "hazard",
    ...(hardness !== undefined ? { hardness } : {}),
    ...(stealth !== undefined ? { stealth } : {}),
    ...(isComplex !== undefined ? { isComplex } : {}),
    ...(disable !== undefined ? { disable } : {}),
    ...(routine !== undefined ? { routine } : {}),
    ...(reset !== undefined ? { reset } : {}),
  };
}

function extractStats(
  category: string,
  system: RawSystem | undefined,
  ctx: EnricherContext,
  report: ReportFn,
): Stats | undefined {
  if (category === "creature") return extractCreatureStats(system);
  if (category === "hazard") return extractHazardStats(system, ctx, report);
  return undefined;
}

// ---------------------------------------------------------------------------
// embedded items (S2 widening, entity.ts's EmbeddedItemSchema)
// ---------------------------------------------------------------------------

function formatDamageRoll(
  roll: { damage?: string; damageType?: string } | undefined,
): string | undefined {
  if (!present(roll?.damage)) return undefined;
  return present(roll.damageType) && roll.damageType.length > 0
    ? `${roll.damage} ${roll.damageType}`
    : roll.damage;
}

function extractDamage(damageRolls: RawSystem["damageRolls"]): string[] | undefined {
  if (!damageRolls) return undefined;
  // `Object.values` iterates in the object's own insertion order (its keys
  // here are opaque, non-numeric-looking ids, so no integer-key reordering
  // applies) — the same order the raw JSON was written in on disk, so this
  // stays deterministic across re-transforms without an explicit sort.
  const out = Object.values(damageRolls)
    .map(formatDamageRoll)
    .filter((s): s is string => s !== undefined);
  return out.length > 0 ? out : undefined;
}

/** D29-20 (P1.6): a `melee`-typed strike item's to-hit bonus + flattened
 * damage rolls. Absent for every other item type (the source fields simply
 * don't exist on them). */
function extractStrikeFields(
  system: RawSystem | undefined,
): Pick<EmbeddedItem, "attackBonus" | "damage"> {
  const attackBonus = present(system?.bonus?.value) ? system.bonus.value : undefined;
  const damage = extractDamage(system?.damageRolls);
  return {
    ...(attackBonus !== undefined ? { attackBonus } : {}),
    ...(damage !== undefined ? { damage } : {}),
  };
}

/** D29-20 (P1.6): a `spellcastingEntry`-typed item's DC/attack/tradition.
 * Absent for every other item type. */
function extractSpellcastingFields(
  system: RawSystem | undefined,
): Pick<EmbeddedItem, "dc" | "attack" | "tradition"> {
  const dc = present(system?.spelldc?.dc) ? system.spelldc.dc : undefined;
  const attack = present(system?.spelldc?.value) ? system.spelldc.value : undefined;
  const tradition = present(system?.tradition?.value) ? system.tradition.value : undefined;
  return {
    ...(dc !== undefined ? { dc } : {}),
    ...(attack !== undefined ? { attack } : {}),
    ...(tradition !== undefined ? { tradition } : {}),
  };
}

function assembleEmbeddedItem(item: RawFoundryDoc, ctx: EnricherContext): EmbeddedItem {
  const html = item.system?.description?.value ?? "";
  const body: BlockNode[] = html.length > 0 ? parseFoundryHtml(html, ctx) : [];
  const level = item.system?.level?.value;
  const actionCost = extractActionCost(item.system);
  return {
    name: item.name,
    slug: sluggify(item.name),
    type: item.type ?? "unknown",
    ...(present(level) ? { level } : {}),
    ...(actionCost !== undefined ? { actionCost } : {}),
    traits: item.system?.traits?.value ?? [],
    body,
    // D29-20: field-presence-driven, not item-type-gated (mirrors
    // `extractFacets`'s own posture) — a non-strike/non-spellcasting item
    // simply has none of these raw fields, so the extractors return {}.
    ...extractStrikeFields(item.system),
    ...extractSpellcastingFields(item.system),
  };
}

// ---------------------------------------------------------------------------
// the assembly entry point
// ---------------------------------------------------------------------------

export interface AssembleFoundryEntityParams {
  packDir: string;
  docClass: "Actor" | "Item";
  /** The pack file's own basename (no `.json`) — D29-1's identity source; also
   * checked against `sluggify(doc.name)` (report class `slugMismatch` on
   * disagreement — verified 0/28,636 in the real snapshot, so this should
   * never fire on real data). */
  basename: string;
  doc: RawFoundryDoc;
  ctx: EnricherContext;
  report: ReportFn;
  /** Every codex id assigned SO FAR in this run, `id → true` — used only to
   * detect + report same-slug collisions (S4's worklist, not resolved here).
   * Mutated in place (the caller owns one shared set across the whole walk). */
  seenIds: Set<string>;
}

/**
 * Assembles one non-excluded Item/Actor pack doc into a `CodexEntity`.
 * Returns `undefined` when `categoryMap.ts` says this (pack,type) pair is
 * excluded (D29-8) — the caller should simply skip it (still present in the
 * uuid index as an `excluded` target via `uuidResolve.ts`, independent of this
 * function).
 */
export function assembleFoundryEntity(
  params: AssembleFoundryEntityParams,
): CodexEntity | undefined {
  const { packDir, docClass, basename, doc, ctx, report, seenIds } = params;

  // D29-19 (P1.6, stakeholder): npc-only creature import — `character`-typed
  // Actors (the `iconics` per-level pregens, `paizo-pregens`, and Kingmaker
  // companion builds) are PC builds whose AC/HP/saves are runtime-derived by
  // the pf2e system (the 0028 source-vs-live finding), not statable from
  // source — excluded here (report-counted `excludedActors`), BEFORE
  // `categoryMap.ts` ever sees the doc (categoryMap.ts's own `character` ->
  // `creature` mapping stays documented/tested there for completeness; this
  // exclusion runs first in the real pipeline so that mapping is never
  // reached for a live `character` doc). This narrows the FOUNDRY import
  // only — an AoN-joined pregen twin (e.g. `creature/amiri-level-1`) still
  // ships as an AoN-only page, D29-14(a); it just never merges with a
  // Foundry `character` doc anymore.
  if (docClass === "Actor" && doc.type === "character") {
    report("excludedActors", `${packDir}/${basename}.json: "${doc.name}"`);
    return undefined;
  }

  const decision = mapCategory(packDir, doc.type ?? "__NO_TYPE__");
  if (decision.kind === "excluded") return undefined;

  const expectedSlug = sluggify(doc.name);
  if (expectedSlug !== basename) {
    report(
      "slugMismatch",
      `${packDir}/${basename}.json: sluggify("${doc.name}") = "${expectedSlug}"`,
    );
  }
  const slug = basename;
  const id = `${decision.category}/${slug}`;
  if (seenIds.has(id)) {
    report("slugCollision", id);
  } else {
    seenIds.add(id);
  }

  const publication = readPublication(doc.system, docClass);
  const { source, edition } = deriveSourceAndEdition(publication, report);

  const level = docClass === "Actor" ? doc.system?.details?.level?.value : doc.system?.level?.value;

  const html = doc.system?.description?.value ?? "";
  const body: BlockNode[] = html.length > 0 ? parseFoundryHtml(html, ctx) : [];

  const embeddedItems =
    doc.items && doc.items.length > 0
      ? doc.items.map((item) => assembleEmbeddedItem(item, ctx))
      : undefined;

  const stats = extractStats(decision.category, doc.system, ctx, report);

  return {
    id,
    slug,
    category: decision.category,
    name: doc.name,
    edition,
    source,
    ...(present(level) ? { level } : {}),
    traits: doc.system?.traits?.value ?? [],
    ...(present(doc.system?.traits?.rarity) ? { rarity: doc.system.traits.rarity } : {}),
    body,
    facets: extractFacets(doc.system, decision.category),
    ...(embeddedItems !== undefined ? { embeddedItems } : {}),
    ...(stats !== undefined ? { stats } : {}),
  };
}
