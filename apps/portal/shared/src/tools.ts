/**
 * Param + result contracts for portal's six S4 read tools (spec 0023 slice S4). Both
 * sides (the Foundry module's `handlers.ts` and portal-server's `mcp.ts`) import these
 * so the wire shape can't drift between them — the module parses incoming params with
 * these schemas at the edge (KDL-at-the-edges' sibling rule for the bridge wire), and
 * the server uses the same param schemas as each MCP tool's `inputSchema`.
 *
 * Deliberately **compact and LLM-friendly** (D5): an index/search row is a handful of
 * scalars (uuid/id/name/type/pack/...), never a modeled pf2e `system.*` tree. A single
 * document fetch (`get-document`) crosses as `z.unknown()` — the whole point of D5 is
 * that portal never hand-authors pf2e schemas, so the full `toObject()` payload is
 * opaque cargo the LLM client reasons about directly.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// list-compendium-packs
// ---------------------------------------------------------------------------

export const ListCompendiumPacksParams = z.object({}).strict();
export type ListCompendiumPacksParams = z.infer<typeof ListCompendiumPacksParams>;

/** One row per `game.packs` entry — enough to pick a pack for `search-compendium`'s
 * `packIds` filter or to browse what's on disk at all. */
export const CompendiumPackRow = z
  .object({
    id: z.string(), // the collection key, e.g. "pf2e.pathfinder-monster-core"
    label: z.string(),
    type: z.string(), // metadata.type: Actor/Item/JournalEntry/RollTable/...
    system: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CompendiumPackRow = z.infer<typeof CompendiumPackRow>;

export const ListCompendiumPacksResult = z
  .object({
    packs: z.array(CompendiumPackRow),
  })
  .strict();
export type ListCompendiumPacksResult = z.infer<typeof ListCompendiumPacksResult>;

// ---------------------------------------------------------------------------
// search-compendium
// ---------------------------------------------------------------------------

export const SearchCompendiumParams = z
  .object({
    query: z.string().min(1).describe("Case-insensitive substring matched against entry names."),
    // The LLM-facing .describe() is load-bearing (found live, 2026-07-07): without it a
    // client guesses the pf2e subtype ("npc") and silently gets zero results.
    type: z
      .string()
      .optional()
      .describe(
        'Restrict to packs of one document class — the pack\'s metadata.type, e.g. "Actor" ' +
          '(statblocks/NPCs), "Item", "JournalEntry", "Scene". NOT the pf2e subtype: "npc" ' +
          "matches nothing (result rows report the subtype in their own type field).",
      ),
    packIds: z
      .array(z.string())
      .optional()
      .describe(
        'Restrict to specific pack collection keys, e.g. "pf2e.pathfinder-monster-core" ' +
          "(browse them with list-compendium-packs).",
      ),
    limit: z.number().int().positive().max(200).optional().describe("Max results (default 25)."),
  })
  .strict();
export type SearchCompendiumParams = z.infer<typeof SearchCompendiumParams>;

/** One ranked compendium index hit. `uuid` is the index entry's own Foundry-13 `uuid`
 * field (`Compendium.<pack>.<type>.<id>`) — never hand-constructed. */
export const CompendiumIndexRow = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    type: z.string(),
    pack: z.string(),
    packLabel: z.string(),
    img: z.string().optional(),
  })
  .strict();
export type CompendiumIndexRow = z.infer<typeof CompendiumIndexRow>;

export const SearchCompendiumResult = z
  .object({
    results: z.array(CompendiumIndexRow),
  })
  .strict();
export type SearchCompendiumResult = z.infer<typeof SearchCompendiumResult>;

// ---------------------------------------------------------------------------
// get-document
// ---------------------------------------------------------------------------

export const GetDocumentParams = z
  .object({
    uuid: z
      .string()
      .min(1)
      .describe(
        "The uuid field of a search/list result row — a compendium uuid " +
          '("Compendium.<pack>.<type>.<id>") or a world uuid ("Actor.<id>", "Scene.<id>", …).',
      ),
  })
  .strict();
export type GetDocumentParams = z.infer<typeof GetDocumentParams>;

