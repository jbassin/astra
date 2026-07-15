import { z } from "zod";

import { BlockNodeSchema, InlineNodeSchema } from "./nodes";
import type { BlockNode } from "./nodes";

/**
 * CodexEntity — the canonical, joined, license-labeled corpus row (D29-1/-3/-7/-8/-13,
 * spec §2/§3). One JSON file per entity at `corpus/<category>/<slug>.json`
 * (`<slug>@legacy.json` for the legacy half of a shared-slug remaster pair, D29-1); a
 * slim projection of every entity (`IndexRow`, below) lands in
 * `corpus/<category>/_index.json` (D29-21: leading-underscore, `sluggify()` can never
 * emit one, so this can never collide with a real entity slug). The EMITTED corpus's
 * own schema generation is `CORPUS_SCHEMA_VERSION` in `src/ingest/emit.ts` (bump
 * alongside a breaking change here — a required field added/removed/reshaped, an
 * id-format change) — NOT the committed root `corpus-manifest.json`'s own
 * `schemaVersion`, a different concept (that one pins upstream FETCH versions, D29-4;
 * see `src/schema/manifest.ts` and `emit.ts`'s own doc comment on this distinction).
 *
 * Ambiguities resolved while writing this contract:
 *   - `category` is `z.string()`, not a literal enum — the join owns the authoritative
 *     category list (`apps/codex/scripts/categoryMap.ts`, keyed on (Foundry pack, doc
 *     type) per D29-7) and AoN alone ships 93 of them; duplicating that list here as a
 *     zod enum would just be a second place for it to drift out of sync.
 *   - The id regex is deliberately loose (`{category}/{slug}` with an optional
 *     `@legacy` suffix, any non-slash/non-whitespace characters either side) — real
 *     `sluggify()` output legitimately contains non-ASCII letters (e.g. `ixamès-eye`,
 *     `déjà-vu`, verified against the real Foundry snapshot), so a tight `[a-z0-9-]+`
 *     pattern would reject genuine slugs.
 *   - `aonUrl` is `z.string()` (not `z.string().url()`/`z.url()`): AoN's own `url`
 *     field is a site-relative path (`/Spells.aspx?ID=148`), not an absolute URL.
 *   - S2 widening (`foundryEntities.ts`): Actor-derived entities gained
 *     `embeddedItems: EmbeddedItem[]` — spec §1 forbids leaking raw system JSON
 *     past P1, so an Actor's embedded items (spells, actions, strikes, ...) get
 *     the same typed name/slug/traits/body treatment as top-level entities,
 *     just nested; see `EmbeddedItemSchema` below for why it can't live inside
 *     `facets` instead. Additive/optional, no schemaVersion bump.
 */

// ---------------------------------------------------------------------------
// shared leaf schemas
// ---------------------------------------------------------------------------

/** Loose by design — see the file-level comment. Matches both a plain id
 * (`spell/heal`) and a legacy-pair member (`spell/heal@legacy`). Exported
 * (P4, D29-39) so `src/schema/rulesTree.ts`/`sourcesIndex.ts` share the
 * repo's single reference convention (adversarial N13) instead of
 * re-declaring the regex. */
export const CodexId = z
  .string()
  .min(3)
  .regex(
    /^[^/\s]+\/[^/\s]+$/,
    'expected "{category}/{slug}" (optionally with an "@legacy" suffix)',
  );

export const EditionSchema = z.enum(["remaster", "legacy"]);
export type Edition = z.infer<typeof EditionSchema>;

export const LicenseSchema = z.enum(["ORC", "OGL", "unknown"]);
export type License = z.infer<typeof LicenseSchema>;

/** D29-13: Foundry-derived entities read this off `system.publication` (Items) /
 * `system.details.publication` (Actors, verified on `monster-core`'s Balor); AoN-only
 * and journal-derived entities have no in-source license field and resolve via the
 * committed `apps/codex/scripts/licenseMap.ts` book table instead — `license` still
 * lands here either way, `"unknown"` is the allowed, report-counted residue. */
