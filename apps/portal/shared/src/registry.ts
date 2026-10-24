/**
 * The portal tool registry: every MCP tool defined once, in the order MCP clients see
 * it in `tools/list`. Both sides derive from this table:
 *
 * - portal-server (`mcp.ts`) registers one MCP tool per entry (name, title,
 *   description, input schema), filters by `access` for the player key, forwards
 *   `runsOn: "bridge"` tools as {@link bridgeMethod}, applies the create cap and audit
 *   log for `kind: "write"`, and checks each module result against `result`.
 * - the Foundry module (`handlers/`) must supply exactly one handler per bridge tool
 *   ({@link BridgeToolHandlers}), keyed by the same names and typed by `result`.
 *
 * Adding a tool means one entry here plus its module handler (and a server renderer if
 * it returns markdown); the type checker finds every other place. Field-level text for
 * the LLM lives in each schema's `.describe()` in `tools.ts`; the tool-level text lives
 * in `description` here.
 */
import { z } from "zod";

import {
  ApplyConditionParams,
  ApplyConditionResult,
  BridgeStatusResult,
  CreateActorParams,
  CreateActorResult,
  CreateItemParams,
  CreateItemResult,
  CreateJournalParams,
  CreateJournalResult,
  CreateLightParams,
  CreateLightResult,
  CreateMacroParams,
  CreateMacroResult,
  CreateTokenParams,
  CreateTokenResult,
  DeleteDocumentParams,
  DeleteDocumentResult,
  ExecuteMacroParams,
  ExecuteMacroResult,
  GetCurrentSceneParams,
  GetCurrentSceneResult,
  GetDocumentParams,
  GetDocumentResult,
  ImportFromCompendiumParams,
  ImportFromCompendiumResult,
  ListCompendiumPacksParams,
  ListCompendiumPacksResult,
  ListScenesParams,
  ListScenesResult,
  QueryItemParams,
  QueryItemResult,
  QueryPartyParams,
  QueryPartyResult,
  QueryPlayerParams,
  QueryPlayerResult,
  QueryRollsParams,
  QueryRollsResult,
  SearchCompendiumParams,
  SearchCompendiumResult,
  SearchWorldParams,
  SearchWorldResult,
  UpdateDocumentParams,
  UpdateDocumentResult,
} from "./tools";

/** The namespace of every bridge query method. It equals the Foundry package id
 * (`module.json` `id`), which is what Foundry's `CONFIG.queries` keys are scoped by. */
export const BRIDGE_METHOD_PREFIX = "portal";

/** The wire `McpQuery.method` for a bridge tool (or the module's `ping` diagnostic). */
export function bridgeMethod<N extends string>(name: N): `${typeof BRIDGE_METHOD_PREFIX}.${N}` {
  return `${BRIDGE_METHOD_PREFIX}.${name}`;
}

export interface ToolDef {
  /** Shown as the MCP tool `title`. Only `bridge-status` has one today. */
  readonly title?: string;
  /** The tool-level text MCP clients (and the LLM) read. */
  readonly description: string;
  /** The MCP `inputSchema`; the module parses raw params with the same schema.
   * `undefined` registers the tool with no input schema at all (`bridge-status`). */
  readonly params: z.ZodType | undefined;
  /** What the tool returns before any server-side rendering: the module's response
   * for a bridge tool, the server's own value for a server tool. */
  readonly result: z.ZodType;
  /** `"player"` tools are visible to the player key as well as admin; `"admin"` tools
   * are not registered at all for the player key. */
  readonly access: "player" | "admin";
  /** `"server"` tools are answered by portal-server alone; `"bridge"` tools are
   * forwarded to the Foundry module as {@link bridgeMethod}(name). */
  readonly runsOn: "server" | "bridge";
  /** Write tools are audit-logged on every call, allowed or denied. */
  readonly kind: "read" | "write";
  /** Write tools that create documents: how many a call would create, read from its
   * raw params before the bridge round-trip, checked against `max-creates-per-request`. */
  readonly creates?: (params: unknown) => number;
}

/** Keeps each entry's literal types (for the derived name unions) while checking it
 * against {@link ToolDef}. */