/** The full `toObject()` payload, opaque by design (D5) — never model pf2e `system.*`. */
export const GetDocumentResult = z
  .object({
    uuid: z.string(),
    document: z.unknown(),
  })
  .strict();
export type GetDocumentResult = z.infer<typeof GetDocumentResult>;

// ---------------------------------------------------------------------------
// search-world
// ---------------------------------------------------------------------------

export const WorldSearchType = z.enum(["actors", "items", "journal", "scenes"]);
export type WorldSearchType = z.infer<typeof WorldSearchType>;

export const SearchWorldParams = z
  .object({
    query: z.string().min(1).describe("Case-insensitive substring matched against entry names."),
    types: z
      .array(WorldSearchType)
      .optional()
      .describe("World collections to search; defaults to all four when omitted."),
    limit: z.number().int().positive().max(200).optional().describe("Max results (default 25)."),
  })
  .strict();
export type SearchWorldParams = z.infer<typeof SearchWorldParams>;

export const WorldSearchRow = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    documentType: z.string(),
    folder: z.string().optional(),
  })
  .strict();
export type WorldSearchRow = z.infer<typeof WorldSearchRow>;

export const SearchWorldResult = z
  .object({
    results: z.array(WorldSearchRow),
  })
  .strict();
export type SearchWorldResult = z.infer<typeof SearchWorldResult>;

// ---------------------------------------------------------------------------
// list-scenes
// ---------------------------------------------------------------------------

export const ListScenesParams = z.object({}).strict();
export type ListScenesParams = z.infer<typeof ListScenesParams>;

export const SceneRow = z
  .object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
  })
  .strict();
export type SceneRow = z.infer<typeof SceneRow>;

export const ListScenesResult = z
  .object({
    scenes: z.array(SceneRow),
  })
  .strict();
export type ListScenesResult = z.infer<typeof ListScenesResult>;

// ---------------------------------------------------------------------------
// get-current-scene
// ---------------------------------------------------------------------------

export const GetCurrentSceneParams = z.object({}).strict();
export type GetCurrentSceneParams = z.infer<typeof GetCurrentSceneParams>;

export const CurrentSceneInfo = z
  .object({
    id: z.string(),
    name: z.string(),
    grid: z.object({ size: z.number(), type: z.number() }).strict(),
    width: z.number(),
    height: z.number(),
    tokenCount: z.number().int().nonnegative(),
  })
  .strict();
export type CurrentSceneInfo = z.infer<typeof CurrentSceneInfo>;

/** `scene: null` is a normal, non-error outcome — an idle world (no active scene) isn't
 * a failure, it's just nothing to report. */
export const GetCurrentSceneResult = z
  .object({
    scene: CurrentSceneInfo.nullable(),
  })
  .strict();
export type GetCurrentSceneResult = z.infer<typeof GetCurrentSceneResult>;

// ---------------------------------------------------------------------------
// import-from-compendium (S5 write tool — D5 clone-from-compendium ONLY)
// ---------------------------------------------------------------------------

/** A generous absolute sanity bound on any single call's create count — NOT the real
 * D8 cap. The real cap is `cfg.portal.maxCreatesPerRequest` (server-enforced, pre-
 * bridge) plus the module's own hard `MODULE_MAX_CREATES_CEILING` backstop; this is
 * just enough to reject an obviously-malformed request (e.g. `quantity: 1e9`) at parse
 * time rather than let it reach either cap check. */
const SANE_QUANTITY_MAX = 1000;

export const ImportFromCompendiumParams = z
  .object({
    // D5: this tool ONLY clones from a compendium; a world uuid is rejected.
    uuid: z
      .string()
      .min(1)
      .describe(
        'A compendium document\'s uuid ("Compendium.<pack>.<type>.<id>", from ' +
          "search-compendium) — never a world uuid; this tool only clones from a compendium.",
      ),
    quantity: z
      .number()
      .int()
      .positive()
      .max(SANE_QUANTITY_MAX)
      .default(1)
      .describe("How many copies to create in one call (the server's per-request cap applies)."),
    folder: z
      .string()
      .optional()
      .describe(
        "Name of an EXISTING world folder (of the matching document type) to file the new " +
          'document(s) under — looked up, never created; a missing folder is a typed "not-found" ' +
          "error, not a silent skip.",
      ),
  })
  .strict();
