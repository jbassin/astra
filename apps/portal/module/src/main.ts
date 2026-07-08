/**
 * @astra/portal-module entry point (spec 0023 S3) — bundled by tsdown into the single
 * `dist/main.js` esmodule `module.json` declares (`esmodules: ["dist/main.js"]`, no
 * externals: Foundry's browser `import()`s this file directly, no `node_modules`
 * alongside it).
 *
 * Two hooks:
 *  - `init` — register the three world-scoped, GM-restricted settings (D8: writes ON
 *    by default) + the `CONFIG.queries` handler registry (`handlers.ts`).
 *  - `ready` — the hard GM gate (non-GM sessions never dial the bridge at all — the
 *    module setting alone isn't a security boundary, this is), then read the settings
 *    and start the {@link BridgeClient} if both are configured.
 */
import { BridgeClient } from "./bridgeClient";
import {
  MODULE_ID,
  SETTING_ALLOW_MACRO_EXECUTION,
  SETTING_ALLOW_WRITES,
  SETTING_BRIDGE_API_KEY,
  SETTING_WS_URL,
} from "./constants";
import { dispatchQuery, registerHandlers } from "./handlers";

function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTING_WS_URL, {
    name: "Portal bridge WebSocket URL",
    hint: 'The astra portal server\'s bridge endpoint, e.g. "wss://portal.iridi.cc/ws".',
    scope: "world",
    config: true,
    type: String,
    default: "",
    restricted: true,
  });
  game.settings.register(MODULE_ID, SETTING_BRIDGE_API_KEY, {
    name: "Portal bridge API key",
    hint: "Must match the bridge-api-key configured on the portal server (D6 two-hop auth).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    restricted: true,
  });
  game.settings.register(MODULE_ID, SETTING_ALLOW_WRITES, {
    name: "Allow write operations",
    hint:
      "Let a connected MCP client create tokens/items/journals in this world. On by " +
      "default (D8) — reads are always allowed regardless of this setting.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
  });
  game.settings.register(MODULE_ID, SETTING_ALLOW_MACRO_EXECUTION, {
    name: "Allow macro execution",
    hint:
      "Let a connected MCP client run existing macros immediately, as the GM (0026 D-9) — " +
      "a script macro is arbitrary GM-privileged JavaScript. On by default; switch off to block " +
      'ONLY execution (creating/editing macros via "Allow write operations" is unaffected).',
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
  });
}

function consoleLog(level: "info" | "warn" | "error", message: string): void {
  const line = `[${MODULE_ID}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

Hooks.once("init", () => {
  registerSettings();
  registerHandlers();
});

Hooks.once("ready", () => {
  // The hard liveness/security gate (spec 0023 module section): a non-GM session
  // never dials the bridge at all, full stop — the settings above are configured by
  // (and only visible to) the GM, but this is the actual boundary.
  if (!game.user?.isGM) return;

  const wsUrl = String(game.settings.get(MODULE_ID, SETTING_WS_URL) ?? "");
  const apiKey = String(game.settings.get(MODULE_ID, SETTING_BRIDGE_API_KEY) ?? "");
  if (!wsUrl || !apiKey) {
    consoleLog(
      "warn",
      'not dialing the bridge — set both the "Portal bridge WebSocket URL" and ' +
        '"Portal bridge API key" settings (Configure Settings > Module Settings) first.',
    );
    return;
  }

  const client = new BridgeClient({
    wsUrl,
    apiKey,
    meta: () => ({
      worldId: game.world.id,
      world: game.world.title,
      system: game.system.id,
      systemVersion: game.system.version,
      foundryVersion: game.version,
    }),
    dispatch: dispatchQuery,
    createWebSocket: (url) => new WebSocket(url),
    log: consoleLog,
  });
  client.start();
});
