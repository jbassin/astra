import { describe, expect, it } from "vitest";

import {
  AuthMsg,
  BridgeErrorCode,
  BridgeMessage,
  McpQuery,
  McpResponse,
  PingMsg,
  PongMsg,
} from "./envelope";

describe("portal-shared bridge envelope", () => {
  it("round-trips an auth handshake", () => {
    const msg = { type: "auth", apiKey: "secret-key" };
    expect(AuthMsg.parse(msg)).toEqual(msg);
    expect(BridgeMessage.parse(msg)).toEqual(msg);
  });

  it("round-trips an auth handshake carrying the S3 world/system meta", () => {
    const msg = {
      type: "auth",
      apiKey: "secret-key",
      meta: {
        worldId: "faerrin",
        world: "Faerrin",
        system: "pf2e",
        systemVersion: "7.12.2",
        foundryVersion: "13.351",
      },
    };
    expect(AuthMsg.parse(msg)).toEqual(msg);
    expect(BridgeMessage.parse(msg)).toEqual(msg);
  });

  it("accepts an auth handshake with a partial meta object", () => {
    const msg = { type: "auth", apiKey: "secret-key", meta: { worldId: "faerrin" } };
    expect(AuthMsg.parse(msg)).toEqual(msg);
  });

  it("rejects extra properties on the strict meta object", () => {
    expect(() =>
      AuthMsg.parse({ type: "auth", apiKey: "k", meta: { worldId: "x", bogus: true } }),
    ).toThrow();
  });

  it("round-trips ping/pong", () => {
    expect(PingMsg.parse({ type: "ping" })).toEqual({ type: "ping" });
    expect(PongMsg.parse({ type: "pong" })).toEqual({ type: "pong" });
    expect(BridgeMessage.parse({ type: "ping" })).toEqual({ type: "ping" });
    expect(BridgeMessage.parse({ type: "pong" })).toEqual({ type: "pong" });
  });

  it("round-trips an McpQuery", () => {
    const q = { type: "query", id: "abc-1", method: "portal.ping", params: { foo: "bar" } };
    expect(McpQuery.parse(q)).toEqual(q);
    expect(BridgeMessage.parse(q)).toEqual(q);
  });

  it("round-trips a successful McpResponse", () => {
    const r = { type: "response", id: "abc-1", ok: true, result: { pong: true } };
    expect(McpResponse.parse(r)).toEqual(r);
    expect(BridgeMessage.parse(r)).toEqual(r);
  });

  it("round-trips a failed McpResponse with a typed error code", () => {
    const r = {
      type: "response",
      id: "abc-1",
      ok: false,
      error: { code: "bridge-offline", message: "no module connected" },
    };
    expect(McpResponse.parse(r)).toEqual(r);
    expect(BridgeMessage.parse(r)).toEqual(r);
  });

  it("exposes every documented error code", () => {
    expect([...BridgeErrorCode.options].sort()).toEqual(
      [
        "bridge-offline",
        "unauthorized",
        "not-gm",
        "writes-disabled",
        "cap-exceeded",
        "timeout",
        "foundry-error",
      ].sort(),
    );
  });

  it("rejects an unknown discriminator", () => {
    expect(() => BridgeMessage.parse({ type: "bogus" })).toThrow();
  });

  it("rejects a query missing its correlation id", () => {
    expect(() => McpQuery.parse({ type: "query", method: "portal.ping" })).toThrow();
  });

  it("rejects an unrecognized error code", () => {
    expect(() =>
      McpResponse.parse({
        type: "response",
        id: "x",
        ok: false,
        error: { code: "totally-made-up", message: "nope" },
      }),
    ).toThrow();
  });

  it("rejects extra properties on a strict envelope", () => {
    expect(() => AuthMsg.parse({ type: "auth", apiKey: "k", extra: true })).toThrow();
  });
});