export type ImportFromCompendiumParams = z.infer<typeof ImportFromCompendiumParams>;

/** One created world document — same compact shape as the S4 search rows. */
export const ImportedDocumentRow = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    documentType: z.string(),
  })
  .strict();
export type ImportedDocumentRow = z.infer<typeof ImportedDocumentRow>;

export const ImportFromCompendiumResult = z
  .object({
    rows: z.array(ImportedDocumentRow),
  })
  .strict();
export type ImportFromCompendiumResult = z.infer<typeof ImportFromCompendiumResult>;

// ---------------------------------------------------------------------------
// create-token (S5 write tool — D13 import-then-tokenize)
// ---------------------------------------------------------------------------

export const CreateTokenParams = z
  .object({
    uuid: z
      .string()
      .min(1)
      .optional()
      .describe(
        "A compendium document uuid to import first, then tokenize. Exactly one of uuid or " +
          "actorId must be given.",
      ),
    actorId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Id of an actor already in the world to tokenize. Exactly one of uuid or actorId " +
          "must be given.",
      ),
    x: z.number().describe("Scene pixel x coordinate for the drop (see get-current-scene)."),
    y: z.number().describe("Scene pixel y coordinate for the drop (see get-current-scene)."),
    quantity: z
      .number()
      .int()
      .positive()
      .max(SANE_QUANTITY_MAX)
      .default(1)
      .describe(
        "How many tokens to drop (each offset by one grid square so they don't stack exactly); " +
          "when uuid is given, also how many copies of the actor to import.",
      ),
  })
  .strict()
  .refine((v) => (v.uuid !== undefined) !== (v.actorId !== undefined), {
    message: "exactly one of uuid or actorId must be given",
    path: ["uuid"],
  });
export type CreateTokenParams = z.infer<typeof CreateTokenParams>;

export const CreatedTokenRow = z
  .object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
  })
  .strict();
export type CreatedTokenRow = z.infer<typeof CreatedTokenRow>;

export const CreateTokenResult = z
  .object({
    actor: z.object({ uuid: z.string(), id: z.string(), name: z.string() }).strict(),
    tokens: z.array(CreatedTokenRow),
    sceneId: z.string(),
  })
  .strict();
export type CreateTokenResult = z.infer<typeof CreateTokenResult>;

// ---------------------------------------------------------------------------
// create-journal (S5 write tool)
// ---------------------------------------------------------------------------

export const CreateJournalParams = z
  .object({
    name: z.string().min(1).describe("The journal entry's title."),
    content: z.string().describe("HTML body for the journal's single text page."),
    folder: z
      .string()
      .optional()
      .describe(
        'Name of an EXISTING "JournalEntry"-type world folder — looked up, never created; ' +
          'a missing folder is a typed "not-found" error.',
      ),
  })
  .strict();
export type CreateJournalParams = z.infer<typeof CreateJournalParams>;

export const CreateJournalResult = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
  })
  .strict();
export type CreateJournalResult = z.infer<typeof CreateJournalResult>;

// ---------------------------------------------------------------------------
// S1 authoring tools (spec 0026) — 8 new write tools superseding 0023 D5 for
// these tools only (D-1 hybrid: clone-from-compendium-then-patch via `baseUuid`,
// OR full hand-authored `system` JSON where no base fits). Every create is
// portal-stamped module-side (D-6) and every create result carries a
// `warnings` array (D-7 read-back): pf2e's `npc`/`spell`/`equipment`/... types
// are template.json — no schema validation, garbage stored silently — and rule
// elements (system.rules) are never DB-validated (a bad RE just goes
// `ignored: true` at actor data-prep). A create can report "ok" and still be
// wrong, so the module inspects what it actually made and says so, rather than
// pretending success.
// ---------------------------------------------------------------------------

// --- create-actor ---

export const CreateActorType = z.enum(["npc", "hazard"]);
export type CreateActorType = z.infer<typeof CreateActorType>;

