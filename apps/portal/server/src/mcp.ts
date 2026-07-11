/**
 * The Streamable-HTTP MCP surface (spec 0023 D4/D10) — bearer-gated on
 * `cfg.portal.mcpApiKey` (the MCP-client hop of D6's two-hop auth), mounted at
 * {@link MCP_HTTP_PATH} on the portal HTTP server. S2 registers a single liveness
 * tool, `bridge-status`; S4/S5's read/write tools drop into {@link buildMcpServer}
 * unchanged (same registration seam, same bridge instance).
 *
 * Runs **stateless** (`sessionIdGenerator: undefined`): a fresh `McpServer` +
 * `StreamableHTTPServerTransport` per request. That's the simplest correct shape here
 * — portal has no per-session state of its own (the bridge is the one stateful thing,
 * and it's a module-level singleton shared across every request), and Claude Code +
 * Claude Desktop (D10) both speak plain request/response Streamable-HTTP fine without
 * a server-held session.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import {
  ApplyConditionParams,
  CreateActorParams,
  CreateItemParams,
  CreateJournalParams,
  CreateLightParams,
  CreateMacroParams,
  CreateTokenParams,
  DeleteDocumentParams,
  ExecuteMacroParams,
  GetCurrentSceneParams,
  GetDocumentParams,
  ImportFromCompendiumParams,
  ListCompendiumPacksParams,
  ListScenesParams,
  QueryItemParams,
  QueryPartyParams,
  QueryPlayerParams,
  QueryRollsParams,
  SearchCompendiumParams,
  SearchWorldParams,
  UpdateDocumentParams,
} from "@astra/portal-shared";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SpanStatusCode } from "@opentelemetry/api";
import type { z } from "zod";

import { BridgeError, type Bridge } from "./bridge";
import { MCP_HTTP_PATH, SERVICE_NAME } from "./constants";
import { renderQueryItem, renderQueryParty, renderQueryPlayer, renderQueryRolls } from "./markdown";

const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);

const mcpAuthRejections = lazyCounter(SERVICE_NAME, "astra.portal.mcp.auth_rejections", {
  description: "Streamable-HTTP /mcp requests rejected for a missing/wrong bearer key",
});
const mcpToolCalls = lazyCounter(SERVICE_NAME, "astra.portal.mcp.tool_calls", {
  description: "MCP tool invocations, by tool and outcome",
});

/** S5/D8 audit trail — a dedicated, greppable INFO log line for every write-tool call
 * (both allowed and denied), independent of the tracer span every tool already gets.
 * Mitigates the spec Risks' "Default-ON writes on a live campaign": a full record of
 * every create an LLM client issued against "Faerrin", searchable in SigNoz by
 * `portal.audit.tool`. Read tools never call this (`registerBridgeTool`'s `audit` flag
 * is only set on the three S5 write-tool registrations below). */
function auditWrite(tool: string, params: unknown, outcome: string): void {
  log.emit({
    severityText: "INFO",
    body: `portal write audit: tool=${tool} outcome=${outcome} params=${JSON.stringify(params)}`,
    attributes: { "portal.audit.tool": tool, "portal.audit.outcome": outcome },
  });
}

/**
 * Registers one read/write MCP tool that proxies straight to the Foundry bridge via
 * `bridge.sendQuery(method, params)` — factors the span+metric+error-mapping idiom so
 * the six S4 read tools (and S5's write tools) don't each hand-roll it. A thrown
 * {@link BridgeError} (typed `.code` — `bridge-offline`, `not-found`, etc.) maps to an
 * `isError` tool result carrying `{code,message}` JSON, mirroring how `bridge-status`
 * reports "offline": every failure is a typed, inspectable result, never an uncaught
 * throw back to the MCP client and never a hang.
 *
 * S5 adds two write-tool-only concerns, both no-ops for the S4 read tools that don't
 * pass them: `creates`+`cap` reject an oversized batch with a typed `cap-exceeded`
 * error and NO bridge round-trip at all (D8 — the module's own hard ceiling is a
 * second, independent backstop, see `handlers.ts`'s `MODULE_MAX_CREATES_CEILING`); and
 * `audit` emits the {@link auditWrite} log line for every call, allowed or denied.
 */
