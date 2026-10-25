/**
 * The portal HTTP server on `@astra/service-kit`: `/health`, the Streamable-HTTP MCP
 * surface at {@link MCP_HTTP_PATH}, the OAuth endpoints, the module package, and the
 * bridge WS upgrade at {@link BRIDGE_WS_PATH}. `createPortalServer` builds the service
 * definition without binding; `listen` binds it. Tests construct the whole stack against
 * an injected config object (no `loadConfig()`/SOPS) and bind an ephemeral port
 * (`port: 0`).
 *
 * Auth is per route, not a kit route group: `/mcp` checks its own bearer (`mcp.ts`), the
 * bridge checks its handshake key (`bridge.ts`), and the OAuth endpoints are the SDK's
 * Express router, reached through `callNode`.
 */
import {
  callNode,
  createService,
  json,
  route,
  type Service,
  type ServiceDefinition,
  type UpgradeHandler,
} from "@astra/service-kit";

import { Bridge } from "./bridge";
import { BRIDGE_WS_PATH, MCP_HTTP_PATH, OAUTH_CONSENT_PATH, SERVICE_NAME } from "./constants";
import { createMcpRequestHandler } from "./mcp";
import { moduleJsonResponse, portalZipResponse } from "./modulePackage";
import { createOAuthSubApp, type PortalOAuthProvider } from "./oauth";

const MODULE_JSON_PATH = "/module/module.json";
const MODULE_ZIP_PATH = "/module/portal.zip";

// The SDK's own OAuth endpoints — everything `mcpAuthRouter`
// mounts itself, plus `/.well-known/*` (the fallback below). `OAUTH_CONSENT_PATH` is
// astra-owned but lives on the same Express sub-app.
const OAUTH_PATHS = ["/authorize", "/token", "/register", "/revoke", OAUTH_CONSENT_PATH];

export interface PortalServerOptions {
  port: number;
  mcpApiKey: string;
  /** `cfg.portal.playerMcpApiKey` — the second static bearer, compared
   * alongside `mcpApiKey` in the `/mcp` auth branch; a match resolves `scope: "player"`
   * (the read-only tool subset) instead of the admin scope. Load-bearing like
   * `mcpApiKey`/`bridgeApiKey` (resolved via `SecretRef.require()` in `index.ts`), never
   * logged. */
  playerMcpApiKey: string;
  bridgeApiKey: string;
  bridgeTimeoutMs: number;
  /** `cfg.portal.bridgeUserId` — the Foundry user id the server lets hold the bridge;
   * empty means no designation (see `Bridge`). */
  bridgeUserId?: string;
  /** Test-only override of the oldest accepted bridge protocol (see `BridgeOptions`). */
  minBridgeProtocol?: number;
  /** `cfg.portal.maxCreatesPerRequest` — the write tools' per-request create
   * cap, enforced in `mcp.ts` BEFORE a write query reaches the bridge at all. */
  maxCreatesPerRequest: number;
  /** `cfg.portal.publicOrigin` — baked into the rendered module.json's
   * absolute `manifest`/`download` URLs so Foundry's install-by-Manifest-URL and
   * update checks resolve back to this server. */
  publicOrigin: string;
  /** Directory holding the built Foundry module (`module.json` +
   * `dist/main.js`) — see `index.ts`'s `MODULE_DIR` for how this resolves both locally and
   * in the built image. */
  moduleDir: string;
  /** `cfg.portal.oauthStatePath` — the bind-mounted JSON file
   * holding registered OAuth clients + hashed tokens, so a claude.ai connection
   * survives a `just up` redeploy. */
  oauthStatePath: string;
  /** Test-only access-token TTL override (seconds) — production always takes the
   * default (3600s) baked into `PortalOAuthProvider`; tests shorten this to
   * exercise expiry without a 1h sleep. Not config-sourced (no prod knob needed). */
  accessTokenTtlS?: number;
  /** Register the kit's ordered shutdown with observe's SIGTERM handling. Only the
   * entrypoint sets it; tests close the server themselves. */
  handleShutdown?: boolean;
}

