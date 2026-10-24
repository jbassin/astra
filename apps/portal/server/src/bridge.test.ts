import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  BRIDGE_PROTOCOL,
  BridgeCloseCode,
  PORTAL_VERSION,
  type AuthMeta,
  type McpQuery,
} from "@astra/portal-shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { Bridge } from "./bridge";

const BRIDGE_API_KEY = "test-bridge-key";

function startServer(bridge: Bridge): Promise<{ server: HttpServer; url: string }> {
  const server = createServer();
  bridge.attach(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `ws://127.0.0.1:${port}/ws` });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.once("close", (code: number) => resolve(code));
  });
}

function waitForCloseWithReason(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.once("close", (code: number, reason: Buffer) =>
      resolve({ code, reason: reason.toString() }),
    );
  });
}

/** A fake Foundry module: dials the bridge, completes the D6 handshake, and answers
 * whatever `query` messages a test tells it to (or none, to exercise the timeout path). */
class FakeModule {
  readonly ws: WebSocket;
  readonly received: unknown[] = [];
  readonly #opened: Promise<void>;
  #onQuery?: (msg: McpQuery) => void;

  /** `protocol: null` sends the legacy (0.4.x) handshake with no protocol fields. */
  constructor(
    url: string,
    apiKey = BRIDGE_API_KEY,
    meta?: AuthMeta,
    protocol: number | null = BRIDGE_PROTOCOL,
  ) {
    this.ws = new WebSocket(url);
    const versioned = protocol === null ? {} : { protocol, moduleVersion: PORTAL_VERSION };
    this.#opened = new Promise((resolve) => {
      this.ws.once("open", () => {
        this.ws.send(JSON.stringify({ type: "auth", apiKey, ...versioned, meta }));
        resolve();
      });
    });
    this.ws.on("message", (data) => {
      const msg: unknown = JSON.parse(data.toString());
      this.received.push(msg);
      if ((msg as { type?: string }).type === "query") this.#onQuery?.(msg as McpQuery);
    });
  }

  async ready(): Promise<void> {
    await this.#opened;
    await sleep(50); // let the server process the auth handshake before a test proceeds
  }

  onQuery(handler: (msg: McpQuery) => void): void {
    this.#onQuery = handler;
  }

  respond(id: string, result: unknown): void {
    this.ws.send(JSON.stringify({ type: "response", id, ok: true, result }));
  }

  /** Sends an error `response` with an ARBITRARY `code` string — including one
   * outside the closed `BridgeErrorCode` enum, for the D28-14 skew test below. A
   * real module would never construct this deliberately; it's the shape a
   * pre-rollback server sees from a 0.4.0+ module returning an additive error
   * code the server doesn't know yet. */
  respondErrorRaw(id: string, code: string, message: string): void {
    this.ws.send(JSON.stringify({ type: "response", id, ok: false, error: { code, message } }));
  }

  close(): void {
    this.ws.close();
  }
}

