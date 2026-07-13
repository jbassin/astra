import { z } from "zod";

import { BlockNodeSchema } from "./nodes";
import type { BlockNode } from "./nodes";

/**
 * CodexEntity — the canonical, joined, license-labeled corpus row (D29-1/-3/-7/-8/-13,
 * spec §2/§3). One JSON file per entity at `corpus/<category>/<slug>.json`
 * (`<slug>@legacy.json` for the legacy half of a shared-slug remaster pair, D29-1); a
 * slim projection of every entity (`IndexRow`, below) lands in
 * `corpus/<category>/index.json`. `schemaVersion` in `corpus-manifest.json` bumps on
 * ANY breaking change here (a required field added/removed/reshaped, an id-format
 * change) — see `src/schema/manifest.ts`.
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
 * (`spell/heal`) and a legacy-pair member (`spell/heal@legacy`). */
const CodexId = z
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

    // feat (Foundry Item type "feat" `system.*`; AoN `feat` category — verified on
    // Improvised Repair).
    featLevel: z.number().int().nonnegative().optional(),
    prerequisites: z.array(z.string()).optional(),
    actionCost: z.string().optional(), // e.g. "1", "2", "3", "reaction", "free", "passive"
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
  })
  .strict();
export type EmbeddedItem = z.infer<typeof EmbeddedItemSchema>;

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
  })
  .strict();
export type CodexEntity = z.infer<typeof CodexEntitySchema>;

// ---------------------------------------------------------------------------
// IndexRow (D29-3: the slim per-category facet row, NO body)
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
  })
  .strict();
export type IndexRow = z.infer<typeof IndexRowSchema>;

export function toIndexRow(entity: CodexEntity): IndexRow {
  return {
    id: entity.id,
    name: entity.name,
    ...(entity.level !== undefined ? { level: entity.level } : {}),
    traits: entity.traits,
    ...(entity.rarity !== undefined ? { rarity: entity.rarity } : {}),
    source: entity.source,
    edition: entity.edition,
  };
}

export function parseCodexEntity(data: unknown): CodexEntity {
  return CodexEntitySchema.parse(data);
}

// Re-exported so consumers of `entity.ts` don't also need to import `nodes.ts`
// directly for the common case of typing a `body`/`loreBody` array.
export type { BlockNode };