function registerBridgeTool<Args extends z.ZodType>(
  server: McpServer,
  bridge: Bridge,
  name: string,
  config: {
    description: string;
    paramsSchema: Args;
    method: string;
    /** Write tools only (S5, D8): computes the number of documents a call would
     * create from its already-zod-parsed params. */
    creates?: (params: unknown) => number;
    /** `cfg.portal.maxCreatesPerRequest` — required alongside `creates`. */
    cap?: number;
    /** Write tools only (S5, D8): emit an {@link auditWrite} log line for this tool. */
    audit?: boolean;
    /** 0028 D28-6: the four player-facing query tools render their bridge result as
     * markdown instead of raw JSON — the module stays dumb (typed compact JSON over
     * the wire, unchanged), this is purely a server-side presentation choice for
     * LLM-client consumption. Omitted for every other (JSON) tool. */
    render?: (result: unknown, params: unknown) => string;
  },
  auth: AuthContext,
): void {
  // D28-8: under scope "player", registration is filtered to PLAYER_TOOL_NAMES — the
  // one source of truth also asserted by the tools/list tests from both directions.
  // Skipping registration entirely (not just hiding it) means the SDK rejects a
  // player-key call to an admin-only tool as unknown, never as a reachable-but-denied
  // call.
  if (auth.scope === "player" && !PLAYER_TOOL_NAMES.has(name)) return;

  // The callback body only ever forwards `params` verbatim to `bridge.sendQuery` — it
  // never inspects its shape — so it's typed `unknown` here and cast on the way in.
  // The cast is required, not stylistic: the MCP SDK's `registerTool` picks the
  // parsed-args callback shape via a conditional type keyed on its own `InputArgs`
  // generic, and TS can't reduce that conditional against `Args` while `Args` is still
  // an abstract type parameter of *this* wrapper function (it only resolves once a
  // caller below supplies a concrete schema) — so the callback has to cross the `as
  // never` seam once, here, instead of at all nine call sites.
  const handler = async (params: unknown) => {
    return tracer.startActiveSpan(`portal.mcp.tool.${name}`, async (span) => {
      span.setAttribute("auth", auth.method);
      try {
        if (config.creates && config.cap !== undefined) {
          const count = config.creates(params);
          if (count > config.cap) {
            throw new BridgeError(
              "cap-exceeded",
              `requested ${count} creates, exceeding the configured max-creates-per-request (${config.cap})`,
            );
          }
        }
        const result = await bridge.sendQuery(config.method, params);
        mcpToolCalls.add(1, { tool: name, outcome: "ok", auth: auth.method });
        if (config.audit) auditWrite(name, params, "ok");
        const text = config.render ? config.render(result, params) : JSON.stringify(result);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const bridgeErr =
          err instanceof BridgeError
            ? err
            : new BridgeError("foundry-error", err instanceof Error ? err.message : String(err));
        span.recordException(bridgeErr);
        span.setStatus({ code: SpanStatusCode.ERROR, message: bridgeErr.message });
        mcpToolCalls.add(1, { tool: name, outcome: bridgeErr.code, auth: auth.method });
        if (config.audit) auditWrite(name, params, `denied: ${bridgeErr.code}`);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ code: bridgeErr.code, message: bridgeErr.message }),
            },
          ],
        };
      } finally {
        span.end();
      }
    });
  };

  server.registerTool(
    name,
    { description: config.description, inputSchema: config.paramsSchema },
    handler as never,
  );
}

/** Reads a request's create count for the cap pre-check (S5, D8) — every write tool's
 * params carry either `quantity` (`import-from-compendium`/`create-token`, default 1)
 * or create exactly one document (`create-journal`). Defensive against a malformed
 * `params` (falls back to 1, matching each schema's own default) since this runs
 * before/independent of the zod parse the bridge itself would perform. */
function createCount(params: unknown): number {
  const quantity = (params as { quantity?: unknown } | null)?.quantity;
  return typeof quantity === "number" ? quantity : 1;
}

