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
  CreateJournalParams,
  CreateTokenParams,
  GetCurrentSceneParams,
  GetDocumentParams,
  ImportFromCompendiumParams,
  ListCompendiumPacksParams,
  ListScenesParams,
  SearchCompendiumParams,
  SearchWorldParams,
} from "@astra/portal-shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SpanStatusCode } from "@opentelemetry/api";
import type { z } from "zod";

import { BridgeError, type Bridge } from "./bridge";
import { SERVICE_NAME } from "./constants";

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
  },
): void {
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
        mcpToolCalls.add(1, { tool: name, outcome: "ok" });
        if (config.audit) auditWrite(name, params, "ok");
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const bridgeErr =
          err instanceof BridgeError
            ? err
            : new BridgeError("foundry-error", err instanceof Error ? err.message : String(err));
        span.recordException(bridgeErr);
        span.setStatus({ code: SpanStatusCode.ERROR, message: bridgeErr.message });
        mcpToolCalls.add(1, { tool: name, outcome: bridgeErr.code });
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

/** Registers every portal MCP tool against one `Bridge` instance. `maxCreatesPerRequest`
 * is `cfg.portal.maxCreatesPerRequest` (D8) — threaded in so the three S5 write tools
 * can reject an oversized batch before it ever reaches the bridge. */
export function buildMcpServer(bridge: Bridge, maxCreatesPerRequest: number): McpServer {
  const server = new McpServer({ name: "astra-portal", version: "0.0.0" });

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
        try {
          const status = bridge.getStatus();
          mcpToolCalls.add(1, { tool: "bridge-status", outcome: "ok" });
          return { content: [{ type: "text" as const, text: JSON.stringify(status) }] };
        } finally {
          span.end();
        }
      });
    },
  );

  registerBridgeTool(server, bridge, "list-compendium-packs", {
    description:
      "List every compendium pack available in the LIVE pf2e 'Faerrin' FoundryVTT world " +
      "(bestiaries, equipment, spells, feats, ancestries, etc.), with each pack's collection " +
      "id, document type, and label. Use this to discover which pack ids to pass as " +
      "search-compendium's packIds filter, or just to see what source content is installed.",
    paramsSchema: ListCompendiumPacksParams,
    method: "portal.list-compendium-packs",
  });

  registerBridgeTool(server, bridge, "search-compendium", {
    description:
      "Search the pf2e compendium (bestiaries, equipment, spells, feats, etc.) in the LIVE " +
      "'Faerrin' FoundryVTT world for entries whose name matches a query (e.g. 'goblin' finds " +
      "Monster Core goblin statblocks). Use this to find source material to inspect or import — " +
      "results are compact index rows (uuid/name/type/pack), ranked by match quality; pass a " +
      "row's uuid to get-document for the full statblock. Optionally filter by document type " +
      "or a specific set of pack ids (see list-compendium-packs).",
    paramsSchema: SearchCompendiumParams,
    method: "portal.search-compendium",
  });

  registerBridgeTool(server, bridge, "get-document", {
    description:
      "Fetch the full data of one document (an actor, item, journal entry, or scene) from the " +
      "LIVE 'Faerrin' FoundryVTT world or its compendia, by Foundry uuid (as returned by " +
      "search-compendium/search-world/get-current-scene). Returns the complete document as " +
      "opaque JSON — this tool never interprets pf2e's system.* schema, so treat the result as " +
      "raw data to read, not a fixed shape to rely on. Returns a 'not-found' error for an " +
      "unresolvable uuid.",
    paramsSchema: GetDocumentParams,
    method: "portal.get-document",
  });

  registerBridgeTool(server, bridge, "search-world", {
    description:
      "Search actors, items, journal entries, and/or scenes already imported INTO the LIVE " +
      "'Faerrin' FoundryVTT world (not the compendia) for a name match. Use this to find " +
      "existing world content — a player character, an already-imported NPC, a journal page — " +
      "as opposed to compendium source material (use search-compendium for that). Restrict to " +
      "a subset of collections via `types`; defaults to searching all four.",
    paramsSchema: SearchWorldParams,
    method: "portal.search-world",
  });

  registerBridgeTool(server, bridge, "list-scenes", {
    description:
      "List every scene in the LIVE 'Faerrin' FoundryVTT world, noting which one (if any) is " +
      "currently active. Use this to see what scenes exist, or to find a scene's id before " +
      "targeting it with another tool.",
    paramsSchema: ListScenesParams,
    method: "portal.list-scenes",
  });

  registerBridgeTool(server, bridge, "get-current-scene", {
    description:
      "Get the scene currently active/displayed in the LIVE 'Faerrin' FoundryVTT world — grid, " +
      "dimensions, and token count — or `scene: null` if the GM has no scene open. Use this " +
      "before reasoning about the current in-game location or placing something on the map; an " +
      "idle world (no active scene) is a normal result, not an error.",
    paramsSchema: GetCurrentSceneParams,
    method: "portal.get-current-scene",
  });

  // --- S5 write tools (D8: creates ON by default) ------------------------------
  // Every one of these WRITES to the live "Faerrin" campaign world — the description
  // says so loudly (spec Risks: "Default-ON writes"), `creates`+`cap` reject an
  // oversized batch before it reaches the bridge, and `audit: true` logs every call.

  registerBridgeTool(server, bridge, "import-from-compendium", {
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
  });

  registerBridgeTool(server, bridge, "create-token", {
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
  });

  registerBridgeTool(server, bridge, "create-journal", {
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
  });

  return server;
}

/** Builds the `/mcp` request handler: bearer-check, then a stateless Streamable-HTTP
 * round-trip. Takes the resolved key (not the config/SecretRef) so tests never need
 * real SOPS secrets. */
export function createMcpRequestHandler(
  bridge: Bridge,
  mcpApiKey: string,
  maxCreatesPerRequest: number,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token || token !== mcpApiKey) {
      mcpAuthRejections.add(1);
      log.emit({ severityText: "WARN", body: "rejected /mcp request: missing/wrong bearer key" });
      res
        .writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const server = buildMcpServer(bridge, maxCreatesPerRequest);
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
