/**
 * portal-server entrypoint — the MCP+WS server for the live FoundryVTT
 * "Faerrin" world. Telemetry (traces, metrics, logs, HTTP spans, the SIGTERM flush) is
 * already installed by `node --import @astra/observe/register`; this reads config, then
 * binds the service (`/health`, `/healthz`, the Streamable-HTTP `/mcp`, the bridge WS at
 * `/ws`). No Discord-style "optional" degraded mode (contrast orator-backend): both SOPS
 * keys (the MCP bearer and the bridge secret) are load-bearing, so a missing key fails
 * startup loudly rather than serving with auth effectively disabled.
 */
import { join } from "node:path";

import { findPackageRoot, loadConfig } from "@astra/config";
import { exitAfterFlush, logger } from "@astra/observe";

import { SERVICE_NAME } from "./constants";
import { listen } from "./server";

const log = logger(SERVICE_NAME);

// The Foundry module's build output, served for install by Manifest URL —
// `apps/portal/module/{module.json,dist/main.js}`, a sibling of `apps/portal/server`. Resolved from this package's root
// (not `process.cwd()`, and not `import.meta.dirname`, which is `src/` under vitest and
// `dist-server/` in the image), so it works the same in both: the Dockerfile's `portal`
// target copies `apps/portal/module` (module.json + the built dist/) beside
// `apps/portal/server` in the image.
const MODULE_DIR = join(findPackageRoot(import.meta.dirname), "..", "module");

async function main(): Promise<void> {
  const cfg = loadConfig();
  // Portal's keys are load-bearing (no world dial-out / no MCP client can authenticate
  // without them): `require()` refuses to start on an unset or blank one.
  const { mcpApiKey, playerMcpApiKey, bridgeApiKey } = cfg.portal;
  if (!mcpApiKey || !playerMcpApiKey || !bridgeApiKey) {
    throw new Error(
      "portal.mcp-api-key, player-mcp-api-key and bridge-api-key each need a ref= in " +
        "config.kdl's portal {} block",
    );
  }

  // On compose SIGTERM the kit's shutdown stops accepting, closes the bridge socket with
  // the shutdown close code (the module then redials normally), and drains; register then
  // flushes telemetry and exits.
  await listen({
    port: cfg.portal.port,
    mcpApiKey: mcpApiKey.require(),
    playerMcpApiKey: playerMcpApiKey.require(),
    bridgeApiKey: bridgeApiKey.require(),
    bridgeTimeoutMs: cfg.portal.bridgeTimeoutMs,
    bridgeUserId: cfg.portal.bridgeUserId,
    maxCreatesPerRequest: cfg.portal.maxCreatesPerRequest,
    publicOrigin: cfg.portal.publicOrigin,
    moduleDir: MODULE_DIR,
    // The bind-mounted OAuth state file (registered clients + hashed tokens), so
    // claude.ai stays connected across a restart. The consent password is the
    // mcpApiKey resolved above, threaded through inside `createPortalServer`, so
    // OAuth needs no new SOPS key.
    oauthStatePath: cfg.portal.oauthStatePath,
    handleShutdown: true,
  });
}

main().catch((e) => {
  log.fatal(`astra.portal failed to start: ${e}`);
  void exitAfterFlush(1);
});
