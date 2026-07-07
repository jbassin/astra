/**
 * The portal HTTP server: `/health`, the Streamable-HTTP MCP surface at
 * {@link MCP_HTTP_PATH}, and the bridge WS upgrade at `BRIDGE_WS_PATH` (via
 * `Bridge.attach`). Split `createPortalServer` (build, don't bind) from `listen` (bind)
 * so tests can construct the whole stack against an **injected** config object — no
 * `loadConfig()`/SOPS involved — and bind an ephemeral port (`port: 0`).
 *
 * Plain `node:http`, not srvx: the MCP SDK's `StreamableHTTPServerTransport.handleRequest`
 * takes raw `IncomingMessage`/`ServerResponse` (it reads/writes the Node HTTP objects
 * directly), and portal has no static-file/Range-serving need srvx exists for elsewhere
 * in this repo (orator-backend's SPA) — so there's nothing srvx would add here.
 */
import { createServer, type Server as HttpServer, type ServerResponse } from "node:http";

import { getLogger } from "@astra/observe";

import { Bridge } from "./bridge";
import { MCP_HTTP_PATH, SERVICE_NAME } from "./constants";
import { createMcpRequestHandler } from "./mcp";

const log = getLogger(SERVICE_NAME);

export interface PortalServerOptions {
  port: number;
  mcpApiKey: string;
  bridgeApiKey: string;
  bridgeTimeoutMs: number;
}

export interface PortalServerHandle {
  httpServer: HttpServer;
  bridge: Bridge;
  close(): Promise<void>;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

/** Builds (but does not bind) the portal HTTP server + its `Bridge`. */
export function createPortalServer(opts: PortalServerOptions): PortalServerHandle {
  const bridge = new Bridge({
    bridgeApiKey: opts.bridgeApiKey,
    queryTimeoutMs: opts.bridgeTimeoutMs,
  });
  const handleMcp = createMcpRequestHandler(bridge, opts.mcpApiKey);

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (url.pathname === MCP_HTTP_PATH) {
      void handleMcp(req, res);
      return;
    }
    jsonResponse(res, 404, { error: "not_found" });
  });

  bridge.attach(httpServer);

  return {
    httpServer,
    bridge,
    close: () =>
      new Promise((resolve) => {
        bridge.close();
        httpServer.close(() => resolve());
      }),
  };
}

/** `createPortalServer` + bind on `opts.port` (`0` for an OS-assigned ephemeral port, as
 * tests do). Resolves once listening, with the actual bound port. */
export function listen(opts: PortalServerOptions): Promise<PortalServerHandle & { port: number }> {
  const handle = createPortalServer(opts);
  return new Promise((resolve) => {
    handle.httpServer.listen(opts.port, "0.0.0.0", () => {
      const address = handle.httpServer.address();
      const port = typeof address === "object" && address ? address.port : opts.port;
      log.emit({ severityText: "INFO", body: `astra.portal listening on :${port}` });
      resolve({ ...handle, port });
    });
  });
}
