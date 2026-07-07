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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { Bridge } from "./bridge";
import { SERVICE_NAME } from "./constants";

const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);

const mcpAuthRejections = lazyCounter(SERVICE_NAME, "astra.portal.mcp.auth_rejections", {
  description: "Streamable-HTTP /mcp requests rejected for a missing/wrong bearer key",
});
const mcpToolCalls = lazyCounter(SERVICE_NAME, "astra.portal.mcp.tool_calls", {
  description: "MCP tool invocations, by tool and outcome",
});

/** Registers every portal MCP tool against one `Bridge` instance. S4/S5 extend this
 * function with the read/write tools — same seam, same bridge. */
export function buildMcpServer(bridge: Bridge): McpServer {
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

  return server;
}

/** Builds the `/mcp` request handler: bearer-check, then a stateless Streamable-HTTP
 * round-trip. Takes the resolved key (not the config/SecretRef) so tests never need
 * real SOPS secrets. */
export function createMcpRequestHandler(
  bridge: Bridge,
  mcpApiKey: string,
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

    const server = buildMcpServer(bridge);
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