export interface PortalServerHandle {
  bridge: Bridge;
  /** Exposed so tests can call `verifyAccessToken` directly without
   * re-parsing the OAuth state file. */
  oauthProvider: PortalOAuthProvider;
  /** The kit's ordered shutdown: stop accepting, close the bridge (1001), drain. */
  close(): Promise<void>;
}

/** The unbound server: its kit definition and the bridge's upgrade endpoint. */
interface PortalServer {
  bridge: Bridge;
  oauthProvider: PortalOAuthProvider;
  definition: ServiceDefinition;
  upgrades: Record<string, UpgradeHandler>;
}

/** Builds (but does not bind) the portal service definition + its `Bridge`. */
export function createPortalServer(opts: PortalServerOptions): PortalServer {
  const bridge = new Bridge({
    bridgeApiKey: opts.bridgeApiKey,
    queryTimeoutMs: opts.bridgeTimeoutMs,
    bridgeUserId: opts.bridgeUserId,
    minProtocol: opts.minBridgeProtocol,
  });
  // Portal does NOT become an Express app — `authApp` is only ever
  // invoked as a bare `(req, res)` function, for the handful of OAuth paths. Built
  // before `handleMcp` so its `provider` is available for the `/mcp` dual-auth
  // check.
  const { app: authApp, provider: oauthProvider } = createOAuthSubApp({
    statePath: opts.oauthStatePath,
    consentKey: opts.mcpApiKey, // reuse the existing /mcp key as the consent password
    publicOrigin: opts.publicOrigin,
    accessTokenTtlS: opts.accessTokenTtlS,
  });
  const oauth = (req: Request) => callNode(req, (nodeReq, nodeRes) => authApp(nodeReq, nodeRes));

  const handleMcp = createMcpRequestHandler(
    bridge,
    opts.mcpApiKey,
    opts.playerMcpApiKey,
    opts.maxCreatesPerRequest,
    oauthProvider,
    opts.publicOrigin,
  );
  const modulePackage = { publicOrigin: opts.publicOrigin, moduleDir: opts.moduleDir };

  const definition: ServiceDefinition = {
    serviceName: SERVICE_NAME,
    routes: [
      route({ method: "GET", path: "/health", handler: () => json({ ok: true }) }),
      route({ method: "*", path: MCP_HTTP_PATH, handler: (ctx) => handleMcp(ctx.req) }),
      ...OAUTH_PATHS.map((path) => route({ method: "*", path, handler: (ctx) => oauth(ctx.req) })),
      route({
        method: "GET",
        path: MODULE_JSON_PATH,
        handler: () => moduleJsonResponse(modulePackage),
      }),
      route({
        method: "GET",
        path: MODULE_ZIP_PATH,
        handler: () => portalZipResponse(modulePackage),
      }),
    ],
    fallback: (req, url) =>
      url.pathname.startsWith("/.well-known/") ? oauth(req) : json({ error: "not_found" }, 404),
  };

  const upgrades: Record<string, UpgradeHandler> = {
    [BRIDGE_WS_PATH]: {
      handle: (req, socket, head) => bridge.handleUpgrade(req, socket, head),
      // On shutdown the bridge closes with `serverShutdown` (1001), so the module redials
      // normally instead of guessing.
      close: () => bridge.close(),
    },
  };

  return { bridge, oauthProvider, definition, upgrades };
}

/** `createPortalServer` + bind on `opts.port` (`0` for an OS-assigned ephemeral port, as
 * tests do). Resolves once listening, with the actual bound port. */
export async function listen(
  opts: PortalServerOptions,
): Promise<PortalServerHandle & { port: number; service: Service }> {
  const { bridge, oauthProvider, definition, upgrades } = createPortalServer(opts);
  const service = createService({
    ...definition,
    port: opts.port,
    upgrades,
    handleShutdown: opts.handleShutdown ?? false,
  });
  const url = new URL(await service.ready());
  return {
    bridge,
    oauthProvider,
    service,
    port: Number(url.port),
    close: () => service.close(),
  };
}
