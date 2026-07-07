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
    query: z.string().min(1),
    /** Restrict to one `metadata.type` (e.g. `"Actor"`). */
    type: z.string().optional(),
    /** Restrict to specific pack collection keys (e.g. `"pf2e.pathfinder-monster-core"`). */
    packIds: z.array(z.string()).optional(),
    limit: z.number().int().positive().max(200).optional(),
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
    uuid: z.string().min(1),
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
    query: z.string().min(1),
    /** Defaults to all four world collections when omitted. */
    types: z.array(WorldSearchType).optional(),
    limit: z.number().int().positive().max(200).optional(),
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
    /** A compendium document's own uuid, e.g.
     * `"Compendium.pf2e.pathfinder-bestiary.Actor.g1"` — never a world uuid (D5: this
     * tool ONLY clones from a compendium; rejected otherwise). */
    uuid: z.string().min(1),
    /** How many copies to create in one call. */
    quantity: z.number().int().positive().max(SANE_QUANTITY_MAX).default(1),
    /** An existing world folder's name (of the matching document type) to file the new
     * document(s) under. Looked up, never created — a missing folder is a typed
     * "not-found" error, not a silent skip. */
    folder: z.string().optional(),
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
    /** Import this compendium document first, then tokenize the imported actor.
     * Mutually exclusive with `actorId` — exactly one of the two must be given. */
    uuid: z.string().min(1).optional(),
    /** Tokenize an actor that already exists in the world. Mutually exclusive with
     * `uuid` — exactly one of the two must be given. */
    actorId: z.string().min(1).optional(),
    x: z.number(),
    y: z.number(),
    /** How many tokens to drop (each offset by one grid square so they don't stack
     * exactly); when `uuid` is given, also how many copies of the actor to import. */
    quantity: z.number().int().positive().max(SANE_QUANTITY_MAX).default(1),
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
    name: z.string().min(1),
    /** HTML body for the journal's single text page. */
    content: z.string(),
    /** An existing "JournalEntry"-type world folder's name. Looked up, never created —
     * same contract as `import-from-compendium`'s `folder`. */
    folder: z.string().optional(),
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