export const SourceSchema = z
  .object({
    book: z.string().min(1),
    page: z.number().int().positive().optional(),
    license: LicenseSchema,
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

// ---------------------------------------------------------------------------
// facets (D29-3's "facet fields per category", pragmatic shape)
//
// ONE flat object: named optional fields for the mechanically-rich categories
// verified against the real corpus (creature/spell/equipment-family/feat — see the
// field-by-field provenance comments below), plus a `.catchall()` passthrough for
// every other category's typed (non-prose) fields. This avoids two worse shapes: a
// 93-member discriminated-by-category union (one bespoke schema per AoN category,
// most of which are thin one-off pages with no real "facet" structure), or an
// entirely untyped `z.record` that gives P3's faceted browse/search nothing to
// build column filters against for the categories that actually warrant them.
//
// Extension rule: verify a new field against REAL docs (both corpora where
// applicable) before adding it here named; anything not worth a typed field still
// round-trips through the catchall untouched. Adding a named field is additive
// (existing catchall data for that key just becomes typed) so it does NOT need a
// schemaVersion bump; narrowing/removing/retyping an existing named field does.
// ---------------------------------------------------------------------------

const JsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
/** A single facet's passthrough value shape: a scalar or a flat array of scalars —
 * matches every non-prose field actually observed on both corpora's docs (e.g. AoN
 * `trait: string[]`, `size_id: number`, Foundry `traits.rarity: string`). This is a
 * hard TS constraint, not just a style choice: zod's `.catchall(V)` generates an
 * index signature of `V` that every NAMED property must also be assignable to, so a
 * nested-object named field (e.g. Foundry's `saves: {fortitude, reflex, will}`)
 * would break the whole object's inferred type. Foundry's `saves` is flattened to
 * three scalar fields below instead of kept as one nested object. */
const FacetValue = z.union([JsonScalar, z.array(JsonScalar)]);

export const FacetsSchema = z
  .object({
    // creature (Foundry Actor `system.attributes`/`saves`/`perception`/`details`;
    // AoN `creature` category — verified on Balor/`pathfinder-bestiary`).
    hp: z.number().int().nonnegative().optional(),
    ac: z.number().int().optional(),
    fortitudeSave: z.number().optional(),
    reflexSave: z.number().optional(),
    willSave: z.number().optional(),
    perception: z.number().optional(),
    size: z.string().optional(), // Foundry system.traits.size.value ("lg"), AoN size
    /** Foundry has no single "creature type" field — the closest analog is the
     * AoN `creature_family_markdown` grouping (e.g. "Demons"); Foundry's own
     * type-like traits (demon/fiend/...) live in `traits`, not here. */
    family: z.string().optional(),

    // spell (Foundry Item type "spell" `system.*`; AoN `spell` category — verified
    // on Heal, spell-148/spell-1554).
    rank: z.number().int().nonnegative().optional(), // spell level/rank
    traditions: z.array(z.string()).optional(),
    castTime: z.string().optional(), // Foundry system.time.value ("1 to 3")
    range: z.string().optional(),
    area: z.string().optional(),
    duration: z.string().optional(),
    defense: z.string().optional(), // e.g. "basic Fortitude"

    // equipment family: weapon/armor/shield/equipment/consumable/treasure (Foundry
    // Item `system.price`/`bulk`/`usage`/`category`; AoN
    // weapon/armor/equipment categories — verified on 8-Round Magazine,
    // Drake Rifle).
    price: z.string().optional(), // formatted denomination, e.g. "2 sp"
    bulk: z.number().optional(),
    hands: z.string().optional(), // e.g. "1", "2" (Foundry usage.hands, when present)
    usage: z.string().optional(), // e.g. "held-in-one-hand", "worn"
    itemCategory: z.string().optional(), // e.g. "martial", "simple", "unarmored"
    /** D29-60 (R8, P6): AoN's `item_category` fill-gap sibling — `equipment`
     * corpus category only (`join.ts`'s `mergeJoined`/`buildAonOnlyEntity`),
     * e.g. "Scrolls", "Alchemical Tools" (AoN's `item_subcategory`, 75
     * distinct real values on the `equipment` category file, verified). */
    itemSubcategory: z.string().optional(),

    // feat (Foundry Item type "feat" `system.*`; AoN `feat` category — verified on
    // Improvised Repair).
    featLevel: z.number().int().nonnegative().optional(),
    prerequisites: z.array(z.string()).optional(),
    actionCost: z.string().optional(), // e.g. "1", "2", "3", "reaction", "free", "passive"

    // P3 S1 (D29-33a) — the 5 extractor-gap categories. Category-gated
    // extraction (`foundryEntities.ts`'s `extractFacets`, unlike the
    // field-presence-driven fields above) since these raw field NAMES are not
    // guaranteed unique across categories the way e.g. `system.price`/
    // `system.bulk` are — see that function's own comment.
    /** ancestry Item `system.speed` (a bare number — NOT the nested Actor
     * `speeds` shape `stats.speeds` holds for creature/hazard). `hp`/`size`
     * reuse the named fields above (ancestry's `system.hp`/`system.size` are
     * ALSO bare, unlike the Actor `attributes.hp.max`/`traits.size.value`
     * paths — verified on Tengu). */
    speed: z.number().optional(),
    /** class Item `system.keyAbility.value` (verified on Swashbuckler/
     * Champion/Psychic — 0-2 elements; kept even when the raw array is empty,
     * matching `traditions`'s own "present, not non-empty" convention). */
    keyAbility: z.array(z.string()).optional(),
    /** background Item `system.trainedSkills.value` — the fixed skill-slug
     * list only (`.lore` is free-text per-background flavor text, e.g.
     * "Academia Lore" — high cardinality, excluded, verified on the real
     * corpus). */
    trainedSkills: z.array(z.string()).optional(),
    /** condition Item `system.value.isValued` — whether the condition tracks
     * a numeric value (e.g. clumsy/frightened) vs. a flat flag (e.g.
     * controlled/helpful), verified across the real condition pack. */
    valued: z.boolean().optional(),
    /** heritage Item `system.ancestry.slug` — the parent ancestry's slug
     * (verified on Thickskin Tripkee: `{name:"Tripkee",slug:"tripkee",...}`). */
    ancestrySlug: z.string().optional(),
  })
  .catchall(FacetValue);
export type Facets = z.infer<typeof FacetsSchema>;

// ---------------------------------------------------------------------------
// EmbeddedItem (S2 widening, `foundryEntities.ts`) — an Actor's embedded items
// (spells, actions, strikes, auras, ...), NOT promoted to their own corpus
// entity. Verbatim system JSON never leaks past P1 (spec §1) — every field
// here is the same typed shape the top-level entity itself uses (name/slug/
// traits/body via `parseFoundryHtml`), just nested one level. Kept on
// `CodexEntity` directly (not inside `facets`) because `FacetsSchema`'s
// `.catchall(FacetValue)` only accepts scalars/scalar-arrays — a nested object
// array would break every named facet field's inferred type (see
// `FacetsSchema`'s own file comment). Additive/optional — no schemaVersion
// bump (same rule as adding a new named facet field).
// ---------------------------------------------------------------------------

export const EmbeddedItemSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    /** The embedded item's own Foundry `type` (`spell`, `action`, `melee`,
     * `lore`, `spellcastingEntry`, ... — verified on Balor: 24 embedded items
     * span at least these). Left as a free string, not an enum, for the same
     * reason `CodexEntity.category` is (see that field's comment) — P2 is
     * where a fixed vocabulary would actually get used. */
    type: z.string().min(1),
    level: z.number().optional(),
    actionCost: z.string().optional(),
    traits: z.array(z.string()),
    body: z.array(BlockNodeSchema),
    /** D29-20 (P1.6): a `melee`-typed strike item's to-hit bonus
     * (`system.bonus.value`, e.g. `+29`). Absent for every non-strike item
     * type. */
    attackBonus: z.number().optional(),
    /** D29-20 (P1.6): a `melee`-typed strike item's flattened damage rolls
     * (`system.damageRolls`, e.g. `["3d12+15 piercing", "2d6 fire"]`) —
     * `${damage} ${damageType}` per roll, insertion order preserved (the raw
     * `damageRolls` object's own key order, stable across re-transforms since
     * it's read verbatim off disk every run). Absent for every non-strike
     * item type. */
    damage: z.array(z.string().min(1)).optional(),
    /** D29-20 (P1.6): a `spellcastingEntry`-typed item's spell DC
     * (`system.spelldc.dc`). Absent for every other item type. */
    dc: z.number().optional(),
    /** D29-20 (P1.6): a `spellcastingEntry`-typed item's spell attack modifier
     * (`system.spelldc.value`). Absent for every other item type. */
    attack: z.number().optional(),
    /** D29-20 (P1.6): a `spellcastingEntry`-typed item's magic tradition
     * (`system.tradition.value`, e.g. `"arcane"`). Absent for every other item
     * type. */
    tradition: z.string().optional(),
  })
  .strict();
