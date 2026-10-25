/**
 * The Streamable-HTTP MCP surface — bearer-gated on
 * `cfg.portal.mcpApiKey` (the MCP-client hop of the two-hop auth; the module's bridge
 * secret is the other), mounted at
 * {@link MCP_HTTP_PATH} on the portal HTTP server. {@link buildMcpServer} registers one
 * MCP tool per entry of the `PORTAL_TOOLS` registry in `@astra/portal-shared`; this
 * file adds only what is server-side by nature: the bridge round-trip, the create cap,
 * the audit log, telemetry and the markdown renderers.
 *
 * Runs **stateless** (`sessionIdGenerator: undefined`): a fresh `McpServer` +
 * `StreamableHTTPServerTransport` per request. That's the simplest correct shape here
 * — portal has no per-session state of its own (the bridge is the one stateful thing,
 * and it's a module-level singleton shared across every request), and Claude Code +
 * Claude Desktop both speak plain request/response Streamable-HTTP fine without
 * a server-held session.
 */

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import {
  BridgeError,
  bridgeMethod,
  PLAYER_TOOL_NAMES as REGISTRY_PLAYER_TOOL_NAMES,
  PORTAL_TOOL_NAMES,
  PORTAL_TOOLS,
  PORTAL_VERSION,
  type PortalToolName,
  type ToolResult,
} from "@astra/portal-shared";
import { json, safeEqual } from "@astra/service-kit";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { SpanStatusCode } from "@opentelemetry/api";

import { type Bridge } from "./bridge";
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
const mcpResultMismatches = lazyCounter(SERVICE_NAME, "astra.portal.mcp.result_mismatches", {
  description: "Module results that failed their registry result schema, by tool",
});

/** The write audit trail — a dedicated, greppable INFO log line for every write-tool call
 * (both allowed and denied), independent of the tracer span every tool already gets.
 * Mitigates the risk of default-ON writes on a live campaign: a full record of
 * every create an LLM client issued against "Faerrin", searchable in SigNoz by
 * `portal.audit.tool`. Only `kind: "write"` registry entries call this. */
function auditWrite(tool: string, params: unknown, outcome: string): void {
  log.emit({
    severityText: "INFO",
    body: `portal write audit: tool=${tool} outcome=${outcome} params=${JSON.stringify(params)}`,
    attributes: { "portal.audit.tool": tool, "portal.audit.outcome": outcome },
  });
}

/** The player-facing query tools render their bridge result as markdown
 * instead of raw JSON. The module stays dumb (typed compact JSON over the wire); this
 * is a server-side presentation choice. Every other tool returns its result as JSON. */
const RENDERERS: { [K in PortalToolName]?: (result: ToolResult<K>, params: unknown) => string } = {
  "query-party": (result) => renderQueryParty(result),
  "query-player": (result, params) => renderQueryPlayer(result, params),
  "query-item": (result) => renderQueryItem(result),
  "query-rolls": (result, params) => renderQueryRolls(result, params),
};

/** Renders one tool's result as MCP text content. The result has already been checked
 * against the tool's registry schema (see {@link checkResult}), so the renderer's typed
 * view of it holds unless the module drifted, which the mismatch counter reports. */
function renderResult(name: PortalToolName, result: unknown, params: unknown): string {
  const render = RENDERERS[name] as ((result: unknown, params: unknown) => string) | undefined;
  return render ? render(result, params) : JSON.stringify(result);
}

/** Checks a module result against the tool's registry `result` schema. A mismatch is
 * reported (WARN log and counter), never enforced: the original result is still
 * returned unchanged, so MCP clients see exactly what they saw before this check
 * existed. Enforcing it as a typed error would be a protocol change. */
function checkResult(name: PortalToolName, result: unknown): void {
  const parsed = PORTAL_TOOLS[name].result.safeParse(result);
  if (parsed.success) return;
  mcpResultMismatches.add(1, { tool: name });
  log.emit({
    severityText: "WARN",
    body:
      `portal result mismatch: tool=${name} the module's result does not match the registry ` +
      `schema (module/server version skew?): ${parsed.error.message}`,
    attributes: { "portal.tool": name },
  });
}