describe("Bridge (spec 0023 S2 — Foundry-free)", () => {
  let bridge: Bridge;
  let server: HttpServer;
  let url: string;

  beforeEach(async () => {
    bridge = new Bridge({
      bridgeApiKey: BRIDGE_API_KEY,
      queryTimeoutMs: 250,
      authWindowMs: 250,
      heartbeatIntervalMs: 60_000, // effectively off — heartbeat behavior isn't this file's concern
    });
    ({ server, url } = await startServer(bridge));
  });

  afterEach(async () => {
    bridge.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("reports offline with no module connected (bridge-status has nothing to show yet)", () => {
    expect(bridge.getStatus()).toEqual({ connected: false });
  });

  it("rejects sendQuery immediately with a typed bridge-offline error when nothing is connected", async () => {
    await expect(bridge.sendQuery("portal.ping")).rejects.toMatchObject({ code: "bridge-offline" });
  });

  it("authenticates a module over a real WS connection and round-trips a query", async () => {
    const mod = new FakeModule(url);
    await mod.ready();
    expect(bridge.getStatus()).toEqual({ connected: true });

    mod.onQuery((q) => mod.respond(q.id, { pong: true }));
    await expect(bridge.sendQuery("portal.ping")).resolves.toEqual({ pong: true });
    mod.close();
  });

  it("carries the S3 auth meta (world/system/version) onto the status snapshot", async () => {
    const meta: AuthMeta = {
      worldId: "faerrin",
      world: "Faerrin",
      system: "pf2e",
      systemVersion: "7.12.2",
      foundryVersion: "13.351",
    };
    const mod = new FakeModule(url, BRIDGE_API_KEY, meta);
    await mod.ready();
    expect(bridge.getStatus()).toEqual({ connected: true, ...meta });
    mod.close();
  });

  it("carries the 0027 D27-8 userId/userName identity onto the status snapshot", async () => {
    const meta: AuthMeta = {
      worldId: "faerrin",
      world: "Faerrin",
      userId: "user1",
      userName: "Portal",
    };
    const mod = new FakeModule(url, BRIDGE_API_KEY, meta);
    await mod.ready();
    expect(bridge.getStatus()).toEqual({ connected: true, ...meta });
    mod.close();
  });

  it("clears the meta snapshot once the module disconnects", async () => {
    const mod = new FakeModule(url, BRIDGE_API_KEY, { worldId: "faerrin" });
    await mod.ready();
    expect(bridge.getStatus()).toMatchObject({ worldId: "faerrin" });

    mod.close();
    await sleep(50); // let the server-side "close" handler run
    expect(bridge.getStatus()).toEqual({ connected: false });
  });

  it("authenticates cleanly with no meta at all (pre-S3 module build)", async () => {
    const mod = new FakeModule(url);
    await mod.ready();
    expect(bridge.getStatus()).toEqual({ connected: true });
    mod.close();
  });

  it("rejects the wrong bridge key with the unauthorized close, never adopting the socket", async () => {
    const mod = new FakeModule(url, "wrong-key");
    const code = await waitForClose(mod.ws);
    expect(code).toBe(BridgeCloseCode.unauthorized);
    expect(bridge.getStatus()).toEqual({ connected: false });
  });

  it("closes an unauthenticated socket once the auth window elapses", async () => {
    const ws = new WebSocket(url);
    await new Promise((resolve) => ws.once("open", resolve));
    const code = await waitForClose(ws);
    expect(code).toBe(BridgeCloseCode.authTimeout);
    expect(bridge.getStatus()).toEqual({ connected: false });
  });

  it("rejects a pending query with a typed timeout when the module never answers", async () => {
    const mod = new FakeModule(url);
    await mod.ready();
    // Deliberately no onQuery handler — the fake module stays silent.
    await expect(bridge.sendQuery("portal.search-compendium")).rejects.toMatchObject({
      code: "timeout",
    });
    mod.close();
  });

  it("rejects every pending query with bridge-offline when the module disconnects mid-flight", async () => {
    const mod = new FakeModule(url);
    await mod.ready();
    // Never answer; instead, drop the connection out from under the pending query.
    const pending = bridge.sendQuery("portal.ping");
    await sleep(20);
    mod.close();
    await expect(pending).rejects.toMatchObject({ code: "bridge-offline" });
  });

  it("replaces a stale connection when a second socket authenticates (GM tab reload, D-choice)", async () => {
    const first = new FakeModule(url);
    await first.ready();
    expect(bridge.getStatus()).toEqual({ connected: true });

    const firstClosed = waitForClose(first.ws);
    const second = new FakeModule(url);
    await second.ready();

    await firstClosed; // the stale socket is torn down, not left dangling
    expect(bridge.getStatus()).toEqual({ connected: true });

    second.onQuery((q) => second.respond(q.id, { from: "second" }));
    await expect(bridge.sendQuery("portal.ping")).resolves.toEqual({ from: "second" });
    second.close();
  });

  it("D28-14: maps a well-formed response envelope with an unknown error code to a typed foundry-error, never a silent drop-to-timeout", async () => {
    const mod = new FakeModule(url);
    await mod.ready();
    mod.onQuery((q) => {
      // A code this build's BridgeErrorCode enum has never heard of — the exact
      // shape a 0.4.0+ module sends a rolled-back pre-0028 server (spec Risks'
      // "rollback symmetry" scenario).
      mod.respondErrorRaw(q.id, "some-future-code-this-server-does-not-know", "future skew");
    });
    // queryTimeoutMs is 250 in this describe block's beforeEach — if the fix
    // regressed back to a silent drop, this assertion would fail with a `timeout`
    // code instead (after the full 250ms), not resolve promptly as `foundry-error`.
    await expect(bridge.sendQuery("portal.query-item")).rejects.toMatchObject({
      code: "foundry-error",
      message: "future skew",
    });
    mod.close();
  });

  it("D28-14: a genuinely unparseable message still falls through to the normal drop (no false-positive recovery)", async () => {
    const mod = new FakeModule(url);
    await mod.ready();
    // Not even valid JSON — must NOT be mistaken for a recoverable skewed response.
    mod.ws.send("this is not json");
    // The bridge only ever exposes this by NOT resolving/rejecting anything — prove
    // it via a real pending query that still times out normally afterward.
    await expect(bridge.sendQuery("portal.ping")).rejects.toMatchObject({ code: "timeout" });
    mod.close();
  });
});

describe("Bridge versioned handshake, designation and replacement (svc-2)", () => {
  const started: Array<{ bridge: Bridge; server: HttpServer }> = [];

  async function start(
    opts: { bridgeUserId?: string; minProtocol?: number } = {},
  ): Promise<{ bridge: Bridge; url: string }> {
    const bridge = new Bridge({
      bridgeApiKey: BRIDGE_API_KEY,
      queryTimeoutMs: 5_000, // long, so a prompt rejection proves it wasn't the timeout
      authWindowMs: 250,
      heartbeatIntervalMs: 60_000,
      ...opts,
    });
    const { server, url } = await startServer(bridge);
    started.push({ bridge, server });
    return { bridge, url };
  }

  afterEach(async () => {
    for (const { bridge, server } of started.splice(0)) {
      bridge.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("acknowledges a versioned handshake with auth-ok carrying the server's protocol and version", async () => {
    const { url } = await start();
    const mod = new FakeModule(url);
    await mod.ready();
    expect(mod.received).toContainEqual({
      type: "auth-ok",
      protocol: BRIDGE_PROTOCOL,
      serverVersion: PORTAL_VERSION,
    });
    mod.close();
  });

  it("accepts a legacy (0.4.x, no protocol) handshake during the rollout and sends it no auth-ok", async () => {
    const { bridge, url } = await start();
    const mod = new FakeModule(url, BRIDGE_API_KEY, undefined, null);
    await mod.ready();
    expect(bridge.getStatus()).toEqual({ connected: true });
    expect(mod.received).toEqual([]);
    mod.onQuery((q) => mod.respond(q.id, { legacy: true }));
    await expect(bridge.sendQuery("portal.ping")).resolves.toEqual({ legacy: true });
    mod.close();
  });

  it("closes a module older than the minimum protocol as module-stale and never adopts it", async () => {
    const { bridge, url } = await start({ minProtocol: 1 });
    const mod = new FakeModule(url, BRIDGE_API_KEY, undefined, null);
    const closed = await waitForCloseWithReason(mod.ws);
    expect(closed).toEqual({ code: BridgeCloseCode.protocolMismatch, reason: "module-stale" });
    expect(bridge.getStatus()).toEqual({ connected: false });
    await expect(bridge.sendQuery("portal.ping")).rejects.toMatchObject({ code: "bridge-offline" });
  });

  it("reports a newer protocol as server-stale even when the rest of the handshake is unparseable", async () => {
    const { url } = await start();
    const ws = new WebSocket(url);
    ws.once("open", () => {
      // A future handshake shape: no apiKey field this build knows.
      ws.send(JSON.stringify({ type: "auth", protocol: BRIDGE_PROTOCOL + 1, credential: "x" }));
    });
    const closed = await waitForCloseWithReason(ws);
    expect(closed).toEqual({ code: BridgeCloseCode.protocolMismatch, reason: "server-stale" });
  });

  it("closes a message that isn't an auth handshake with the unauthorized code", async () => {
    const { url } = await start();
    const ws = new WebSocket(url);
    ws.once("open", () => ws.send(JSON.stringify({ type: "ping" })));
    const closed = await waitForCloseWithReason(ws);
    expect(closed).toEqual({ code: BridgeCloseCode.unauthorized, reason: "malformed" });
  });

  it("refuses a session that isn't the configured bridge user with not-designated", async () => {
    const { bridge, url } = await start({ bridgeUserId: "portal-user" });
    const human = new FakeModule(url, BRIDGE_API_KEY, { userId: "josh", userName: "Josh" });
    const closed = await waitForCloseWithReason(human.ws);
    expect(closed).toEqual({ code: BridgeCloseCode.notDesignated, reason: "not-designated" });
    expect(bridge.getStatus()).toEqual({ connected: false });

    const anonymous = new FakeModule(url); // no userId at all: can't be the designated one
    expect((await waitForCloseWithReason(anonymous.ws)).code).toBe(BridgeCloseCode.notDesignated);

    const portal = new FakeModule(url, BRIDGE_API_KEY, {
      userId: "portal-user",
      userName: "Portal",
    });
    await portal.ready();
    expect(bridge.getStatus()).toMatchObject({ connected: true, userId: "portal-user" });
    portal.close();
  });

  it("a non-designated dial never disturbs the designated socket", async () => {
    const { bridge, url } = await start({ bridgeUserId: "portal-user" });
    const portal = new FakeModule(url, BRIDGE_API_KEY, { userId: "portal-user" });
    await portal.ready();
    const human = new FakeModule(url, BRIDGE_API_KEY, { userId: "josh" });
    expect(await waitForClose(human.ws)).toBe(BridgeCloseCode.notDesignated);

    portal.onQuery((q) => portal.respond(q.id, { from: "portal" }));
    await expect(bridge.sendQuery("portal.ping")).resolves.toEqual({ from: "portal" });
    portal.close();
  });

  it("without a designation, keeps the first user and refuses a second user as busy", async () => {
    const { bridge, url } = await start();
    const first = new FakeModule(url, BRIDGE_API_KEY, { userId: "gm-a" });
    await first.ready();
    const second = new FakeModule(url, BRIDGE_API_KEY, { userId: "gm-b" });
    const closed = await waitForCloseWithReason(second.ws);
    expect(closed).toEqual({ code: BridgeCloseCode.busy, reason: "busy" });
    expect(bridge.getStatus()).toMatchObject({ userId: "gm-a" });
    first.close();
  });

  it("SVC-18: a same-user reconnect replaces the old socket and fails its in-flight query at once with bridge-replaced", async () => {
    const { bridge, url } = await start({ bridgeUserId: "portal-user" });
    const old = new FakeModule(url, BRIDGE_API_KEY, { userId: "portal-user" });
    await old.ready();
    const oldClosed = waitForCloseWithReason(old.ws);
    // The old socket never answers, so only the replacement can settle this.
    const stranded = bridge.sendQuery("portal.list-scenes").catch((err: unknown) => err);
    await sleep(20);

    const t0 = Date.now();
    const fresh = new FakeModule(url, BRIDGE_API_KEY, { userId: "portal-user" });
    await fresh.ready();
    await expect(stranded).resolves.toMatchObject({ code: "bridge-replaced" });
    expect(Date.now() - t0).toBeLessThan(1_000); // not the 5 s query timeout
    expect(await oldClosed).toEqual({ code: BridgeCloseCode.replaced, reason: "replaced" });

    // The replacement serves new queries normally.
    fresh.onQuery((q) => fresh.respond(q.id, { from: "fresh" }));
    await expect(bridge.sendQuery("portal.ping")).resolves.toEqual({ from: "fresh" });
    fresh.close();
  });

  it("closes the module with 1001 server-shutdown and fails its in-flight queries as bridge-offline", async () => {
    const { bridge, url } = await start();
    const mod = new FakeModule(url);
    await mod.ready();
    const closed = waitForCloseWithReason(mod.ws);
    const pending = bridge.sendQuery("portal.ping").catch((err: unknown) => err);
    await sleep(20);
    bridge.close();
    await expect(pending).resolves.toMatchObject({ code: "bridge-offline" });
    expect(await closed).toEqual({
      code: BridgeCloseCode.serverShutdown,
      reason: "server-shutdown",
    });
    expect(bridge.getStatus()).toEqual({ connected: false });
  });
});