export type EmbeddedItem = z.infer<typeof EmbeddedItemSchema>;

// ---------------------------------------------------------------------------
// Stats (D29-20, P1.6 addendum, schemaVersion 1->2 — see `src/ingest/emit.ts`'s
// `CORPUS_SCHEMA_VERSION`) — a typed, discriminated statblock projection for
// the two structured Actor categories (`creature`/`hazard`). Kept as its OWN
// top-level field, NOT stuffed into `facets` (whose `.catchall(FacetValue)`
// only accepts scalars/scalar-arrays, `FacetsSchema`'s own file comment) —
// every field here is deterministic field mapping off the real Foundry Actor
// `system.*` shape (verified on `pathfinder-bestiary/red-dragon-adult` +
// `hazards/gravehall-trap`), never a heuristic. Fields absent in source are
// OMITTED (never `undefined`-valued keys, never a defaulted zero/empty-array)
// — same fail-soft convention `foundryEntities.ts`'s `present()` guard
// already uses everywhere else in this module.
// ---------------------------------------------------------------------------

const SpeedEntrySchema = z.object({ type: z.string().min(1), value: z.number() }).strict();

const SpeedsSchema = z
  .object({
    /** `system.attributes.speed.value` — the creature's base (land/swim-if-
     * that's-all-it-has) speed. */
    base: z.number().optional(),
    /** `system.attributes.speed.otherSpeeds` — typed additional speeds
     * (`fly`/`swim`/`climb`/`burrow`/...), e.g. `{type:"fly",value:150}`. */
    other: z.array(SpeedEntrySchema).optional(),
  })
  .strict();