export const CreateActorParams = z
  .object({
    type: CreateActorType.describe(
      'pf2e actor subtype. "npc" is a template.json type — NO schema validation, garbage is ' +
        "stored silently (verified against pf2e-7.12.2); prefer a baseUuid clone when a " +
        'reasonably close statblock exists. "hazard" is a DataModel — strictly validated, so a ' +
        "bad field throws a typed validation-failed error naming the problem instead of quietly " +
        "storing junk.",
    ),
    name: z.string().min(1).describe("The actor's display name."),
    system: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Opaque pf2e system data, deep-merged over Foundry's actor-type defaults (never " +
          "modeled or validated at this layer — D-7). NPCs take ability MODIFIERS directly at " +
          "abilities.<key>.mod (not scores), plus attributes.{ac.value, hp.value, hp.max, " +
          "speed}, saves.<key>.value, perception.mod, skills.<slug>.base, traits.{value, " +
          "rarity, size.value}, details.level.value. Omit entirely to accept Foundry's bare " +
          "defaults (a valid, if blank, actor).",
      ),
    items: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe(
        "Embedded item source documents to create alongside the actor in the same call — e.g. " +
          'melee strikes (type "melee": bonus.value + damageRolls), special-ability "action" ' +
          "items (mechanics often live as @Damage/@Check enrichers in the HTML description, not " +
          "structured fields), or a spellcastingEntry plus its spells (set each spell's " +
          "system.location.value to the entry's id to make it castable — see create-item). Each " +
          "element is a full, structurally opaque item-source object (name/type/system/...), " +
          "the same opaque-payload posture as this tool's own `system`. Counts against the " +
          "per-request create cap alongside the actor itself: 1 + items.length.",
      ),
    baseUuid: z
      .string()
      .min(1)
      .optional()
      .describe(
        "A compendium document's uuid (from search-compendium) to clone as the starting point, " +
          "then patch with `system`/`items` on top (D-1 hybrid) — the safest path when a " +
          "reasonably close statblock already exists; the source compendium document is never " +
          "modified.",
      ),
    folder: z
      .string()
      .optional()
      .describe(
        'Name of an EXISTING "Actor"-type world folder to file the new actor under — looked up, ' +
          'never created; a missing folder is a typed "not-found" error.',
      ),
    img: z.string().optional().describe("Portrait/token image path or URL."),
  })
  .strict();
export type CreateActorParams = z.infer<typeof CreateActorParams>;

export const CreateActorResult = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    itemUuids: z
      .array(z.string())
      .optional()
      .describe("Uuids of any embedded items created from `items`, in the same order."),
    warnings: z
      .array(z.string())
      .describe(
        "D-7 read-back findings — e.g. a rule element that came back ignored at data-prep, or a " +
          "template.json field that plainly didn't take. Always present, even when empty: an " +
          "empty array is itself the signal that the read-back ran and found nothing wrong.",
      ),
  })
  .strict();
export type CreateActorResult = z.infer<typeof CreateActorResult>;

// --- create-item ---

/** The pf2e item subtypes portal can author. A mix of DataModel types (`effect`,
 * `condition`, `melee`, `feat`, `action` — strictly validated) and template.json types
 * (the rest — no schema validation, D-7). */
export const Pf2eItemType = z.enum([
  "effect",
  "spell",
  "spellcastingEntry",
  "equipment",
  "weapon",
  "armor",
  "consumable",
  "feat",
  "action",
  "melee",
  "lore",
  "condition",
  "treasure",
  "backpack",
  "kit",
]);
export type Pf2eItemType = z.infer<typeof Pf2eItemType>;

