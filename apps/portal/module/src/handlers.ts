/**
 * The `CONFIG.queries` handler registry (Foundry 13's query-dispatch surface) — the
 * bridge WS's `query` messages are routed to a `portal.<method>` key here, per spec
 * 0023's module section. `registerHandlers()` populates the registry once, on the
 * `init` hook (before `ready` dials the bridge); `dispatchQuery` is the ONE place that
 * looks a method up and invokes it — `bridgeClient.ts` takes it as its injected
 * `dispatch` function, so every handler (this S3 slice's `portal.ping`, and S4/S5's
 * read/write tools) gets the same GM re-check + error wrapping for free.
 */
import type { BridgeErrorCode } from "@astra/portal-shared";

import { MODULE_ID } from "./constants";

/** Thrown by {@link dispatchQuery}; `bridgeClient.ts` maps `.code` onto the wire
 * `McpResponse.error.code` verbatim (falling back to `foundry-error` for anything that
 * ISN'T a `BridgeHandlerError` — a handler that throws a bare `Error`, say). */
export class BridgeHandlerError extends Error {
  readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.name = "BridgeHandlerError";
    this.code = code;
  }
}

/** `CONFIG.queries["portal.<method>"]`'s key, matching how the server addresses a
 * query (`bridge.sendQuery("portal.ping")` on the server side — see `mcp.ts`/`bridge.ts`). */
function queryKey(method: string): string {
  return `${MODULE_ID}.${method}`;
}

/** S3's one handler — proves the bridge end-to-end (spec 0023 S3 acceptance). Every
 * GM re-check happens in {@link dispatchQuery}, not per-handler, so this stays a plain
 * data-returning function. */
function handlePing(): { pong: true; worldId: string; system: string } {
  return { pong: true, worldId: game.world.id, system: game.system.id };
}

/** Registers every handler this module build knows about into `CONFIG.queries`. Call
 * once, on the `init` hook (Foundry's `CONFIG` global exists by then, before `ready`
 * dials the bridge). S4/S5 add more `CONFIG.queries[queryKey(...)] = ...` lines here —
 * same registry, same dispatch path, no change to `bridgeClient.ts`. */
export function registerHandlers(): void {
  CONFIG.queries[queryKey("ping")] = handlePing;
}

/**
 * Looks up + invokes the handler for a fully-qualified method (e.g. `"portal.ping"`,
 * already carrying the `portal.` prefix as it arrives over the wire — see
 * `McpQuery.method` in `@astra/portal-shared`). Re-checks `game.user?.isGM` as defense
 * in depth: the `ready` hook already refuses to DIAL the bridge at all for a non-GM
 * session, but this is the last line of defense against a session that started as GM
 * and was demoted while its socket stayed open.
 *
 * Throws {@link BridgeHandlerError} (typed `.code`) for both denial paths; any error a
 * handler itself throws propagates as-is — `bridgeClient.ts` falls back to
 * `foundry-error` for anything that isn't already a `BridgeHandlerError`.
 */
export async function dispatchQuery(method: string, params: unknown): Promise<unknown> {
  if (!game.user?.isGM) {
    throw new BridgeHandlerError("not-gm", "the connected Foundry session isn't a GM");
  }
  const handler = CONFIG.queries[method];
  if (!handler) {
    throw new BridgeHandlerError("foundry-error", `no handler registered for query "${method}"`);
  }
  return await handler(params);
}