const AbilityKey = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

/** `system.abilities.*.mod` — a partial record (a creature is never missing
 * an ability score in the real corpus, but the schema stays defensive). */
const AbilityModsSchema = z.partialRecord(AbilityKey, z.number());

const SenseEntrySchema = z
  .object({
    type: z.string().min(1),
    acuity: z.string().optional(),
    range: z.number().optional(),
  })
  .strict();

const SensesSchema = z
  .object({
    /** `system.perception.mod`. */
    mod: z.number().optional(),
    /** `system.perception.details` — free-text perception note (e.g. "smoke
     * vision"). */
    details: z.string().optional(),
    /** `system.perception.senses` — typed precise/imprecise senses
     * (darkvision, scent, ...). */
    list: z.array(SenseEntrySchema).optional(),
  })
  .strict();

const TypedValueSchema = z
  .object({ type: z.string().min(1), value: z.number().optional() })
  .strict();

export const CreatureStatsSchema = z
  .object({
    kind: z.literal("creature"),
    speeds: SpeedsSchema.optional(),
    abilityMods: AbilityModsSchema.optional(),
    senses: SensesSchema.optional(),
    /** `system.details.languages.value`. */
    languages: z.array(z.string().min(1)).optional(),
    /** `system.attributes.immunities[].type`. */
    immunities: z.array(z.string().min(1)).optional(),
    /** `system.attributes.resistances[]`. */
    resistances: z.array(TypedValueSchema).optional(),
    /** `system.attributes.weaknesses[]`. */
    weaknesses: z.array(TypedValueSchema).optional(),
    /** `system.skills.*.base`, keyed on the skill slug (e.g. `"stealth"`). */
    skills: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type CreatureStats = z.infer<typeof CreatureStatsSchema>;

export const HazardStatsSchema = z
  .object({
    kind: z.literal("hazard"),
    /** `system.attributes.hardness`. */
    hardness: z.number().optional(),
    /** `system.attributes.stealth` — the numeric bonus plus any parsed
     * free-text/enricher detail (e.g. a `@Check[stealth|dc:23]` note). */
    stealth: z
      .object({ value: z.number().optional(), details: z.string().optional() })
      .strict()
      .optional(),
    /** `system.details.isComplex`. */
    isComplex: z.boolean().optional(),
    /** `system.details.disable` — enricher HTML, parsed via the existing
     * `parseFoundryHtml` path (NOT a scalar, D29-20). */
    disable: z.array(BlockNodeSchema).optional(),
    /** `system.details.routine` — same treatment as `disable`. */
    routine: z.array(BlockNodeSchema).optional(),
    /** `system.details.reset` — same treatment as `disable`. */
    reset: z.array(BlockNodeSchema).optional(),
  })
  .strict();
export type HazardStats = z.infer<typeof HazardStatsSchema>;

export const StatsSchema = z.discriminatedUnion("kind", [CreatureStatsSchema, HazardStatsSchema]);
export type Stats = z.infer<typeof StatsSchema>;

// ---------------------------------------------------------------------------
// D29-62 (R3, P6): mastheadExtra — the AoN masthead's non-"Source" bold-label
// lines the ingest-time structural strip (`aonMarkup.ts`'s `stripMasthead`)
// pulls out of `body`, re-surfaced by the render layer's facet-header
// components (`domain/render/facetHeader.tsx`). `value` is `InlineNode[]`
// (not `CodexNode[]`) because every masthead line is, by construction, one
// `paragraph`'s inline children after its bold label — never block content;
// this also lets `mastheadExtra` reuse the SAME `renderNodes`-family
// renderer the body already uses, so a crossref inside a masthead line
// (e.g. `ritual/wish`'s `Primary Check [Arcana]`) still renders as a real
// link. Top-level (not under `facets`) because `FacetsSchema`'s
// `FacetValue` union can't hold rich inline content (entity.ts's own
// `FacetsSchema` file comment).
// ---------------------------------------------------------------------------

export const MastheadExtraEntrySchema = z
  .object({
    label: z.string().min(1),
    value: z.array(InlineNodeSchema),
  })
  .strict();
export type MastheadExtraEntry = z.infer<typeof MastheadExtraEntrySchema>;

// ---------------------------------------------------------------------------
// CodexEntity
// ---------------------------------------------------------------------------

export const CodexEntitySchema = z
  .object({
    id: CodexId,
    slug: z.string().min(1),
    category: z.string().min(1),
    name: z.string().min(1),
    edition: EditionSchema,
    source: SourceSchema,
    level: z.number().optional(),
    traits: z.array(z.string()),
    rarity: z.string().optional(),
    /** D29-1/-7: AoN `remaster_id`/`legacy_id` are arrays (multi-member pairs are
     * real, e.g. one legacy spell splitting into several remaster spells) — kept as
     * arrays here even though the common case is a single-element array. */
    remasteredAs: z.array(CodexId).optional(),
    legacyOf: z.array(CodexId).optional(),
    /** D29-7: a Foundry 1:N variant (e.g. a `(Adult, Spellcaster)` creature) points
     * at the ONE AoN doc all its siblings share. */
    variantOf: CodexId.optional(),
    aonUrl: z.string().min(1).optional(),
    body: z.array(BlockNodeSchema),
    /** D29-8: journal-page prose merged by slug into the matching Item-derived
     * entity — set only when a journal page actually merged in; absent otherwise
     * (never an empty array). */
    loreBody: z.array(BlockNodeSchema).optional(),
    /** D29-8: a journal page (or AoN doc) with no matching Item-derived entity
     * becomes its own standalone entity in that category instead of merging. */
    proseOnly: z.literal(true).optional(),
    facets: FacetsSchema,
    /** S2 widening: an Actor-derived entity's embedded items (spells, actions,
     * strikes, ...) — see `EmbeddedItemSchema` above. Absent for non-Actor
     * categories and for Actors with zero embedded items (never an empty
     * array, same convention as `loreBody`). */
    embeddedItems: z.array(EmbeddedItemSchema).optional(),
    /** D29-20 (P1.6): a typed statblock projection for `creature`/`hazard`
     * entities — see `StatsSchema` above. Absent for every other category and
     * for a creature/hazard with nothing extractable (a `character`-excluded
     * Actor never reaches assembly at all, D29-19; an AoN-only `proseOnly`
     * creature/hazard has no Foundry Actor doc to extract from). */
    stats: StatsSchema.optional(),
    /** P4 (D29-39): the AoN `breadcrumbs` ancestor-name chain (own name
     * EXCLUDED, own name is a leaf) — rules-only in practice (the field
     * mirrors `facets.family`'s "same disease, top-level not facets"
     * precedent: rules is 100% `proseOnly` so `facets` is always `{}`, and
     * this is genuinely hierarchical navigation data, not a facet). Threaded
     * through both `join.ts` construction sites (`buildAonOnlyEntity`/
     * `mergeJoined`, the `creature.family` P3-S1 precedent) verbatim from
     * `AonDocMeta.breadcrumbs` (already normalized at extraction,
     * `aonFacets.ts`'s `normalizeBreadcrumbElement`). Additive/optional — no
     * schemaVersion bump (same rule as every other optional field on this
     * type). Consumed only by the P4 `rules-tree.json` builder — `IndexRow`
     * stays untouched (D29-39: the tree ships as its own artifact). */
    breadcrumbs: z.array(z.string()).optional(),
    /** P4 (D29-39): reverse-joined `sidebar`-category entities whose OWN AoN
     * `url` resolves (via the link table's `pickCanonical` page-owner rule
     * → aonId → pass-4 `aonIdToFinalId`, a POST-identity step) to THIS
     * entity as host — set on ANY category (stakeholder: attached sidebars
     * render on all host categories, not just rules). Ordered by sidebar
     * name asc, tie-break aonId (sidebars carry no reading order of their
     * own, 0/694 have next/prev links). Absent when this entity hosts none
     * (never an empty array, same convention as `loreBody`/`embeddedItems`).
     * Additive/optional — no schemaVersion bump. */
    attachedSidebars: z.array(CodexId).optional(),
    /** D29-62 (R3, P6): the AoN masthead's non-"Source" bold-label lines
     * (Target/Bloodline, AC Bonus/Dex Cap/…, Cost/Primary Check/…) — stripped
     * out of `body` at ingest time and re-rendered by the facet-header
     * components. Ordered, preserving masthead order; absent (never `[]`)
     * when the masthead collected zero non-"Source" pairs (the common case
     * for e.g. an ordinary feat, whose only masthead line is "Source"). */
    mastheadExtra: z.array(MastheadExtraEntrySchema).min(1).optional(),
  })
  .strict();
export type CodexEntity = z.infer<typeof CodexEntitySchema>;

// ---------------------------------------------------------------------------
// IndexRow (D29-3: the slim per-category facet row, NO body)
//
// P3 S1 (D29-33c) widening: `facets` (trimmed to the calling category's
// `facetKeys.ts` allowlist — 73 categories emit none, so the key is OMITTED
// entirely rather than an empty object, same "absent, never a defaulted
// empty" convention every other optional field on this row already follows)
// and `superseded` (required — the site-wide legacy-toggle predicate,
// `remasteredAs` non-empty, NOT `edition === "legacy"`, which would wrongly
// hide never-remastered content). Additive — schemaVersion stays 2 per the
// entity.ts precedent (a new optional/required-but-derived field, no
// existing field reshaped).
// ---------------------------------------------------------------------------

export const IndexRowSchema = z
  .object({
    id: CodexId,
    name: z.string().min(1),
    level: z.number().optional(),
    traits: z.array(z.string()),
    rarity: z.string().optional(),
    source: SourceSchema,
    edition: EditionSchema,
    facets: FacetsSchema.optional(),
    superseded: z.boolean(),
  })
  .strict();
export type IndexRow = z.infer<typeof IndexRowSchema>;

/**
 * `allowedFacetKeys` is the calling category's `facetKeys.ts` allowlist
 * (`facetKeysFor(entity.category)`, `src/schema/facetKeys.ts`) — passed in
 * rather than looked up here so `entity.ts` never imports `facetKeys.ts`
 * (that module itself types its allowlist against `Facets`'s keys, `keyof
 * Facets` — importing it back from here would cycle). Only keys the entity
 * actually carries a value for land in the trimmed object (never an
 * `undefined`-valued key); the whole `facets` property is omitted when the
 * trimmed object would be empty (the common case — 73/88 categories).
 */
export function toIndexRow(entity: CodexEntity, allowedFacetKeys: readonly string[]): IndexRow {
  const sourceFacets: Record<string, unknown> = entity.facets;
  const trimmedFacets: Record<string, unknown> = {};
  for (const key of allowedFacetKeys) {
    const value = sourceFacets[key];
    if (value !== undefined) trimmedFacets[key] = value;
  }
  const hasFacets = Object.keys(trimmedFacets).length > 0;
  return {
    id: entity.id,
    name: entity.name,
    ...(entity.level !== undefined ? { level: entity.level } : {}),
    traits: entity.traits,
    ...(entity.rarity !== undefined ? { rarity: entity.rarity } : {}),
    source: entity.source,
    edition: entity.edition,
    ...(hasFacets ? { facets: trimmedFacets as Facets } : {}),
    superseded: (entity.remasteredAs?.length ?? 0) > 0,
  };
}

export function parseCodexEntity(data: unknown): CodexEntity {
  return CodexEntitySchema.parse(data);
}

// Re-exported so consumers of `entity.ts` don't also need to import `nodes.ts`
// directly for the common case of typing a `body`/`loreBody` array.
export type { BlockNode };