export const CreateItemParams = z
  .object({
    name: z.string().min(1).describe("The item's display name."),
    type: Pf2eItemType.describe(
      '"effect"/"condition"/"melee"/"feat"/"action" are DataModels — strictly validated, a bad ' +
        "field throws a typed validation-failed error. The rest are template.json types — no " +
        "schema validation, garbage stored silently (D-7).",
    ),
    system: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Opaque pf2e system data, deep-merged over the type's defaults (D-7). Rule elements " +
          "ride system.rules — an unvalidated array; a bad RE is silently marked ignored:true " +
          "at actor data-prep and surfaced here as warnings[] when this item is created " +
          'embedded on an actor. AURAS ARE A TWO-ITEM PATTERN: this item carries {key:"Aura", ' +
          "radius, effects:[{uuid, affects, events, save, removeOnExit}]} pointing at a " +
          "SEPARATE companion effect item (create it first, world or compendium uuid) that " +
          "carries the actual modifier rule elements — the aura carrier alone does nothing. A " +
          "spell is castable only once system.location.value equals a spellcastingEntry item's " +
          "id — create the entry first. For a creature that should visibly glow, put a " +
          "TokenLight rule element here (it moves with the token); create-light instead places " +
          "static, unattached scene furniture (a torch, a room's ambient glow) — the two tools " +
          "are not interchangeable.",
      ),
    actorId: z
      .string()
      .optional()
      .describe(
        "Id of a world actor to create this item embedded ON, instead of as a standalone world " +
          "item. Required for strikes/spells/effects that should belong to a specific NPC or PC.",
      ),
    baseUuid: z
      .string()
      .min(1)
      .optional()
      .describe(
        "A compendium document's uuid (from search-compendium) to clone as the starting point, " +
          "then patch with `system` on top (D-1 hybrid) — strongly preferred for spells (keeps " +
          "pf2e's math sane) and for anything with a close-enough existing source.",
      ),
    rulesSelections: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Pre-seeds flags.pf2e.rulesSelections for this item's rule elements. REQUIRED when " +
          "creating/granting an item whose rules carry a ChoiceSet without one — otherwise " +
          "Foundry opens an interactive picker dialog in the GM's own browser and the call " +
          "wedges until the bridge query times out with a typed error.",
      ),
    img: z.string().optional().describe("Item icon path or URL."),
  })
  .strict();
export type CreateItemParams = z.infer<typeof CreateItemParams>;

export const CreateItemResult = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    warnings: z
      .array(z.string())
      .describe(
        "D-7 read-back findings — rule elements found ignored:true after this item was " +
          "instantiated (an unknown RE key, a malformed Aura/TokenLight config, ...). Always " +
          "present, even when empty.",
      ),
  })
  .strict();
export type CreateItemResult = z.infer<typeof CreateItemResult>;

// --- apply-condition ---

export const ConditionAction = z.enum(["increase", "decrease", "toggle"]);
export type ConditionAction = z.infer<typeof ConditionAction>;

export const PersistentDamageParams = z
  .object({
    formula: z.string().min(1).describe('Damage formula, e.g. "2d6".'),
    damageType: z.string().min(1).describe('pf2e damage type slug, e.g. "fire", "bleed".'),
    dc: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Flat check DC to end the persistent damage; omit to use pf2e's default (15)."),
  })
  .strict();
export type PersistentDamageParams = z.infer<typeof PersistentDamageParams>;

export const ApplyConditionParams = z
  .object({
    actorId: z.string().min(1).describe("Id of the world actor to apply the condition to."),
    slug: z
      .string()
      .min(1)
      .describe(
        'pf2e condition slug, e.g. "frightened", "prone", "persistent-damage" — never a ' +
          "hand-built condition item; this tool always goes through " +
          "game.pf2e.ConditionManager, pf2e's own condition machinery.",
      ),
    action: ConditionAction.describe(
      '"increase"/"decrease" step a valued condition (e.g. frightened) by `value` (default 1); ' +
        '"toggle" turns a valueless condition (e.g. prone) on or off.',
    ),
    value: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Amount to increase/decrease by (default 1). Ignored for toggle."),
    persistentDamage: PersistentDamageParams.optional().describe(
      'REQUIRED when slug is "persistent-damage" — the bare ConditionManager path for this ' +
        "condition opens an interactive editor dialog in the GM's browser; this tool always " +
        "takes the explicit-params path instead, so the bridge never triggers UI.",
    ),
  })
  .strict();
export type ApplyConditionParams = z.infer<typeof ApplyConditionParams>;

export const ApplyConditionResult = z
  .object({
    actorUuid: z.string(),
    slug: z.string(),
    active: z.boolean().describe("Whether the condition is present on the actor after this call."),
    value: z
      .number()
      .optional()
      .describe("The condition's resulting value, for valued conditions; omitted for toggles."),
  })
  .strict();