function defineTool<const T extends ToolDef>(def: T): T {
  return def;
}

/** The create count for tools whose params carry `quantity` (default 1). Defensive
 * against malformed params (falls back to 1, matching each schema's default) since it
 * runs before the module's own zod parse. */
function quantityCount(params: unknown): number {
  const quantity = (params as { quantity?: unknown } | null)?.quantity;
  return typeof quantity === "number" ? quantity : 1;
}

/** create-actor's create count (0026 D-8): the actor itself plus every embedded
 * `items[]` entry requested alongside it. Cascade-created documents (e.g. GrantItem
 * REs) are not pre-counted, deliberately (unknowable pre-flight, fully audited). */
function actorCreateCount(params: unknown): number {
  const items = (params as { items?: unknown } | null)?.items;
  return 1 + (Array.isArray(items) ? items.length : 0);
}

const one = (): number => 1;

export const PORTAL_TOOLS = {
  "bridge-status": defineTool({
    title: "Bridge status",
    description:
      "Liveness of the Foundry module bridge: whether a GM's 'Faerrin' browser tab is " +
      "currently connected. Every other portal tool depends on this being connected — " +
      "call it first if a prior call returned a 'bridge-offline' error.",
    params: undefined,
    result: BridgeStatusResult,
    access: "player",
    runsOn: "server",
    kind: "read",
  }),

  "list-compendium-packs": defineTool({
    description:
      "List every compendium pack available in the LIVE pf2e 'Faerrin' FoundryVTT world " +
      "(bestiaries, equipment, spells, feats, ancestries, etc.), with each pack's collection " +
      "id, document type, and label. Use this to discover which pack ids to pass as " +
      "search-compendium's packIds filter, or just to see what source content is installed.",
    params: ListCompendiumPacksParams,
    result: ListCompendiumPacksResult,
    access: "admin",
    runsOn: "bridge",
    kind: "read",
  }),

  "search-compendium": defineTool({
    description:
      "Search the pf2e compendium (bestiaries, equipment, spells, feats, etc.) in the LIVE " +
      "'Faerrin' FoundryVTT world for entries whose name matches a query (e.g. 'goblin' finds " +
      "Monster Core goblin statblocks). Use this to find source material to inspect or import — " +
      "results are compact index rows (uuid/name/type/pack), ranked by match quality; pass a " +
      "row's uuid to get-document for the full statblock. Optionally filter by document type " +
      "or a specific set of pack ids (see list-compendium-packs).",
    params: SearchCompendiumParams,
    result: SearchCompendiumResult,
    access: "admin",
    runsOn: "bridge",
    kind: "read",
  }),

  "get-document": defineTool({
    description:
      "Fetch the full data of one document (an actor, item, journal entry, or scene) from the " +
      "LIVE 'Faerrin' FoundryVTT world or its compendia, by Foundry uuid (as returned by " +
      "search-compendium/search-world/get-current-scene). Returns the complete document as " +
      "opaque JSON — this tool never interprets pf2e's system.* schema, so treat the result as " +
      "raw data to read, not a fixed shape to rely on. Returns a 'not-found' error for an " +
      "unresolvable uuid.",
    params: GetDocumentParams,
    result: GetDocumentResult,
    access: "admin",
    runsOn: "bridge",
    kind: "read",
  }),

  "search-world": defineTool({
    description:
      "Search actors, items, journal entries, and/or scenes already imported INTO the LIVE " +
      "'Faerrin' FoundryVTT world (not the compendia) for a name match. Use this to find " +
      "existing world content — a player character, an already-imported NPC, a journal page — " +
      "as opposed to compendium source material (use search-compendium for that). Restrict to " +
      "a subset of collections via `types`; defaults to searching all four.",
    params: SearchWorldParams,
    result: SearchWorldResult,
    access: "admin",
    runsOn: "bridge",
    kind: "read",
  }),

  "list-scenes": defineTool({
    description:
      "List every scene in the LIVE 'Faerrin' FoundryVTT world, noting which one (if any) is " +
      "currently active. Use this to see what scenes exist, or to find a scene's id before " +
      "targeting it with another tool.",
    params: ListScenesParams,
    result: ListScenesResult,
    access: "admin",
    runsOn: "bridge",
    kind: "read",
  }),

  "get-current-scene": defineTool({
    description:
      "Get the scene currently active/displayed in the LIVE 'Faerrin' FoundryVTT world — grid, " +
      "dimensions, and token count — or `scene: null` if the GM has no scene open. Use this " +
      "before reasoning about the current in-game location or placing something on the map; an " +
      "idle world (no active scene) is a normal result, not an error.",
    params: GetCurrentSceneParams,
    result: GetCurrentSceneResult,
    access: "admin",
    runsOn: "bridge",
    kind: "read",
  }),

  // 0028's player-key query tools. The server renders their results as markdown.

  "query-party": defineTool({
    description:
      "The party roster for the LIVE 'Faerrin' FoundryVTT world — every player character " +
      "as a full row (name, level, HP, hero points, ancestry/class, owning player) plus every " +
      "companion/familiar as a labeled minimal row (name, type, master). Resolves the party " +
      "actor by type, never a hardcoded id.",
    params: QueryPartyParams,
    result: QueryPartyResult,
    access: "player",
    runsOn: "bridge",
    kind: "read",
  }),

  "query-player": defineTool({
    description:
      "One section of a player character or familiar's sheet in the LIVE 'Faerrin' " +
      "FoundryVTT world, by name or uuid. Sheets are 166-579 KB — far too large for one call " +
      "— so this ALWAYS returns exactly one section per call (see the section param's own " +
      "description for what each one covers). Refuses with a typed not-a-player-character " +
      "error for an npc/party/loot/vehicle/hazard target, and a typed ambiguous-name error " +
      "when a name matches more than one actor (retry with a uuid — see query-party's rows).",
    params: QueryPlayerParams,
    result: QueryPlayerResult,
    access: "player",
    runsOn: "bridge",
    kind: "read",
  }),

  "query-item": defineTool({
    description:
      "Looks up items in the LIVE 'Faerrin' FoundryVTT world — world items, items embedded " +
      "on party members, and compendium rules content (e.g. 'look up the Grab action') — by " +
      "uuid/id or by name. A uuid/id lookup returns ONE item's full detail (traits, price, " +
      "bulk, damage/AC where present, description). A name search returns a provenance-" +
      "labeled hit LIST (never full detail, even for a single match — a world item and an " +
      "embedded item can share a name); pass one hit's uuid back in a follow-up call for its " +
      "detail. GM-hidden world items and player-restricted compendium packs never appear.",
    params: QueryItemParams,
    result: QueryItemResult,
    access: "player",
    runsOn: "bridge",
    kind: "read",
  }),

  "query-rolls": defineTool({
    description:
      "Paginated chat roll history from the LIVE 'Faerrin' FoundryVTT world — newest first. " +
      "Only PUBLIC rolls ever appear (whispered/blind/GM-secret rolls are filtered out " +
      "unconditionally, not a param); filters actor/type/outcome/since/until compose. Each " +
      "row carries the check name, formula → total, degree of success, DC (only when it was " +
      "player-visible), per-die results, and — when present — the enabled modifier " +
      "breakdown (ability/proficiency/item/status/circumstance bonuses). Paginate with the " +
      'previous call\'s nextCursor. Set format="json" for the typed rows verbatim instead ' +
      "of a markdown table.",
    params: QueryRollsParams,
    result: QueryRollsResult,
    access: "player",
    runsOn: "bridge",
    kind: "read",
  }),

  // Write tools (D8: writes on by default). Every one writes to the live campaign world,
  // and the description says so. Creates count against the per-request cap;
  // apply-condition, update-document, delete-document and execute-macro mutate or act
  // and don't (0026 D-8).

  "import-from-compendium": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: clones a compendium document (an actor, " +
      "item, etc. — found via search-compendium/get-document) into the world as a new document, " +
      "verbatim except for a freshly assigned id and (optionally) a folder. Never invents or " +
      "edits pf2e system data — this is a clone, not a hand-authored creation (D5). Creates 1 " +
      "copy by default; pass `quantity` for more. Rejected if write operations are disabled in " +
      "Foundry, the connected session isn't a GM, or the request exceeds the configured " +
      "per-request create cap.",
    params: ImportFromCompendiumParams,
    result: ImportFromCompendiumResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: quantityCount,
  }),

  "create-token": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: drops a token onto the currently active " +
      "scene at (x, y), visible to everyone in the game immediately. Either tokenizes an actor " +
      "that already exists in the world (`actorId`) or imports a compendium document first and " +
      "then tokenizes it (`uuid`, D13) — give exactly one of the two. `quantity` drops multiple " +
      "tokens, each offset by one grid square so they don't stack exactly. Fails with a typed " +
      "'not-found' error if there's no active scene. Same write-gate/cap/audit rules as " +
      "import-from-compendium.",
    params: CreateTokenParams,
    result: CreateTokenResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: quantityCount,
  }),

  "create-journal": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: creates a new journal entry with the " +
      "given name and one HTML text page. Use this to record session notes, NPC dossiers, or " +
      "lore for the GM/players to read in Foundry. Same write-gate/audit rules as " +
      "import-from-compendium (always creates exactly one document, so it never trips the " +
      "per-request cap on its own).",
    params: CreateJournalParams,
    result: CreateJournalResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: one,
  }),

  "create-actor": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: hand-authors a new NPC or hazard actor " +
      "(type), either from scratch via a `system` JSON payload and embedded `items` (strikes, " +
      "actions, spellcasting), or by cloning an existing compendium statblock (`baseUuid`) and " +
      "patching it (D-1 hybrid — prefer this when a close base exists). NPC actors get NO " +
      "schema validation from Foundry — garbage system data is stored silently; hazards ARE " +
      "strictly validated. The result's `warnings` array reports anything that looked wrong " +
      "after creation (e.g. an ignored rule element) — always check it, a clean-looking result " +
      "can still carry warnings. Counts 1 + items.length against the per-request create cap.",
    params: CreateActorParams,
    result: CreateActorResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: actorCreateCount,
  }),

  "create-item": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: hand-authors a new item — an effect, " +
      "spell, spellcastingEntry, weapon, armor, feat, action, melee strike, condition, or other " +
      "pf2e item type — as a standalone world item or embedded directly on an actor " +
      "(`actorId`). Supports the same hybrid model as create-actor (`baseUuid` clone+patch, " +
      "strongly preferred for spells). Carries pf2e rule elements via `system.rules`, including " +
      "the two-item aura pattern and TokenLight for a glowing creature — see the `system` field " +
      "description for the exact recipes. Pass `rulesSelections` when granting an item with a " +
      "ChoiceSet rule element, or the call wedges on a GM-browser dialog. Result `warnings` " +
      "reports any rule element Foundry ignored at creation. Counts 1 against the create cap.",
    params: CreateItemParams,
    result: CreateItemResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: one,
  }),

  "create-light": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: places a new ambient light on a scene " +
      "(defaults to the active scene) at (x, y) — static scene furniture such as a torch or a " +
      "room's magical glow, visible to every connected player immediately. NOT for a light that " +
      "should move with a creature — that's create-item with a TokenLight rule element. Returns " +
      "only the created light's embedded uuid (there is no full-scene-read tool — a scene's " +
      "document also includes walls/tiles and is deliberately not exposed); use " +
      "update-document/delete-document on that uuid to change or remove it later. Counts 1 " +
      "against the create cap.",
    params: CreateLightParams,
    result: CreateLightResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: one,
  }),

  "create-macro": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: creates a new script or chat macro. " +
      "Creating a macro NEVER runs it — the full command text is captured in this write's audit " +
      "trail as the payload of record. To actually run a script macro (arbitrary JavaScript, " +
      "GM-privileged) or post a chat macro, use execute-macro afterward. Counts 1 against the " +
      "create cap.",
    params: CreateMacroParams,
    result: CreateMacroResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
    creates: one,
  }),

  "apply-condition": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: increases, decreases, or toggles a pf2e " +
      "condition on a world actor via Foundry's own condition manager (never a hand-built " +
      "condition item). `persistent-damage` requires explicit formula/damageType params — the " +
      "bare path for that condition would otherwise pop an interactive editor dialog in the " +
      "GM's browser, which this tool never triggers. This is a mutation, not a create — it does " +
      "not count against the per-request create cap.",
    params: ApplyConditionParams,
    result: ApplyConditionResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
  }),

  "update-document": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: applies a dot-path diff-merge update to " +
      "ANY world or embedded document by uuid — including PLAYER CHARACTER sheets (full source " +
      "edit access; HP, level, skill ranks, resources, details, ...), scene lights, and macros. " +
      'Arrays are REPLACED WHOLESALE, not spliced; a `"path.-=key": null` entry deletes a key. ' +
      "Known-derived PC paths (saves/perception/traits/AC/class DC on characters) are refused " +
      "with a typed validation-failed error naming the path, since pf2e recomputes them and a " +
      "write would just be silently discarded or corrupt data prep. Every path touched is " +
      "audited. Not a create — doesn't count against the create cap.",
    params: UpdateDocumentParams,
    result: UpdateDocumentResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
  }),

  "delete-document": defineTool({
    description:
      "WRITES to the live 'Faerrin' FoundryVTT world: PERMANENTLY DELETES a world or embedded " +
      "document by uuid. Refuses with a typed not-portal-created error unless the document is " +
      "stamped as something a portal tool created — portal can only clean up after itself and " +
      "can never destroy hand-authored campaign content, no matter what the caller asks for. " +
      "Not a create — doesn't count against the create cap.",
    params: DeleteDocumentParams,
    result: DeleteDocumentResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
  }),

  "execute-macro": defineTool({
    description:
      "WRITES to (acts on) the live 'Faerrin' FoundryVTT world: runs an existing world macro " +
      "IMMEDIATELY, AS THE GM. A script macro is arbitrary JavaScript executed with full GM " +
      "privileges the instant this call succeeds — there is no confirmation step. Independently " +
      "gated by the module's allow-macro-execution setting on top of the normal write gate, so " +
      "execution can be switched off without disabling other writes. Captures the macro's " +
      "return value best-effort; a thrown error maps to a typed execution-failed result. Not a " +
      "create — doesn't count against the create cap.",
    params: ExecuteMacroParams,
    result: ExecuteMacroResult,
    access: "admin",
    runsOn: "bridge",
    kind: "write",
  }),
} as const satisfies Record<string, ToolDef>;

