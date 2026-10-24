import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SETTING_BRIDGE_USER_ID } from "../constants";
import { BridgeHandlerError, dispatchQuery, registerHandlers } from "./index";
import { stubFoundry, teardownFoundry } from "./testSupport";
describe("dispatchQuery", () => {
  beforeEach(() => {
    stubFoundry(true);
  });

  afterEach(teardownFoundry);

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

  it("dispatchQuery rejects with a typed not-designated error when bridge-user-id doesn't match this session", async () => {
    stubFoundry(true, {
      userId: "gm1",
      settings: { [SETTING_BRIDGE_USER_ID]: "portal-bot" },
    });
    registerHandlers();
    const err = await dispatchQuery("portal.ping", undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("not-designated");
  });

  it("dispatchQuery dispatches normally when bridge-user-id matches this session", async () => {
    stubFoundry(true, {
      userId: "portal-bot",
      settings: { [SETTING_BRIDGE_USER_ID]: "portal-bot" },
    });
    registerHandlers();
    await expect(dispatchQuery("portal.ping", undefined)).resolves.toEqual({
      pong: true,
      worldId: "faerrin",
      system: "pf2e",
    });
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

describe("a method this module build never registered", () => {
  afterEach(teardownFoundry);

  it("a query for a tool an older module build never registered surfaces a typed error, never a hang", async () => {
    // Deliberately DON'T call registerHandlers() — simulates a 0.3.0 module whose
    // CONFIG.queries registry has never heard of "portal.query-item"/"portal.
    // query-rolls" at all (the server-0.4.0/module-0.3.0 deploy-window skew, D28-14).
    stubFoundry(true);
    const err = await dispatchQuery("portal.query-item", { name: "anything" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("foundry-error");
    expect((err as BridgeHandlerError).message).toContain("portal.query-item");
  });

  it("same for query-rolls", async () => {
    stubFoundry(true);
    const err = await dispatchQuery("portal.query-rolls", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeHandlerError);
    expect((err as BridgeHandlerError).code).toBe("foundry-error");
    expect((err as BridgeHandlerError).message).toContain("portal.query-rolls");
  });
});
