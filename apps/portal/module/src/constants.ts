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

/** 0027 D27-2/D27-9: the designated-dialer gate. Empty (default) = any GM session may
 * dial the bridge (today's behavior); set = only the matching `game.user.id` ever
 * dials, so a human GM's tab and a permanently-connected headless session never fight
 * over the single bridge socket. */
export const SETTING_BRIDGE_USER_ID = "bridge-user-id";

/** D8: creates ON by default. S3 only registers this setting; S5's write tools read
 * it as one of the three write-gate checks (isGM AND bridge-key AND this setting). */
export const SETTING_ALLOW_WRITES = "allow-write-operations";

/** 0026 D-9: execute-macro is arbitrary GM-privileged JS by construction — this
 * setting lets the GM kill just THAT capability without disabling every other write
 * (`allow-write-operations` stays a separate switch). Default ON, matching D8's
 * creates-ON philosophy. `handlers.ts`'s `handleExecuteMacro` checks it in addition
 * to, not instead of, `writeGate`. */
export const SETTING_ALLOW_MACRO_EXECUTION = "allow-macro-execution";