/** create-actor's create count (0026 D-8): the actor itself plus every embedded
 * `items[]` entry requested alongside it — cascade-created documents (e.g. GrantItem
 * REs) are NOT pre-counted here, deliberately (D-8: unknowable pre-flight, bounded by
 * content, fully audited). */
function actorCreateCount(params: unknown): number {
  const items = (params as { items?: unknown } | null)?.items;
  return 1 + (Array.isArray(items) ? items.length : 0);
}

/**
 * D28-8 — the player key's tool subset (declared 0028 S1, fully registered as of
 * S3). One source of truth: `buildMcpServer` filters registration to this set
 * under `scope: "player"`, and the tools/list tests assert both directions
 * against it (player sees exactly these five; admin sees all 22).
 */
export const PLAYER_TOOL_NAMES: ReadonlySet<string> = new Set([
  "bridge-status",
  "query-rolls",
  "query-party",
  "query-player",
  "query-item",
]);

/**
 * D28-8 — resolved once per `/mcp` request in the auth branch below. `scope` drives
 * tool-list filtering (OAuth and the admin key both resolve to `"admin"`); `method` is
 * the D28-9 telemetry label threaded into every tool-call span/counter so player usage
 * is distinguishable from admin-key/OAuth usage in SigNoz, independent of scope.
 */
export interface AuthContext {
  scope: "admin" | "player";
  method: "admin-key" | "player-key" | "oauth";
}

/** Registers every portal MCP tool against one `Bridge` instance. `maxCreatesPerRequest`
 * is `cfg.portal.maxCreatesPerRequest` (D8) — threaded in so the three S5 write tools
 * can reject an oversized batch before it ever reaches the bridge. `auth` (D28-8) picks
 * the registered tool subset (`scope`) and labels every tool-call span/counter
 * (`method`, D28-9). */
