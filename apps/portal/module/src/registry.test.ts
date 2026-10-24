/**
 * The module side of the tool registry agreement: the module answers exactly the
 * bridge tools in `PORTAL_TOOLS`, under the wire method the server sends
 * (`bridgeMethod`). The server side (`server/src/registry.test.ts`) proves the server
 * registers every registry tool and sends that same method for each bridge tool.
 */
import {
  BRIDGE_TOOL_NAMES,
  bridgeMethod,
  type BridgeToolHandlers,
  PORTAL_TOOL_NAMES,
  PORTAL_TOOLS,
} from "@astra/portal-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DOMAIN_HANDLERS, registerHandlers, TOOL_HANDLERS } from "./handlers";

describe("the module dispatch table agrees with the tool registry", () => {
  beforeEach(() => {
    globalThis.CONFIG = { queries: {} };
  });

  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.CONFIG;
  });

  it("has one handler per bridge tool and nothing else", () => {
    expect(Object.keys(TOOL_HANDLERS).sort()).toEqual([...BRIDGE_TOOL_NAMES].sort());
    for (const name of PORTAL_TOOL_NAMES) {
      expect(name in TOOL_HANDLERS).toBe(PORTAL_TOOLS[name].runsOn === "bridge");
    }
  });

  it("assembles the table from domain maps that never claim the same tool twice", () => {
    const claimed = DOMAIN_HANDLERS.flatMap((map) => Object.keys(map));
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual(Object.keys(TOOL_HANDLERS).sort());
  });

  it("registers every bridge tool under its wire method, plus the ping diagnostic", () => {
    registerHandlers();
    const expected = [...BRIDGE_TOOL_NAMES.map((name) => bridgeMethod(name)), "portal.ping"];
    expect(Object.keys(CONFIG.queries).sort()).toEqual(expected.sort());
    for (const name of BRIDGE_TOOL_NAMES) {
      expect(CONFIG.queries[bridgeMethod(name)]).toBe(TOOL_HANDLERS[name]);
    }
  });

  it("rejects a dispatch table with a missing handler at compile time", () => {
    const { "execute-macro": _dropped, ...partial } = TOOL_HANDLERS;
    // @ts-expect-error — execute-macro has no handler, so this is not a BridgeToolHandlers.
    const incomplete: BridgeToolHandlers = partial;
    expect(Object.keys(incomplete)).not.toContain("execute-macro");
  });
});
