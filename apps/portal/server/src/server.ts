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
import { MCP_HTTP_PATH, OAUTH_CONSENT_PATH, SERVICE_NAME } from "./constants";
import { createMcpRequestHandler } from "./mcp";
import { handleModuleJson, handlePortalZip } from "./modulePackage";
import { createOAuthSubApp, type PortalOAuthProvider } from "./oauth";

const log = getLogger(SERVICE_NAME);

const MODULE_JSON_PATH = "/module/module.json";
const MODULE_ZIP_PATH = "/module/portal.zip";

// The SDK's own OAuth endpoints (spec 0025 D-5/D-6) — everything `mcpAuthRouter`
// mounts itself. `OAUTH_CONSENT_PATH` (astra-owned, checked separately below) is
// the one OAuth-flow path the SDK doesn't provide.
const OAUTH_SDK_PATHS = new Set(["/authorize", "/token", "/register", "/revoke"]);

export interface PortalServerOptions {
  port: number;
  mcpApiKey: string;
  bridgeApiKey: string;
  bridgeTimeoutMs: number;
  /** `cfg.portal.maxCreatesPerRequest` (D8) — the S5 write tools' per-request create
   * cap, enforced in `mcp.ts` BEFORE a write query reaches the bridge at all. */
  maxCreatesPerRequest: number;
  /** `cfg.portal.publicOrigin` (S6/D11) — baked into the rendered module.json's
   * absolute `manifest`/`download` URLs so Foundry's install-by-Manifest-URL and
   * update checks resolve back to this server. */
  publicOrigin: string;
  /** Directory holding the built Foundry module (`module.json` + `dist/main.js`,
   * S6/D11) — see `index.ts`'s `MODULE_DIR` for how this resolves both locally and
   * in the built image. */
  moduleDir: string;
  /** `cfg.portal.oauthStatePath` (spec 0025 D-2) — the bind-mounted JSON file
   * holding registered OAuth clients + hashed tokens, so a claude.ai connection
   * survives a `just up` redeploy. */
  oauthStatePath: string;
  /** Test-only access-token TTL override (seconds) — production always takes the
   * D-7 default (3600s) baked into `PortalOAuthProvider`; tests shorten this to
   * exercise expiry without a 1h sleep. Not config-sourced (no prod knob needed). */
  accessTokenTtlS?: number;
}

export interface PortalServerHandle {
  httpServer: HttpServer;
  bridge: Bridge;
  /** Spec 0025 S1 — exposed so S2's `/mcp` dual-auth check and tests can call
   * `verifyAccessToken` directly without re-parsing the OAuth state file. */
  oauthProvider: PortalOAuthProvider;
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
  // Spec 0025 D-6: portal does NOT become an Express app — `authApp` is only ever
  // invoked as a bare `(req, res)` function from the one new dispatch arm below,
  // for the handful of OAuth paths. `/mcp`, `/module/*`, `/health`, `/ws` are
  // untouched raw-node handlers. Built before `handleMcp` (S2) so its `provider`
  // is available for the `/mcp` dual-auth check (D-3).
  const { app: authApp, provider: oauthProvider } = createOAuthSubApp({
    statePath: opts.oauthStatePath,
    consentKey: opts.mcpApiKey, // D-1: reuse the existing /mcp key as the consent password
    publicOrigin: opts.publicOrigin,
    accessTokenTtlS: opts.accessTokenTtlS,
  });

  const handleMcp = createMcpRequestHandler(
    bridge,
    opts.mcpApiKey,
    opts.maxCreatesPerRequest,
    oauthProvider,
    opts.publicOrigin,
  );

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
    if (
      OAUTH_SDK_PATHS.has(url.pathname) ||
      url.pathname === OAUTH_CONSENT_PATH ||
      url.pathname.startsWith("/.well-known/")
    ) {
      authApp(req, res);
      return;
    }
    const modulePackageOpts = { publicOrigin: opts.publicOrigin, moduleDir: opts.moduleDir };
    if (req.method === "GET" && url.pathname === MODULE_JSON_PATH) {
      handleModuleJson(res, modulePackageOpts);
      return;
    }
    if (req.method === "GET" && url.pathname === MODULE_ZIP_PATH) {
      handlePortalZip(res, modulePackageOpts);
      return;
    }
    jsonResponse(res, 404, { error: "not_found" });
  });

  bridge.attach(httpServer);

  return {
    httpServer,
    bridge,
    oauthProvider,
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