export type PortalTools = typeof PORTAL_TOOLS;
export type PortalToolName = keyof PortalTools;

/** The tools the Foundry module answers (everything but `bridge-status`). */
export type BridgeToolName = {
  [K in PortalToolName]: PortalTools[K]["runsOn"] extends "bridge" ? K : never;
}[PortalToolName];

export type ToolResult<K extends PortalToolName> = z.infer<PortalTools[K]["result"]>;

/** The module's dispatch table: exactly one handler per bridge tool. A handler takes the
 * raw wire params (it parses them with the tool's `params` schema itself) and returns
 * the tool's `result` shape. A missing or extra key is a type error. */
export type BridgeToolHandlers = {
  readonly [K in BridgeToolName]: (rawParams: unknown) => ToolResult<K> | Promise<ToolResult<K>>;
};

/** Every tool name, in registration (and `tools/list`) order. */
export const PORTAL_TOOL_NAMES = Object.keys(PORTAL_TOOLS) as PortalToolName[];

/** The bridge tools, in registration order. */
export const BRIDGE_TOOL_NAMES = PORTAL_TOOL_NAMES.filter(
  (name): name is BridgeToolName => PORTAL_TOOLS[name].runsOn === "bridge",
);

/** D28-8: the player key's tool subset. The server registers only these under the
 * player key, so an admin-only tool is unknown to a player client, not merely denied. */
export const PLAYER_TOOL_NAMES: ReadonlySet<PortalToolName> = new Set(
  PORTAL_TOOL_NAMES.filter((name) => PORTAL_TOOLS[name].access === "player"),
);