export type ApplyConditionResult = z.infer<typeof ApplyConditionResult>;

// --- create-light ---

export const LightAnimationParams = z
  .object({
    type: z
      .string()
      .optional()
      .describe(
        'Foundry core animation type — common ones are "torch", "pulse", "chroma", "fog", ' +
          '"sunburst", "dome", "emanation", "hexa", "ghost", "energy", "roiling", "hole". ' +
          "Prefer one of these; an unrecognized string just renders the light unanimated " +
          "(harmless — passed through unvalidated).",
      ),
    speed: z.number().optional().describe("Animation speed, 0-10 (Foundry default 5)."),
    intensity: z.number().optional().describe("Animation intensity, 0-10 (Foundry default 5)."),
  })
  .strict();
export type LightAnimationParams = z.infer<typeof LightAnimationParams>;

export const LightDarknessRange = z
  .object({
    min: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Scene darkness-level floor for this light to be active."),
    max: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Scene darkness-level ceiling for this light to be active."),
  })
  .strict();
export type LightDarknessRange = z.infer<typeof LightDarknessRange>;

export const LightConfigParams = z
  .object({
    bright: z.number().nonnegative().optional().describe("Bright radius, in scene units (feet)."),
    dim: z.number().nonnegative().optional().describe("Dim radius, in scene units (feet)."),
    color: z.string().optional().describe('Light tint, e.g. "#ff8800".'),
    alpha: z.number().min(0).max(1).optional().describe("Color intensity, 0-1."),
    angle: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe("Cone angle in degrees; 360 (default) is a full circle."),
    negative: z
      .boolean()
      .optional()
      .describe("True makes this a DARKNESS source (light-absorbing) instead of a light source."),
    animation: LightAnimationParams.optional(),
    darkness: LightDarknessRange.optional().describe(
      "Restricts this light to only be active within a scene darkness-level range.",
    ),
  })
  .strict();
export type LightConfigParams = z.infer<typeof LightConfigParams>;

export const CreateLightParams = z
  .object({
    sceneId: z
      .string()
      .optional()
      .describe(
        "Target scene id (see list-scenes/get-current-scene); defaults to the active scene.",
      ),
    x: z.number().describe("Scene pixel x coordinate."),
    y: z.number().describe("Scene pixel y coordinate."),
    hidden: z
      .boolean()
      .optional()
      .describe("Create the light hidden from players, visible only to the GM (default false)."),
    config: LightConfigParams.optional().describe(
      "Light appearance/behavior. This tool places static SCENE FURNITURE — a torch, a room's " +
        'ambient glow — for a light that MOVES WITH A CREATURE ("this monster glows"), use ' +
        "create-item with a TokenLight rule element instead; the two are not interchangeable.",
    ),
  })
  .strict();
export type CreateLightParams = z.infer<typeof CreateLightParams>;

export const CreateLightResult = z
  .object({
    sceneId: z.string(),
    lightUuid: z
      .string()
      .describe(
        "The created AmbientLight's embedded uuid (Scene.<id>.AmbientLight.<id>) — pass this " +
          "to update-document/delete-document to move, retint, or remove it later. There is no " +
          "scene-read tool that lists lights (a scene's full document is large — walls, tiles, " +
          "...); this uuid is the only handle you get back.",
      ),
    warnings: z
      .array(z.string())
      .describe("D-7 read-back findings; always present, even when empty."),
  })
  .strict();
export type CreateLightResult = z.infer<typeof CreateLightResult>;

// --- create-macro ---

export const MacroType = z.enum(["script", "chat"]);
export type MacroType = z.infer<typeof MacroType>;

export const CreateMacroParams = z
  .object({
    name: z.string().min(1).describe("The macro's display name."),
    macroType: MacroType.describe(
      '"script" runs arbitrary JavaScript with the executing user\'s privileges — through this ' +
        'bridge that is always the GM (see execute-macro, D-9). "chat" posts `command` as a ' +
        "chat message when run. Named macroType, not type, to avoid colliding with the " +
        "document-type conventions used by create-actor/create-item.",
    ),
    command: z
      .string()
      .describe(
        "The macro body: JavaScript source for a script macro, or chat message text for chat.",
      ),
    img: z.string().optional().describe("Macro icon path or URL."),
  })
  .strict();
