/**
 * The `CONFIG.queries` handler registry (Foundry 13's query-dispatch surface). The bridge
 * WS's `query` messages are routed to a `portal.<method>` key here. `registerHandlers()`
 * fills the registry once, on the `init` hook (before `ready` dials the bridge);
 * `dispatchQuery` is the one place that looks a method up and invokes it. `bridgeClient.ts`
 * takes it as its injected `dispatch` function, so every handler gets the same GM re-check
 * and error wrapping.
 *
 * The handlers live in one module per domain (`./compendium`, `./documents`, `./scenes`,
 * `./actors`, `./items`, `./macros`, `./party`, `./player`, `./rolls`); each exports a map
 * of its tools' handlers, and {@link TOOL_HANDLERS} assembles them. A large domain keeps
 * its handlers in that module and its sub-concerns beside it (`./player*`, `./item*`,
 * `./roll*`); write payloads are built in `./payloads`.
 */
import {
  BRIDGE_TOOL_NAMES,
  BridgeError,
  bridgeMethod,
  type BridgeToolHandlers,
} from "@astra/portal-shared";

import { MODULE_ID, SETTING_BRIDGE_USER_ID } from "../constants";
import { actorHandlers } from "./actors";
import { compendiumHandlers } from "./compendium";
import { documentHandlers } from "./documents";
import { itemHandlers } from "./items";
import { macroHandlers } from "./macros";
import { partyHandlers } from "./party";
import { playerHandlers } from "./player";
import { rollHandlers } from "./rolls";
import { sceneHandlers } from "./scenes";

export { BridgeError } from "@astra/portal-shared";

/** `CONFIG.queries["portal.<method>"]`'s key: the same wire method the server sends
 * (`bridgeMethod` in `@astra/portal-shared`). Its prefix equals {@link MODULE_ID}, which
 * `constants.test.ts` pins. */
function queryKey(method: string): string {
  return bridgeMethod(method);
}

/** The `ping` diagnostic: proves the bridge end to end. Every GM re-check happens in
 * {@link dispatchQuery}, not per handler, so this stays a plain data-returning function. */
function handlePing(): { pong: true; worldId: string; system: string } {
  return { pong: true, worldId: game.world.id, system: game.system.id };
}

/** Each domain module's handler map, in one list so a test can check they don't overlap. */
export const DOMAIN_HANDLERS = [
  compendiumHandlers,
  documentHandlers,
  sceneHandlers,
  actorHandlers,
  itemHandlers,
  macroHandlers,
  partyHandlers,
  playerHandlers,
  rollHandlers,
] as const;

/** The module's dispatch table, one handler per bridge tool in the shared registry
 * (`PORTAL_TOOLS` in `@astra/portal-shared`). Each domain map is checked with `satisfies
 * Partial<BridgeToolHandlers>`, so an unknown tool name or a wrongly typed handler is a
 * compile error there; this annotation makes a missing handler a compile error, so the
 * server's tool list and this table cannot drift. `registry.test.ts` checks that no tool
 * appears in two domain maps. */
export const TOOL_HANDLERS: BridgeToolHandlers = {
  ...compendiumHandlers,
  ...documentHandlers,
  ...sceneHandlers,
  ...actorHandlers,
  ...itemHandlers,
  ...macroHandlers,
  ...partyHandlers,
  ...playerHandlers,
  ...rollHandlers,
};

/** Reads the `bridge-user-id` setting forgivingly: trims whitespace and strips the
 * quotes Foundry's console prints around ids, which a GM copying an id tends to paste. */
export function normalizeUserId(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replaceAll(/^["'`]+|["'`]+$/g, "")
    .trim();
}

/** Registers every handler into `CONFIG.queries` under its wire method: each bridge tool
 * in {@link TOOL_HANDLERS}, plus the S3 `ping` diagnostic (not an MCP tool; nothing on
 * the server calls it today). Call once, on the `init` hook (Foundry's `CONFIG` global
 * exists by then, before `ready` dials the bridge). */
export function registerHandlers(): void {
  CONFIG.queries[queryKey("ping")] = handlePing;
  for (const name of BRIDGE_TOOL_NAMES) {
    CONFIG.queries[queryKey(name)] = TOOL_HANDLERS[name];
  }
}

/**
 * Looks up + invokes the handler for a fully-qualified method (e.g. `"portal.ping"`,
 * already carrying the `portal.` prefix as it arrives over the wire — see
 * `McpQuery.method` in `@astra/portal-shared`). Re-checks `game.user?.isGM` as defense
 * in depth: the `ready` hook already refuses to DIAL the bridge at all for a non-GM
 * session, but this is the last line of defense against a session that started as GM
 * and was demoted while its socket stayed open. Also re-checks the
 * designated-dialer setting for the same reason — the GM may repoint `bridge-user-id`
 * on an already-adopted socket without an F5.
 *
 * Throws {@link BridgeError} (typed `.code`) for both denial paths; any error a
 * handler itself throws propagates as-is — `bridgeClient.ts` falls back to
 * `foundry-error` for anything that isn't already a `BridgeError`.
 */
export async function dispatchQuery(method: string, params: unknown): Promise<unknown> {
  if (!game.user?.isGM) {
    throw new BridgeError("not-gm", "the connected Foundry session isn't a GM");
  }
  const bridgeUserId = normalizeUserId(game.settings.get(MODULE_ID, SETTING_BRIDGE_USER_ID));
  if (bridgeUserId && game.user.id !== bridgeUserId) {
    throw new BridgeError(
      "not-designated",
      "this Foundry session is not the designated bridge dialer (bridge-user-id)",
    );
  }
  const handler = CONFIG.queries[method];
  if (!handler) {
    throw new BridgeError("foundry-error", `no handler registered for query "${method}"`);
  }
  return await handler(params);
}