/**
 * Registers one MCP tool from its registry entry. Every call gets a span and a counter;
 * a thrown {@link BridgeError} (typed `.code` — `bridge-offline`, `not-found`, etc.)
 * maps to an `isError` tool result carrying `{code,message}` JSON, so every failure is
 * a typed, inspectable result, never an uncaught throw back to the MCP client and
 * never a hang.
 *
 * Write tools add two concerns: `creates` rejects an oversized batch with a typed
 * `cap-exceeded` error and NO bridge round-trip at all (the module's own hard
 * ceiling is a second, independent backstop, see `handlers/writes.ts`'s
 * `MODULE_MAX_CREATES_CEILING`), and every call emits the {@link auditWrite} line,
 * allowed or denied.
 */
function registerTool(
  server: McpServer,
  bridge: Bridge,
  name: PortalToolName,
  maxCreatesPerRequest: number,
  auth: AuthContext,
): void {
  const def: (typeof PORTAL_TOOLS)[PortalToolName] = PORTAL_TOOLS[name];
  const audit = def.kind === "write";
  const creates = "creates" in def ? def.creates : undefined;

  // The callback body only ever forwards `params` verbatim to `bridge.sendQuery` — it
  // never inspects its shape — so it's typed `unknown` here and cast on the way in.
  // The cast is required, not stylistic: the MCP SDK's `registerTool` picks the
  // parsed-args callback shape via a conditional type keyed on its own `InputArgs`
  // generic, and TS can't reduce that conditional against a union of every tool's
  // schema — so the callback crosses the `as never` seam once, here.
  // oxlint-disable-next-line require-await -- the MCP SDK expects an async handler
  const handler = async (params: unknown) => {
    return tracer.startActiveSpan(`portal.mcp.tool.${name}`, async (span) => {
      span.setAttribute("auth", auth.method);
      try {
        if (creates) {
          const count = creates(params);
          if (count > maxCreatesPerRequest) {
            throw new BridgeError(
              "cap-exceeded",
              `requested ${count} creates, exceeding the configured max-creates-per-request (${maxCreatesPerRequest})`,
            );
          }
        }
        let result: unknown;
        if (def.runsOn === "server") {
          result = bridge.getStatus();
        } else {
          result = await bridge.sendQuery(bridgeMethod(name), params);
          checkResult(name, result);
        }
        mcpToolCalls.add(1, { tool: name, outcome: "ok", auth: auth.method });
        if (audit) auditWrite(name, params, "ok");
        return { content: [{ type: "text" as const, text: renderResult(name, result, params) }] };
      } catch (err) {
        const bridgeErr =
          err instanceof BridgeError
            ? err
            : new BridgeError("foundry-error", err instanceof Error ? err.message : String(err));
        span.recordException(bridgeErr);
        span.setStatus({ code: SpanStatusCode.ERROR, message: bridgeErr.message });
        mcpToolCalls.add(1, { tool: name, outcome: bridgeErr.code, auth: auth.method });
        if (audit) auditWrite(name, params, `denied: ${bridgeErr.code}`);
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
    {
      ...("title" in def ? { title: def.title } : {}),
      description: def.description,
      ...(def.params ? { inputSchema: def.params } : {}),
    },
    handler,
  );
}

/**
 * The player key's tool subset, derived from each registry entry's `access`.
 * `buildMcpServer` registers only these under `scope: "player"`, and the tools/list
 * tests assert both directions against it (player sees exactly these five; admin sees
 * all 22).
 */
export const PLAYER_TOOL_NAMES: ReadonlySet<string> = REGISTRY_PLAYER_TOOL_NAMES;

/**
 * Resolved once per `/mcp` request in the auth branch below. `scope` drives
 * tool-list filtering (OAuth and the admin key both resolve to `"admin"`); `method` is
 * the telemetry label threaded into every tool-call span/counter so player usage
 * is distinguishable from admin-key/OAuth usage in SigNoz, independent of scope.
 */
export interface AuthContext {
  scope: "admin" | "player";
  method: "admin-key" | "player-key" | "oauth";
}

/** Registers every portal MCP tool against one `Bridge` instance, in registry order
 * (which is the `tools/list` order). `maxCreatesPerRequest` is
 * `cfg.portal.maxCreatesPerRequest`, so write tools can reject an oversized batch
 * before it ever reaches the bridge. `auth` picks the registered tool subset
 * (`scope`) and labels every tool-call span/counter (`method`). */
export function buildMcpServer(
  bridge: Bridge,
  maxCreatesPerRequest: number,
  auth: AuthContext,
): McpServer {
  // One version for the whole portal release (`PORTAL_VERSION` in portal-shared; a
  // module test pins module.json to it), so MCP clients see the same number Foundry's
  // update check compares.
  const server = new McpServer({ name: "astra-portal", version: PORTAL_VERSION });

  for (const name of PORTAL_TOOL_NAMES) {
    // Skipping registration entirely (not just hiding it) means the SDK rejects a
    // player-key call to an admin-only tool as unknown, never as a reachable-but-denied
    // call.
    if (auth.scope === "player" && !PLAYER_TOOL_NAMES.has(name)) continue;
    registerTool(server, bridge, name, maxCreatesPerRequest, auth);
  }

  return server;
}

/** The seam this file needs from {@link PortalOAuthProvider} —
 * narrower than the full `OAuthServerProvider` surface so `mcp.ts` doesn't couple to
 * `oauth.ts`'s registration/consent/persistence machinery, just token verification.
 * `verifyAccessToken` throws (`InvalidTokenError`) on an unknown/expired token —
 * `createMcpRequestHandler` below treats any rejection as "not an OAuth token" and
 * falls through to the 401. */
export interface OAuthTokenVerifier {
  verifyAccessToken(token: string): Promise<unknown>;
}

/** Builds the `/mcp` request handler: tri-way auth check, then a stateless
 * Streamable-HTTP round-trip. Takes the resolved keys (not the config/SecretRef) so tests never need real SOPS secrets.
 *
 * Auth: the admin static bearer (`mcpApiKey`, exact match — Claude Code stays
 * untouched) OR the player static bearer (`playerMcpApiKey`, exact match)
 * OR a valid, unexpired OAuth access token (`oauth.verifyAccessToken`).
 * Each resolves an {@link AuthContext}: admin key and OAuth both resolve `scope:
 * "admin"` (the full tool set, unchanged); the player key resolves `scope: "player"`
 * (the `PLAYER_TOOL_NAMES` subset). Every 401 — missing header, wrong scheme, bad
 * key, invalid/expired OAuth token — carries the `WWW-Authenticate: Bearer
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
): (req: Request) => Promise<Response> {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
    new URL(`${publicOrigin}${MCP_HTTP_PATH}`),
  );
  const wwwAuthenticateHeader = `Bearer resource_metadata="${resourceMetadataUrl}"`;

  function reject(reason: string): Response {
    mcpAuthRejections.add(1, { reason });
    log.emit({ severityText: "WARN", body: `rejected /mcp request: ${reason}` });
    return json({ error: "unauthorized" }, 401, { "www-authenticate": wwwAuthenticateHeader });
  }

  /** The caller's {@link AuthContext}, or the reason it is refused. Both static keys are
   * compared in constant time, and both are always compared. */
  async function authenticate(req: Request): Promise<AuthContext | string> {
    const [scheme, token] = (req.headers.get("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || !token) return "missing-or-malformed-bearer";
    const admin = safeEqual(token, mcpApiKey);
    const player = safeEqual(token, playerMcpApiKey);
    if (admin) return { scope: "admin", method: "admin-key" };
    if (player) return { scope: "player", method: "player-key" };
    try {
      await oauth.verifyAccessToken(token);
    } catch {
      return "invalid-oauth-token";
    }
    return { scope: "admin", method: "oauth" };
  }

  return async function handleMcpRequest(req: Request): Promise<Response> {
    const auth = await authenticate(req);
    if (typeof auth === "string") return reject(auth);

    const server = buildMcpServer(bridge, maxCreatesPerRequest, auth);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void transport.close();
      void server.close();
    };
    try {
      await server.connect(transport);
      const res = await transport.handleRequest(req);
      if (!res.body) {
        close();
        return res;
      }
      // Stateless: one server and transport per request, closed once the answer has been
      // sent or the client has gone away.
      req.signal.addEventListener("abort", close, { once: true });
      const body = res.body.pipeThrough(new TransformStream({ flush: close }));
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (err) {
      close();
      log.emit({
        severityText: "ERROR",
        body: `mcp request failed: ${err instanceof Error ? err.message : err}`,
      });
      return json({ error: "internal" }, 500);
    }
  };
}