export function buildMcpServer(
  bridge: Bridge,
  maxCreatesPerRequest: number,
  auth: AuthContext,
): McpServer {
  // 0026 D-12: bump this version on every portal release. Foundry's module
  // update-check compares module.json's version string (bumped in lockstep,
  // module.json), and this server-side McpServer version travels with a real MCP
  // client's own connection/capability negotiation. 0028 D28-7: 0.3.0 -> 0.4.0
  // alongside module.json, landing in this one S3 code slice.
  const server = new McpServer({ name: "astra-portal", version: "0.4.0" });

  // bridge-status is in PLAYER_TOOL_NAMES, so it's always registered regardless of
  // scope — no filter needed here (contrast registerBridgeTool's guard below).
  server.registerTool(
    "bridge-status",
    {
      title: "Bridge status",
      description:
        "Liveness of the Foundry module bridge: whether a GM's 'Faerrin' browser tab is " +
        "currently connected. Every other portal tool depends on this being connected — " +
        "call it first if a prior call returned a 'bridge-offline' error.",
    },
    async () => {
      return tracer.startActiveSpan("portal.mcp.tool.bridge-status", (span) => {
        span.setAttribute("auth", auth.method);
        try {
          const status = bridge.getStatus();
          mcpToolCalls.add(1, { tool: "bridge-status", outcome: "ok", auth: auth.method });
          return { content: [{ type: "text" as const, text: JSON.stringify(status) }] };
        } finally {
          span.end();
        }
      });
    },
  );

  registerBridgeTool(
    server,
    bridge,
    "list-compendium-packs",
    {
      description:
        "List every compendium pack available in the LIVE pf2e 'Faerrin' FoundryVTT world " +
        "(bestiaries, equipment, spells, feats, ancestries, etc.), with each pack's collection " +
        "id, document type, and label. Use this to discover which pack ids to pass as " +
        "search-compendium's packIds filter, or just to see what source content is installed.",
      paramsSchema: ListCompendiumPacksParams,
      method: "portal.list-compendium-packs",
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "search-compendium",
    {
      description:
        "Search the pf2e compendium (bestiaries, equipment, spells, feats, etc.) in the LIVE " +
        "'Faerrin' FoundryVTT world for entries whose name matches a query (e.g. 'goblin' finds " +
        "Monster Core goblin statblocks). Use this to find source material to inspect or import — " +
        "results are compact index rows (uuid/name/type/pack), ranked by match quality; pass a " +
        "row's uuid to get-document for the full statblock. Optionally filter by document type " +
        "or a specific set of pack ids (see list-compendium-packs).",
      paramsSchema: SearchCompendiumParams,
      method: "portal.search-compendium",
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "get-document",
    {
      description:
        "Fetch the full data of one document (an actor, item, journal entry, or scene) from the " +
        "LIVE 'Faerrin' FoundryVTT world or its compendia, by Foundry uuid (as returned by " +
        "search-compendium/search-world/get-current-scene). Returns the complete document as " +
        "opaque JSON — this tool never interprets pf2e's system.* schema, so treat the result as " +
        "raw data to read, not a fixed shape to rely on. Returns a 'not-found' error for an " +
        "unresolvable uuid.",
      paramsSchema: GetDocumentParams,
      method: "portal.get-document",
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "search-world",
    {
      description:
        "Search actors, items, journal entries, and/or scenes already imported INTO the LIVE " +
        "'Faerrin' FoundryVTT world (not the compendia) for a name match. Use this to find " +
        "existing world content — a player character, an already-imported NPC, a journal page — " +
        "as opposed to compendium source material (use search-compendium for that). Restrict to " +
        "a subset of collections via `types`; defaults to searching all four.",
      paramsSchema: SearchWorldParams,
      method: "portal.search-world",
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "list-scenes",
    {
      description:
        "List every scene in the LIVE 'Faerrin' FoundryVTT world, noting which one (if any) is " +
        "currently active. Use this to see what scenes exist, or to find a scene's id before " +
        "targeting it with another tool.",
      paramsSchema: ListScenesParams,
      method: "portal.list-scenes",
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "get-current-scene",
    {
      description:
        "Get the scene currently active/displayed in the LIVE 'Faerrin' FoundryVTT world — grid, " +
        "dimensions, and token count — or `scene: null` if the GM has no scene open. Use this " +
        "before reasoning about the current in-game location or placing something on the map; an " +
        "idle world (no active scene) is a normal result, not an error.",
      paramsSchema: GetCurrentSceneParams,
      method: "portal.get-current-scene",
    },
    auth,
  );

  // --- 0028 S2 player-key query tools (D28-4/D28-6/D28-11) --------------------
  // Read-tool config (no audit/cap/creates), same as the six tools above — the only
  // difference is `render`: these return markdown (D28-6), not JSON. Both names
  // already live in PLAYER_TOOL_NAMES (S1), so registering them makes them visible to
  // player-key requests with no further scope-machinery change.

  registerBridgeTool(
    server,
    bridge,
    "query-party",
    {
      description:
        "The party roster for the LIVE 'Faerrin' FoundryVTT world — every player character " +
        "as a full row (name, level, HP, hero points, ancestry/class, owning player) plus every " +
        "companion/familiar as a labeled minimal row (name, type, master). Resolves the party " +
        "actor by type, never a hardcoded id.",
      paramsSchema: QueryPartyParams,
      method: "portal.query-party",
      render: (result) => renderQueryParty(result as Parameters<typeof renderQueryParty>[0]),
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "query-player",
    {
      description:
        "One section of a player character or familiar's sheet in the LIVE 'Faerrin' " +
        "FoundryVTT world, by name or uuid. Sheets are 166-579 KB — far too large for one call " +
        "— so this ALWAYS returns exactly one section per call (see the section param's own " +
        "description for what each one covers). Refuses with a typed not-a-player-character " +
        "error for an npc/party/loot/vehicle/hazard target, and a typed ambiguous-name error " +
        "when a name matches more than one actor (retry with a uuid — see query-party's rows).",
      paramsSchema: QueryPlayerParams,
      method: "portal.query-player",
      render: (result, params) =>
        renderQueryPlayer(result as Parameters<typeof renderQueryPlayer>[0], params),
    },
    auth,
  );

  // --- 0028 S3 player-key query tools (D28-3/D28-5/D28-10/D28-12/D28-13) -------
  // Same read-tool config + markdown-render posture as query-party/query-player
  // above; both names already live in PLAYER_TOOL_NAMES (S1).

  registerBridgeTool(
    server,
    bridge,
    "query-item",
    {
      description:
        "Looks up items in the LIVE 'Faerrin' FoundryVTT world — world items, items embedded " +
        "on party members, and compendium rules content (e.g. 'look up the Grab action') — by " +
        "uuid/id or by name. A uuid/id lookup returns ONE item's full detail (traits, price, " +
        "bulk, damage/AC where present, description). A name search returns a provenance-" +
        "labeled hit LIST (never full detail, even for a single match — a world item and an " +
        "embedded item can share a name); pass one hit's uuid back in a follow-up call for its " +
        "detail. GM-hidden world items and player-restricted compendium packs never appear.",
      paramsSchema: QueryItemParams,
      method: "portal.query-item",
      render: (result) => renderQueryItem(result as Parameters<typeof renderQueryItem>[0]),
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "query-rolls",
    {
      description:
        "Paginated chat roll history from the LIVE 'Faerrin' FoundryVTT world — newest first. " +
        "Only PUBLIC rolls ever appear (whispered/blind/GM-secret rolls are filtered out " +
        "unconditionally, not a param); filters actor/type/outcome/since/until compose. Each " +
        "row carries the check name, formula → total, degree of success, DC (only when it was " +
        "player-visible), and per-die results. Paginate with the previous call's nextCursor.",
      paramsSchema: QueryRollsParams,
      method: "portal.query-rolls",
      render: (result) => renderQueryRolls(result as Parameters<typeof renderQueryRolls>[0]),
    },
    auth,
  );

  // --- S5 write tools (D8: creates ON by default) ------------------------------
  // Every one of these WRITES to the live "Faerrin" campaign world — the description
  // says so loudly (spec Risks: "Default-ON writes"), `creates`+`cap` reject an
  // oversized batch before it reaches the bridge, and `audit: true` logs every call.

  registerBridgeTool(
    server,
    bridge,
    "import-from-compendium",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: clones a compendium document (an actor, " +
        "item, etc. — found via search-compendium/get-document) into the world as a new document, " +
        "verbatim except for a freshly assigned id and (optionally) a folder. Never invents or " +
        "edits pf2e system data — this is a clone, not a hand-authored creation (D5). Creates 1 " +
        "copy by default; pass `quantity` for more. Rejected if write operations are disabled in " +
        "Foundry, the connected session isn't a GM, or the request exceeds the configured " +
        "per-request create cap.",
      paramsSchema: ImportFromCompendiumParams,
      method: "portal.import-from-compendium",
      creates: createCount,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "create-token",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: drops a token onto the currently active " +
        "scene at (x, y), visible to everyone in the game immediately. Either tokenizes an actor " +
        "that already exists in the world (`actorId`) or imports a compendium document first and " +
        "then tokenizes it (`uuid`, D13) — give exactly one of the two. `quantity` drops multiple " +
        "tokens, each offset by one grid square so they don't stack exactly. Fails with a typed " +
        "'not-found' error if there's no active scene. Same write-gate/cap/audit rules as " +
        "import-from-compendium.",
      paramsSchema: CreateTokenParams,
      method: "portal.create-token",
      creates: createCount,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "create-journal",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: creates a new journal entry with the " +
        "given name and one HTML text page. Use this to record session notes, NPC dossiers, or " +
        "lore for the GM/players to read in Foundry. Same write-gate/audit rules as " +
        "import-from-compendium (always creates exactly one document, so it never trips the " +
        "per-request cap on its own).",
      paramsSchema: CreateJournalParams,
      method: "portal.create-journal",
      creates: () => 1,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  // --- S1 authoring tools (spec 0026) -------------------------------------------
  // Supersede 0023 D5 for these tools only (D-1 hybrid): hand-authored pf2e system
  // JSON + rule elements are now in scope. Every one of these WRITES to the live
  // "Faerrin" FoundryVTT world; creates carry the same cap/audit treatment as the
  // S5 tools above, and update-document/delete-document/execute-macro are audited
  // writes that do NOT count against the create cap (D-8 — they mutate/act, they
  // don't create new documents).

  registerBridgeTool(
    server,
    bridge,
    "create-actor",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: hand-authors a new NPC or hazard actor " +
        "(type), either from scratch via a `system` JSON payload and embedded `items` (strikes, " +
        "actions, spellcasting), or by cloning an existing compendium statblock (`baseUuid`) and " +
        "patching it (D-1 hybrid — prefer this when a close base exists). NPC actors get NO " +
        "schema validation from Foundry — garbage system data is stored silently; hazards ARE " +
        "strictly validated. The result's `warnings` array reports anything that looked wrong " +
        "after creation (e.g. an ignored rule element) — always check it, a clean-looking result " +
        "can still carry warnings. Counts 1 + items.length against the per-request create cap.",
      paramsSchema: CreateActorParams,
      method: "portal.create-actor",
      creates: actorCreateCount,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "create-item",
    {
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
      paramsSchema: CreateItemParams,
      method: "portal.create-item",
      creates: () => 1,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "create-light",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: places a new ambient light on a scene " +
        "(defaults to the active scene) at (x, y) — static scene furniture such as a torch or a " +
        "room's magical glow, visible to every connected player immediately. NOT for a light that " +
        "should move with a creature — that's create-item with a TokenLight rule element. Returns " +
        "only the created light's embedded uuid (there is no full-scene-read tool — a scene's " +
        "document also includes walls/tiles and is deliberately not exposed); use " +
        "update-document/delete-document on that uuid to change or remove it later. Counts 1 " +
        "against the create cap.",
      paramsSchema: CreateLightParams,
      method: "portal.create-light",
      creates: () => 1,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "create-macro",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: creates a new script or chat macro. " +
        "Creating a macro NEVER runs it — the full command text is captured in this write's audit " +
        "trail as the payload of record. To actually run a script macro (arbitrary JavaScript, " +
        "GM-privileged) or post a chat macro, use execute-macro afterward. Counts 1 against the " +
        "create cap.",
      paramsSchema: CreateMacroParams,
      method: "portal.create-macro",
      creates: () => 1,
      cap: maxCreatesPerRequest,
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "apply-condition",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: increases, decreases, or toggles a pf2e " +
        "condition on a world actor via Foundry's own condition manager (never a hand-built " +
        "condition item). `persistent-damage` requires explicit formula/damageType params — the " +
        "bare path for that condition would otherwise pop an interactive editor dialog in the " +
        "GM's browser, which this tool never triggers. This is a mutation, not a create — it does " +
        "not count against the per-request create cap.",
      paramsSchema: ApplyConditionParams,
      method: "portal.apply-condition",
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "update-document",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: applies a dot-path diff-merge update to " +
        "ANY world or embedded document by uuid — including PLAYER CHARACTER sheets (full source " +
        "edit access; HP, level, skill ranks, resources, details, ...), scene lights, and macros. " +
        'Arrays are REPLACED WHOLESALE, not spliced; a `"path.-=key": null` entry deletes a key. ' +
        "Known-derived PC paths (saves/perception/traits/AC/class DC on characters) are refused " +
        "with a typed validation-failed error naming the path, since pf2e recomputes them and a " +
        "write would just be silently discarded or corrupt data prep. Every path touched is " +
        "audited. Not a create — doesn't count against the create cap.",
      paramsSchema: UpdateDocumentParams,
      method: "portal.update-document",
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "delete-document",
    {
      description:
        "WRITES to the live 'Faerrin' FoundryVTT world: PERMANENTLY DELETES a world or embedded " +
        "document by uuid. Refuses with a typed not-portal-created error unless the document is " +
        "stamped as something a portal tool created — portal can only clean up after itself and " +
        "can never destroy hand-authored campaign content, no matter what the caller asks for. " +
        "Not a create — doesn't count against the create cap.",
      paramsSchema: DeleteDocumentParams,
      method: "portal.delete-document",
      audit: true,
    },
    auth,
  );

  registerBridgeTool(
    server,
    bridge,
    "execute-macro",
    {
      description:
        "WRITES to (acts on) the live 'Faerrin' FoundryVTT world: runs an existing world macro " +
        "IMMEDIATELY, AS THE GM. A script macro is arbitrary JavaScript executed with full GM " +
        "privileges the instant this call succeeds — there is no confirmation step. Independently " +
        "gated by the module's allow-macro-execution setting on top of the normal write gate, so " +
        "execution can be switched off without disabling other writes. Captures the macro's " +
        "return value best-effort; a thrown error maps to a typed execution-failed result. Not a " +
        "create — doesn't count against the create cap.",
      paramsSchema: ExecuteMacroParams,
      method: "portal.execute-macro",
      audit: true,
    },
    auth,
  );

  return server;
}

/** The seam this file needs from {@link PortalOAuthProvider} (spec 0025 D-3) —
 * narrower than the full `OAuthServerProvider` surface so `mcp.ts` doesn't couple to
 * `oauth.ts`'s registration/consent/persistence machinery, just token verification.
 * `verifyAccessToken` throws (`InvalidTokenError`) on an unknown/expired token —
 * `createMcpRequestHandler` below treats any rejection as "not an OAuth token" and
 * falls through to the 401. */
export interface OAuthTokenVerifier {
  verifyAccessToken(token: string): Promise<unknown>;
}

/** Builds the `/mcp` request handler: tri-way auth check (spec 0025 D-3 + 0028 D28-1/
 * D28-8), then a stateless Streamable-HTTP round-trip. Takes the resolved keys (not
 * the config/SecretRef) so tests never need real SOPS secrets.
 *
 * Auth: the admin static bearer (`mcpApiKey`, exact match — Claude Code stays
 * untouched) OR the player static bearer (`playerMcpApiKey`, exact match, 0028 D28-1)
 * OR a valid, unexpired OAuth access token (`oauth.verifyAccessToken`, spec 0025 S1).
 * Each resolves an {@link AuthContext}: admin key and OAuth both resolve `scope:
 * "admin"` (the full tool set, unchanged); the player key resolves `scope: "player"`
 * (D28-8's `PLAYER_TOOL_NAMES` subset). Every 401 — missing header, wrong scheme, bad
 * key, invalid/expired OAuth token — carries the spec's D-9 `WWW-Authenticate: Bearer
 * resource_metadata="<url>"` header so an OAuth-aware client (claude.ai) discovers
 * where to start the authorization flow; the URL is computed once here via the SDK's
 * own {@link getOAuthProtectedResourceMetadataUrl} (never hand-built) since it must
 * exactly match the PRM path `mcpAuthRouter` actually mounts in `oauth.ts`. */
export function createMcpRequestHandler(
  bridge: Bridge,
  mcpApiKey: string,
  playerMcpApiKey: string,
  maxCreatesPerRequest: number,
  oauth: OAuthTokenVerifier,
  publicOrigin: string,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
    new URL(`${publicOrigin}${MCP_HTTP_PATH}`),
  );
  const wwwAuthenticateHeader = `Bearer resource_metadata="${resourceMetadataUrl}"`;

  function reject(res: ServerResponse, reason: string): void {
    mcpAuthRejections.add(1, { reason });
    log.emit({ severityText: "WARN", body: `rejected /mcp request: ${reason}` });
    res
      .writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": wwwAuthenticateHeader,
      })
      .end(JSON.stringify({ error: "unauthorized" }));
  }

  return async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) {
      reject(res, "missing-or-malformed-bearer");
      return;
    }
    let auth: AuthContext;
    if (token === mcpApiKey) {
      auth = { scope: "admin", method: "admin-key" };
    } else if (token === playerMcpApiKey) {
      auth = { scope: "player", method: "player-key" };
    } else {
      try {
        await oauth.verifyAccessToken(token);
      } catch {
        reject(res, "invalid-oauth-token");
        return;
      }
      auth = { scope: "admin", method: "oauth" };
    }

    const server = buildMcpServer(bridge, maxCreatesPerRequest, auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      log.emit({
        severityText: "ERROR",
        body: `mcp request failed: ${err instanceof Error ? err.message : err}`,
      });
      if (!res.headersSent) {
        res
          .writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "internal" }));
      } else {
        res.end();
      }
    }
  };
}