export type CreateMacroParams = z.infer<typeof CreateMacroParams>;

export const CreateMacroResult = z
  .object({
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    warnings: z
      .array(z.string())
      .describe("D-7 read-back findings; always present, even when empty."),
  })
  .strict();
export type CreateMacroResult = z.infer<typeof CreateMacroResult>;

// Note (verified against pf2e-7.12.2 + the Foundry v13 docs): creating a macro NEVER
// executes it — running one requires the separate execute-macro tool, below.

// --- update-document ---

export const UpdateDocumentParams = z
  .object({
    uuid: z
      .string()
      .min(1)
      .describe(
        "A world or embedded document uuid — e.g. Actor.<id>, Actor.<id>.Item.<id>, " +
          "Scene.<id>.AmbientLight.<id>, Macro.<id> (from a prior tool result or search-world).",
      ),
    updates: z
      .record(z.string(), z.unknown())
      .describe(
        'Dot-path keys to new values, e.g. {"system.attributes.hp.value": 20} — diff-merged ' +
          "onto the document (Foundry's native update semantics), NOT a wholesale replace. " +
          "Gotchas: ARRAYS ARE REPLACED WHOLESALE (no array splice — send the full array back); " +
          'a key like "system.foo.-=bar": null DELETES system.foo.bar; on player characters ' +
          "(actor type character) the DERIVED paths system.saves.*, system.perception.*, " +
          "system.traits.*, system.attributes.ac.*, and system.attributes.classDC.* are " +
          "REFUSED with a typed validation-failed error naming the path — pf2e recomputes " +
          "these every prep cycle, they cannot be hand-set. Mechanics can also hide inside " +
          "description HTML (@Damage/@Check enrichers) — a plain string update on a description " +
          "field is how those get changed.",
      ),
  })
  .strict();
export type UpdateDocumentParams = z.infer<typeof UpdateDocumentParams>;

export const UpdateDocumentResult = z
  .object({
    uuid: z.string(),
    updatedPaths: z
      .array(z.string())
      .optional()
      .describe("The dot-path keys actually applied — echoes the accepted subset of `updates`."),
  })
  .strict();
export type UpdateDocumentResult = z.infer<typeof UpdateDocumentResult>;

// --- delete-document ---

export const DeleteDocumentParams = z
  .object({
    uuid: z
      .string()
      .min(1)
      .describe(
        "A world or embedded document uuid to permanently delete. REFUSED with a typed " +
          'not-portal-created error unless the document is stamped flags["astra-portal"]' +
          ".created — portal can only clean up documents it made itself; hand-authored content " +
          "can never be destroyed through this tool (D-4).",
      ),
  })
  .strict();
export type DeleteDocumentParams = z.infer<typeof DeleteDocumentParams>;

export const DeleteDocumentResult = z
  .object({
    uuid: z.string(),
    deleted: z.literal(true),
  })
  .strict();
export type DeleteDocumentResult = z.infer<typeof DeleteDocumentResult>;

// --- execute-macro ---

export const ExecuteMacroParams = z
  .object({
    macroId: z
      .string()
      .min(1)
      .describe(
        "Id of a world macro (from create-macro or search-world) to run IMMEDIATELY, AS THE " +
          "GM — a script macro executes arbitrary JavaScript with full GM privileges the " +
          "instant this call succeeds; there is no confirmation step and no undo. Gated by the " +
          "module's own allow-macro-execution setting (independently switchable off without " +
          "disabling other writes) in addition to the normal write gate.",
      ),
  })
  .strict();
export type ExecuteMacroParams = z.infer<typeof ExecuteMacroParams>;

export const ExecuteMacroResult = z
  .object({
    macroId: z.string(),
    returned: z
      .string()
      .optional()
      .describe(
        "The macro's return value, best-effort JSON-stringified, when it returned something " +
          "capturable. Omitted for chat macros and script macros that returned nothing.",
      ),
  })
  .strict();
export type ExecuteMacroResult = z.infer<typeof ExecuteMacroResult>;
