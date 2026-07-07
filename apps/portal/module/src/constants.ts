/**
 * portal-module identity constants — the Foundry package id/compatibility floor
 * (spec 0023 D2/D11). `module/module.json` (S3) and the eventual runtime-rendered
 * install manifest (`GET /module/module.json`, S6) both need to agree on these, so
 * they're pulled from one literal rather than duplicated across JSON + TS.
 */

/** The Foundry package id — `modules/<MODULE_ID>/` once installed. */
export const MODULE_ID = "portal";

export const MODULE_TITLE = "Portal (astra MCP bridge)";

/** Foundry major-version floor this module is verified against (D2). */
export const COMPATIBILITY_MINIMUM = "13";

// --- game.settings.register() keys (S3) — registered on the `init` hook in main.ts,
// read on the `ready` hook to decide whether/how to dial the bridge. All world-scoped
// + GM-restricted: the GM pastes these once per world, every client shares them. ---

/** `wss://<portal public-origin>/ws` — the bridge WS URL the module dials. Empty by
 * default; an empty value means "not configured yet", not a real endpoint. */
export const SETTING_WS_URL = "ws-url";

/** The D6 module->server handshake secret (`cfg.portal.bridgeApiKey` on the server). */
export const SETTING_BRIDGE_API_KEY = "bridge-api-key";

/** D8: creates ON by default. S3 only registers this setting; S5's write tools read
 * it as one of the three write-gate checks (isGM AND bridge-key AND this setting). */
export const SETTING_ALLOW_WRITES = "allow-write-operations";
