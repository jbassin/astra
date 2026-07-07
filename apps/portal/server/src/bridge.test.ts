import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { AuthMeta, McpQuery } from "@astra/portal-shared";
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

/** A fake Foundry module: dials the bridge, completes the D6 handshake, and answers
 * whatever `query` messages a test tells it to (or none, to exercise the timeout path). */
class FakeModule {
  readonly ws: WebSocket;
  readonly #opened: Promise<void>;
  #onQuery?: (msg: McpQuery) => void;

  constructor(url: string, apiKey = BRIDGE_API_KEY, meta?: AuthMeta) {
    this.ws = new WebSocket(url);
    this.#opened = new Promise((resolve) => {
      this.ws.once("open", () => {
        this.ws.send(JSON.stringify({ type: "auth", apiKey, meta }));
        resolve();
      });
    });
    this.ws.on("message", (data) => {
      const msg: unknown = JSON.parse(data.toString());
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

  it("rejects the wrong bridge key with a policy-violation close, never adopting the socket", async () => {
    const mod = new FakeModule(url, "wrong-key");
    const code = await waitForClose(mod.ws);
    expect(code).toBe(1008);
    expect(bridge.getStatus()).toEqual({ connected: false });
  });

  it("closes an unauthenticated socket once the auth window elapses", async () => {
    const ws = new WebSocket(url);
    await new Promise((resolve) => ws.once("open", resolve));
    const code = await waitForClose(ws);
    expect(code).toBe(1008);
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
});
