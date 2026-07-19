import { mapCategory } from "../../scripts/categoryMap";
import type {
  ClassStats,
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
 *
 * P7 S1 widening (D29-73/D29-74): `melee`-typed embedded items additionally
 * gain a transform-baked `range` display string off `system.range.
 * {increment,max}` (`extractStrikeFields`'s new `formatStrikeRange` call) —
 * schemaVersion 2->3. And a creature's `type:"lore"` embedded items'
 * `system.mod.value` now merges into `stats.skills` (`mergeLoreSkills`,
 * called from `extractCreatureStats`) — same `skills` record shape, no
 * schema change of its own.
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

/** class Item `system.attacks` (D29-113/P12 S1) — proficiency ranks per
 * weapon-group column; `other` is a fixed 5th key on ALL 27 raw docs
 * (verified), empty (`{name:"",rank:0}`) on 24. */
interface RawClassAttacks {
  simple?: number;
  martial?: number;
  advanced?: number;
  unarmed?: number;
  other?: { name?: string; rank?: number };
}

/** class Item `system.defenses` (D29-113/P12 S1) — proficiency ranks per
 * armor-category column. */
interface RawClassDefenses {
  unarmored?: number;
  light?: number;
  medium?: number;
  heavy?: number;
}

/** class Item `system.savingThrows` (D29-113/P12 S1) — bare numeric ranks
 * (verified on Fighter: `{fortitude:2,reflex:2,will:1}`), NOT the nested
 * Actor `saves.*.value` shape `saves` below holds for creature/hazard. */
interface RawClassSavingThrows {
  fortitude?: number;
  reflex?: number;
  will?: number;
}

/** class Item `system.{class,ancestry,skill,general}FeatLevels`/
 * `skillIncreaseLevels` (D29-113/P12 S1) — each a `{value: number[]}`
 * wrapper. */
interface RawClassFeatLevels {
  value?: number[];
}

/** class Item `system.items` (D29-114/P12 S1) — the granted-feature
 * manifest: an opaque-keyed dict of `{level, name, uuid}` entries, each
 * `uuid` a `Compendium.pf2e.classfeatures.Item.<name>`-shaped reference
 * (verified: all 520 real raw grants). Read only by
 * `extractRawGrantedFeatures` below — the post-drop `augmentClassStats` pass
 * (D29-114) needs this raw manifest (subclass AoN-only docs, and thus the
 * final kept-id set a grant's uuid resolves against, don't exist until
 * AFTER `join.ts`/`drop.ts` run) so `transform.ts`'s orchestrator carries the
 * RETURNED TYPED array forward as a side channel — never the raw dict
 * itself, keeping "raw shapes never leaked past this module" intact. */
interface RawClassGrantedFeature {
  level?: number;
  name?: string;
  uuid?: string;
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
  /** Two distinct real shapes share this one raw field name: a creature
   * Actor's `system.perception` (a nested `RawPerception` object) and a
   * class Item's `system.perception` (D29-113/P12 S1, a BARE NUMBER — the
   * proficiency rank, verified on Fighter: `2`) — same "shared field name,
   * disjoint category populations" convention as `range` below. Read via
   * `perceptionObject()`/a bare `typeof === "number"` check, never a direct
   * property access, so the two shapes can never cross-contaminate. */
  perception?: RawPerception | number;
  /** D29-20/P1.6 (creature): `system.abilities.*.mod`. */
  abilities?: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", { mod?: number }>>;
  /** D29-20/P1.6 (creature): `system.skills.*.base`, keyed on the skill slug. */
  skills?: Record<string, { base?: number }>;
  /** class Item `system.savingThrows`/`attacks`/`defenses` (D29-113/P12 S1). */
  savingThrows?: RawClassSavingThrows;
  attacks?: RawClassAttacks;
  defenses?: RawClassDefenses;
  /** class Item `system.spellcasting` (D29-113/P12 S1) — raw 0/1. */
  spellcasting?: number;
  classFeatLevels?: RawClassFeatLevels;
  ancestryFeatLevels?: RawClassFeatLevels;
  generalFeatLevels?: RawClassFeatLevels;
  skillFeatLevels?: RawClassFeatLevels;
  skillIncreaseLevels?: RawClassFeatLevels;
  /** class Item `system.items` (D29-114/P12 S1) — see `RawClassGrantedFeature`'s
   * own doc comment. Distinct from `RawFoundryDoc.items` (the top-level
   * embedded-item ARRAY every Actor doc carries) — this is a DICT, one level
   * deeper, under `system`. */
  items?: Record<string, RawClassGrantedFeature>;
  /** D29-74 (P7, `lore`-typed embedded item): `system.mod.value` — the
   * lore's flat skill bonus (verified on `abberton-ruffian`'s "Gambling
   * Lore" = 1 / `ailuran`'s "Silver Lore" = 13), merged into the owning
   * creature's `stats.skills` by `mergeLoreSkills` below. */
  mod?: { value?: number };
  level?: { value?: number };
  actionType?: { value?: string };
  actions?: { value?: number | null };
  prerequisites?: { value?: Array<{ value?: string }> };
  price?: { value?: Record<string, number>; per?: number };
  bulk?: { value?: number };
  usage?: { value?: string };
  category?: string;
  time?: { value?: string };
  /** Two distinct real shapes share this one raw field name: a spell Item's
   * `system.range.value` (a free-text string, e.g. "30 feet"/"touch" — read
   * by `extractFacets`'s `facets.range`) and a `melee`-typed embedded
   * strike's `system.range.{increment,max}` (D29-73/P7, `formatStrikeRange`
   * below) — both nullable numbers in the raw JSON (`{"increment": null,
   * "max": 10}`, verified on `abberton-ruffian`'s Thrown Bottle /
   * `ailuran`'s Boomerang). Harmless to share one interface: a spell's
   * `range` object never carries `increment`/`max`, and a strike's never
   * carries `value`, so each extractor only ever sees its own sub-shape
   * populated. */
  range?: { value?: string; increment?: number | null; max?: number | null };
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
   * would fail the classifier). class Item `system.trainedSkills`
   * (D29-113/P12 S1) shares this same field name/shape — `.value` is its
   * fixed skill-slug list too, plus `.additional` (a bare number of
   * player-chosen bonus trained skills) which background's own doc never
   * carries. */
  trainedSkills?: { value?: string[]; lore?: string[]; additional?: number };
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

/** Narrows the shared `system.perception` field to its creature-Actor
 * (`RawPerception` object) shape — a class Item's own `system.perception` is
 * a bare number (D29-113/P12 S1), which this returns `undefined` for. See
 * the `RawSystem.perception` field's own doc comment. */
function perceptionObject(p: RawSystem["perception"]): RawPerception | undefined {
  return typeof p === "object" ? p : undefined;
}

function extractFacets(system: RawSystem | undefined, category: string): Facets {
  const facets: Facets = { ...extractGapFacets(category, system) };

  // creature (Actor)
  if (present(system?.attributes?.hp?.max)) facets.hp = system.attributes.hp.max;
  if (present(system?.attributes?.ac?.value)) facets.ac = system.attributes.ac.value;
  if (present(system?.saves?.fortitude?.value)) facets.fortitudeSave = system.saves.fortitude.value;
  if (present(system?.saves?.reflex?.value)) facets.reflexSave = system.saves.reflex.value;
  if (present(system?.saves?.will?.value)) facets.willSave = system.saves.will.value;
  const perception = perceptionObject(system?.perception);
  if (present(perception?.mod)) facets.perception = perception.mod;
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

/** D29-74 (P7): folds `type:"lore"` embedded items' `system.mod.value` into
 * the creature's `skills` record, keyed on `sluggify(item.name)` — the same
 * slug convention `assembleEmbeddedItem`'s own `slug` field uses — so the
 * lore bonus (otherwise visible only on the embedded item) surfaces in the
 * structured Skills row too (`SkillsRow`, render-side, S2). Two guarded
 * cases (both report-visible, never silent):
 *   - a lore slug that collides with a genuine CORE skill key (report class
 *     `loreSkillCoreCollision`) — the real corpus carries zero of these
 *     (verified), but a future pack addition must not silently clobber a
 *     trained core skill's real value, so the core value wins and the lore
 *     item is skipped;
 *   - a same-slug DUPLICATE lore item on one actor (report class
 *     `loreSkillDuplicateSlug`; 3 known real cases, e.g. two "Abyss Lore"
 *     entries on one creature) — last-write-wins, in the doc's own on-disk
 *     item order (same determinism guarantee `extractDamage`'s
 *     `Object.values` comment documents for embedded items generally).
 * NOT called for hazard docs — see `extractStats`'s own comment
 * (`HazardStatsSchema` has no `skills` field; a future hazard lore item must
 * not vanish silently, hence the comment there rather than a mechanism
 * here). */
function mergeLoreSkills(
  coreSkills: CreatureStats["skills"],
  items: RawFoundryDoc[] | undefined,
  report: ReportFn,
): CreatureStats["skills"] | undefined {
  if (!items || items.length === 0) return coreSkills;
  const out: Record<string, number> = { ...coreSkills };
  for (const item of items) {
    if (item.type !== "lore") continue;
    const mod = item.system?.mod?.value;
    if (!present(mod)) continue;
    const slug = sluggify(item.name);
    if (coreSkills && Object.prototype.hasOwnProperty.call(coreSkills, slug)) {
      report("loreSkillCoreCollision", `${item.name} (slug "${slug}")`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(out, slug)) {
      report("loreSkillDuplicateSlug", `${item.name} (slug "${slug}")`);
    }
    out[slug] = mod;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Extracts `CreatureStats` from an Actor's `system` — only called for
 * `category === "creature"` docs (npc/familiar; `character` docs never reach
 * assembly at all, D29-19). Returns `undefined` when nothing at all is
 * extractable (e.g. a bare-bones familiar) rather than an all-empty object,
 * matching `embeddedItems`/`loreBody`'s own "never an empty placeholder"
 * convention. `items` (D29-74, P7): the Actor's raw embedded-item list, so
 * lore skills can merge into `skills` — see `mergeLoreSkills`. */
function extractCreatureStats(
  system: RawSystem | undefined,
  items: RawFoundryDoc[] | undefined,
  report: ReportFn,
): CreatureStats | undefined {
  const speeds = extractSpeeds(system?.attributes?.speed);
  const abilityMods = extractAbilityMods(system?.abilities);
  const senses = extractSenses(perceptionObject(system?.perception));
  const languages = extractLanguages(system?.details);
  const immunities = extractImmunities(system?.attributes);
  const resistances = extractTypedValues(system?.attributes?.resistances);
  const weaknesses = extractTypedValues(system?.attributes?.weaknesses);
  const skills = mergeLoreSkills(extractSkills(system?.skills), items, report);
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

// ---------------------------------------------------------------------------
// class stats (D29-113, P12 S1) — the SCALAR model only; `grantedFeatures`/
// `subclassOptions` are the D29-114/-115 post-drop `augmentClassStats` pass
// (see that module + `ClassStatsSchema`'s own file comment for why).
// ---------------------------------------------------------------------------

/** All-or-nothing: a `class` Item is expected to carry every one of these
 * raw fields (verified: 27/27 real docs, zero missing / non-numeric ranks) —
 * unlike `CreatureStats`/`HazardStats`'s per-field-independent posture, a
 * class doc missing even one of them isn't a partial statblock, it's a
 * malformed class doc (report-visible, `classStatsIncomplete`), so this
 * returns `undefined` (no `stats` at all) rather than a half-populated
 * object a render layer would have to special-case. */
function extractClassStats(
  system: RawSystem | undefined,
  report: ReportFn,
  classId: string,
): ClassStats | undefined {
  const keyAbility = system?.keyAbility?.value;
  const hp = system?.hp;
  const perception = typeof system?.perception === "number" ? system.perception : undefined;
  const savingThrows = system?.savingThrows;
  const rawAttacks = system?.attacks;
  const defenses = system?.defenses;
  const trainedSkills = system?.trainedSkills;
  const spellcastingRaw = system?.spellcasting;
  const classFeat = system?.classFeatLevels?.value;
  const ancestryFeat = system?.ancestryFeatLevels?.value;
  const skillFeat = system?.skillFeatLevels?.value;
  const generalFeat = system?.generalFeatLevels?.value;
  const skillIncrease = system?.skillIncreaseLevels?.value;

  if (
    !present(keyAbility) ||
    !present(hp) ||
    !present(perception) ||
    !present(savingThrows?.fortitude) ||
    !present(savingThrows?.reflex) ||
    !present(savingThrows?.will) ||
    !present(rawAttacks?.simple) ||
    !present(rawAttacks?.martial) ||
    !present(rawAttacks?.advanced) ||
    !present(rawAttacks?.unarmed) ||
    !present(defenses?.unarmored) ||
    !present(defenses?.light) ||
    !present(defenses?.medium) ||
    !present(defenses?.heavy) ||
    !present(trainedSkills?.value) ||
    !present(trainedSkills?.additional) ||
    !present(spellcastingRaw) ||
    !present(classFeat) ||
    !present(ancestryFeat) ||
    !present(skillFeat) ||
    !present(generalFeat) ||
    !present(skillIncrease)
  ) {
    report("classStatsIncomplete", classId);
    return undefined;
  }

  // `other` is a fixed 5th key on all 27 raw docs, empty (`{name:"",rank:0}`)
  // on 24 — gate emission on non-empty `other.name` (gunslinger's real shape
  // is ONE comma-joined entry, `"Simple Firearms, Martial Firearms"`).
  const otherName = rawAttacks.other?.name;
  const otherRank = rawAttacks.other?.rank;
  const other =
    present(otherName) && otherName.length > 0 && present(otherRank)
      ? { name: otherName, rank: otherRank }
      : undefined;

  return {
    kind: "class",
    keyAbility,
    hp,
    perception,
    savingThrows: {
      fortitude: savingThrows.fortitude,
      reflex: savingThrows.reflex,
      will: savingThrows.will,
    },
    attacks: {
      simple: rawAttacks.simple,
      martial: rawAttacks.martial,
      advanced: rawAttacks.advanced,
      unarmed: rawAttacks.unarmed,
      ...(other !== undefined ? { other } : {}),
    },
    defenses: {
      unarmored: defenses.unarmored,
      light: defenses.light,
      medium: defenses.medium,
      heavy: defenses.heavy,
    },
    trainedSkills: { value: trainedSkills.value, additional: trainedSkills.additional },
    spellcasting: spellcastingRaw === 1,
    featLevels: {
      classFeat,
      ancestryFeat,
      skillFeat,
      generalFeat,
      skillIncrease,
    },
  };
}

/** D29-114 (P12 S1): a class Item's `system.items` granted-feature manifest,
 * converted to a typed array — see `RawClassGrantedFeature`'s own doc
 * comment for why this is the seam that keeps raw JSON from leaking past
 * this module into `transform.ts`'s orchestrator (which needs the raw
 * uuid/level/name triples for the post-drop `augmentClassStats` pass).
 * Returns `undefined` when the raw dict is absent/empty (never an empty
 * array — the "absent, not defaulted" convention every extractor here
 * follows). An entry missing `level`/`name`/`uuid` is skipped
 * (report-visible, `classGrantedFeatureMalformed`) — none exist in the real
 * corpus (27/27 raw class docs carry a fully-populated manifest, verified),
 * defensive only. */
export interface RawGrantedFeatureEntry {
  level: number;
  name: string;
  uuid: string;
}

export function extractRawGrantedFeatures(
  system: RawSystem | undefined,
  report: ReportFn,
  classId: string,
): RawGrantedFeatureEntry[] | undefined {
  const items = system?.items;
  if (!items) return undefined;
  const out: RawGrantedFeatureEntry[] = [];
  for (const [key, entry] of Object.entries(items)) {
    if (!present(entry?.level) || !present(entry?.name) || !present(entry?.uuid)) {
      report("classGrantedFeatureMalformed", `${classId} item "${key}"`);
      continue;
    }
    out.push({ level: entry.level, name: entry.name, uuid: entry.uuid });
  }
  return out.length > 0 ? out : undefined;
}

function extractStats(
  category: string,
  system: RawSystem | undefined,
  ctx: EnricherContext,
  report: ReportFn,
  items: RawFoundryDoc[] | undefined,
  id: string,
): Stats | undefined {
  if (category === "creature") return extractCreatureStats(system, items, report);
  // D29-74 (P7) guard: hazard docs' `type:"lore"` embedded items (0/1,309
  // real hazard docs today, verified) are deliberately NOT merged anywhere —
  // `HazardStatsSchema` has no `skills` field at all. A future hazard lore
  // item must not vanish silently here without deliberate schema work first
  // (add a `skills` field to `HazardStatsSchema`, then wire a merge call
  // the same shape `extractCreatureStats` uses above).
  if (category === "hazard") return extractHazardStats(system, ctx, report);
  if (category === "class") return extractClassStats(system, report, id);
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

/** D29-73 (P7): a `melee`-typed strike item's `system.range.{increment,max}`
 * → an AoN-format display string. `increment` wins if both are set —
 * defensive only, 0/12,942 raw melee items in the real corpus carry both
 * (verified); the tiebreak is exercisable by synthetic unit test only. Both
 * raw fields are nullable numbers (`{"increment": null, "max": 10}`), hence
 * `present()` rather than a bare `!== undefined` (the same S4 emit-gate
 * literal-`null` lesson `extractHazardStats`'s own comment documents). */
function formatStrikeRange(range: RawSystem["range"] | undefined): string | undefined {
  if (present(range?.increment)) return `range increment ${range.increment} feet`;
  if (present(range?.max)) return `range ${range.max} feet`;
  return undefined;
}

/** D29-20 (P1.6) + D29-73 (P7): a `melee`-typed strike item's to-hit bonus,
 * flattened damage rolls, and (P7) formatted range. Absent for every other
 * item type (the source fields simply don't exist on them). */
function extractStrikeFields(
  system: RawSystem | undefined,
): Pick<EmbeddedItem, "attackBonus" | "damage" | "range"> {
  const attackBonus = present(system?.bonus?.value) ? system.bonus.value : undefined;
  const damage = extractDamage(system?.damageRolls);
  const range = formatStrikeRange(system?.range);
  return {
    ...(attackBonus !== undefined ? { attackBonus } : {}),
    ...(damage !== undefined ? { damage } : {}),
    ...(range !== undefined ? { range } : {}),
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

  const stats = extractStats(decision.category, doc.system, ctx, report, doc.items, id);

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
