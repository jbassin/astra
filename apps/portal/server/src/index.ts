/**
 * portal-server entrypoint (spec 0023 S2) — the MCP+WS server for the live FoundryVTT
 * "Faerrin" world. Wires telemetry first (principle #1 / [[telemetry-built-in]]), then
 * config, then binds the HTTP server (`/health`, the Streamable-HTTP `/mcp`, the bridge
 * WS at `/ws`). No Discord-style "optional" degraded mode (contrast orator-backend):
 * both SOPS keys are load-bearing per D6, so a missing key fails startup loudly rather
 * than serving with auth effectively disabled.
 */
import { getLogger, initTelemetry } from "@astra/observe";

import { SERVICE_NAME } from "./constants";

// Telemetry before anything that emits — traces/metrics/logs → SigNoz.
const telemetry = initTelemetry(SERVICE_NAME);
const log = getLogger(SERVICE_NAME);

import { fileURLToPath } from "node:url";

import type { SecretRef } from "@astra/config";
import { loadConfig } from "@astra/config";

import { listen } from "./server";

// The Foundry module's build output (S6/D11) — `apps/portal/module/{module.json,
// dist/main.js}`, a sibling of `apps/portal/server`. Resolved relative to THIS
// file's own location (not `process.cwd()`), so it works identically in both
// environments: locally `src/index.ts` lives at `apps/portal/server/src/`, so
// `../../module` walks up to `apps/portal/` then into `module/`; the S6 Dockerfile
// copies `apps/portal/module` (module.json + the built dist/) to the same relative
// path alongside `apps/portal/server` in the image, so the same relative walk
// resolves there too — no container-vs-local branch needed.
const MODULE_DIR = fileURLToPath(new URL("../../module", import.meta.url));

/** Resolve a SOPS `ref=` secret; throws with a clear pointer back to config.kdl if
 * unresolved — unlike orator's optional Discord token, portal's two D6 keys are
 * load-bearing (no world dial-out / no MCP client can authenticate without them). */
function requireSecret(ref: SecretRef | null | undefined, field: string): string {
  const value = ref?.resolve();
  if (!value) {
    throw new Error(
      `cfg.portal.${field} is unresolved — set portal.${field} ref= in config.kdl's ` +
        "portal {} block (and provision the SOPS key / env override)",
    );
  }
  return value;
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  await listen({
    port: cfg.portal.port,
    mcpApiKey: requireSecret(cfg.portal.mcpApiKey, "mcpApiKey"),
    playerMcpApiKey: requireSecret(cfg.portal.playerMcpApiKey, "playerMcpApiKey"),
    bridgeApiKey: requireSecret(cfg.portal.bridgeApiKey, "bridgeApiKey"),
    bridgeTimeoutMs: cfg.portal.bridgeTimeoutMs,
    maxCreatesPerRequest: cfg.portal.maxCreatesPerRequest,
    publicOrigin: cfg.portal.publicOrigin,
    moduleDir: MODULE_DIR,
    // Spec 0025 D-2 — the bind-mounted OAuth state file (registered clients +
    // hashed tokens); D-1 reuses the mcpApiKey resolved above as the consent
    // password, threaded through inside `createPortalServer` (no new SOPS key).
    oauthStatePath: cfg.portal.oauthStatePath,
  });
}

main().catch((e) => {
  log.emit({ severityText: "FATAL", body: `astra.portal failed to start: ${e}` });
  process.exit(1);
});

// Flush buffered spans/metrics/logs before the container stops (compose SIGTERM).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    void telemetry.shutdown().finally(() => process.exit(0));
  });
}
