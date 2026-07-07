import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./handlers";

/** Stubs the ambient Foundry globals `handlers.ts` touches (`game`, `CONFIG`) — S3 is
 * Foundry-free, so this is a plain object, not a real Foundry runtime. */
function stubFoundry(isGM: boolean): void {
  globalThis.game = {
    user: { isGM },
    world: { id: "faerrin", title: "Faerrin" },
    system: { id: "pf2e", version: "7.12.2" },
    version: "13.351",
    settings: {
      register: () => {},
      get: () => undefined,
    },
  };
  globalThis.CONFIG = { queries: {} };
}

describe("portal-module handlers (spec 0023 S3 — Foundry-free)", () => {
  beforeEach(() => {
    stubFoundry(true);
  });

  afterEach(() => {
    // @ts-expect-error — tearing down the stub between tests, not a real Foundry global.
    delete globalThis.game;
    // @ts-expect-error — same.
    delete globalThis.CONFIG;
  });

  it("registers portal.ping into CONFIG.queries", () => {
    registerHandlers();
    expect(typeof CONFIG.queries["portal.ping"]).toBe("function");
  });

  it("dispatchQuery invokes the registered handler and returns its result", async () => {
    registerHandlers();
    await expect(dispatchQuery("portal.ping", undefined)).resolves.toEqual({
      pong: true,
      worldId: "faerrin",
      system: "pf2e",
    });
  });

  it("dispatchQuery rejects with a typed not-gm error when the session isn't a GM", async () => {
    stubFoundry(false);
    registerHandlers();
    const err = await dispatchQuery("portal.ping", undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("not-gm");
  });

  it("dispatchQuery rejects with a typed foundry-error for an unregistered method", async () => {
    // Deliberately skip registerHandlers() — CONFIG.queries stays empty.
    const err = await dispatchQuery("portal.no-such-method", undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("foundry-error");
  });

  it("propagates a handler's own thrown error unwrapped (bridgeClient.ts wraps it)", async () => {
    CONFIG.queries["portal.boom"] = () => {
      throw new Error("handler exploded");
    };
    await expect(dispatchQuery("portal.boom", undefined)).rejects.toThrow("handler exploded");
  });
});
