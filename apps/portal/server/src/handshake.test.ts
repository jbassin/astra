/**
 * svc-2's real-protocol tests: a real MCP SDK client over Streamable HTTP against a fake
 * Foundry module speaking the real bridge envelope over a real WebSocket. Covers each
 * handshake close code, the version mismatch, server-side designation and the queries a
 * replaced socket used to strand (SVC-18). Unit-level edge cases live in bridge.test.ts.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BRIDGE_PROTOCOL,
  BridgeCloseCode,
  PORTAL_VERSION,
  type AuthMeta,
  type McpQuery,
} from "@astra/portal-shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { BRIDGE_WS_PATH, MCP_HTTP_PATH } from "./constants";
import { listen, type PortalServerHandle, type PortalServerOptions } from "./server";

const MCP_API_KEY = "test-mcp-key";
const BRIDGE_API_KEY = "test-bridge-key";
const PORTAL_USER = "portal-user-id";
const TEST_OAUTH_STATE_PATH = join(mkdtempSync(join(tmpdir(), "portal-oauth-")), "state.json");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Closed {
  code: number;
  reason: string;
}

/** A fake Foundry module: dials, sends the handshake (versioned unless `protocol` is
 * null, the 0.4.x shape), records what the server sends, answers scripted queries. */
class FakeModule {
  readonly ws: WebSocket;
  readonly received: Array<{ type?: string }> = [];
  readonly closed: Promise<Closed>;
  readonly #opened: Promise<void>;
  #onQuery?: (msg: McpQuery) => void;

  constructor(
    url: string,
    opts: { apiKey?: string; meta?: AuthMeta; protocol?: number | null } = {},
  ) {
    this.ws = new WebSocket(url);
    const protocol = opts.protocol === undefined ? BRIDGE_PROTOCOL : opts.protocol;
    const versioned = protocol === null ? {} : { protocol, moduleVersion: PORTAL_VERSION };
    this.#opened = new Promise((resolve) => {
      this.ws.once("open", () => {
        const auth = { type: "auth", apiKey: opts.apiKey ?? BRIDGE_API_KEY, ...versioned };
        this.ws.send(JSON.stringify({ ...auth, meta: opts.meta }));
        resolve();
      });
    });
    this.closed = new Promise((resolve) => {
      this.ws.once("close", (code: number, reason: Buffer) =>
        resolve({ code, reason: reason.toString() }),
      );
    });
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as { type?: string };
      this.received.push(msg);
      if (msg.type === "query") this.#onQuery?.(msg as McpQuery);
    });
  }

  async ready(): Promise<void> {
    await this.#opened;
    await sleep(50); // let the server process the handshake
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

describe("bridge handshake end to end (svc-2: MCP client + fake module over real sockets)", () => {
  let handle: (PortalServerHandle & { port: number }) | undefined;
  const clients: Client[] = [];
  const modules: FakeModule[] = [];

  async function startPortal(
    overrides: Partial<PortalServerOptions> = {},
  ): Promise<{ wsUrl: string; mcp: Client }> {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      playerMcpApiKey: "test-player-key",
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 5_000, // long, so a prompt error proves it wasn't the timeout
      maxCreatesPerRequest: 10,
      publicOrigin: "https://portal.test",
      moduleDir: "/nonexistent/portal-module-fixture",
      oauthStatePath: TEST_OAUTH_STATE_PATH,
      ...overrides,
    });
    const mcpUrl = new URL(`http://127.0.0.1:${handle.port}${MCP_HTTP_PATH}`);
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const mcp = new Client({ name: "portal-handshake-test", version: "0.0.0" });
    await mcp.connect(transport);
    clients.push(mcp);
    return { wsUrl: `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`, mcp };
  }

  function dial(url: string, opts?: ConstructorParameters<typeof FakeModule>[1]): FakeModule {
    const mod = new FakeModule(url, opts);
    modules.push(mod);
    return mod;
  }

  async function callJson(mcp: Client, name: string): Promise<{ isError: boolean; body: unknown }> {
    const result = await mcp.callTool({ name, arguments: {} });
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error(`${name} returned no content`);
    return { isError: result.isError === true, body: JSON.parse(content.text) };
  }

  afterEach(async () => {
    for (const mod of modules.splice(0)) mod.close();
    for (const mcp of clients.splice(0)) await mcp.close();
    await handle?.close();
    handle = undefined;
  });

  it("a current module gets auth-ok and serves tools", async () => {
    const { wsUrl, mcp } = await startPortal({ bridgeUserId: PORTAL_USER });
    const mod = dial(wsUrl, { meta: { userId: PORTAL_USER, userName: "Portal" } });
    await mod.ready();
    expect(mod.received).toContainEqual({
      type: "auth-ok",
      protocol: BRIDGE_PROTOCOL,
      serverVersion: PORTAL_VERSION,
    });
    expect((await callJson(mcp, "bridge-status")).body).toEqual({
      connected: true,
      userId: PORTAL_USER,
      userName: "Portal",
    });

    mod.onQuery((q) => mod.respond(q.id, { scenes: [] }));
    expect(await callJson(mcp, "list-scenes")).toEqual({ isError: false, body: { scenes: [] } });
  });

  it("the installed 0.4.x module (no protocol) still connects and serves tools during the rollout", async () => {
    const { wsUrl, mcp } = await startPortal({ bridgeUserId: PORTAL_USER });
    const legacy = dial(wsUrl, { protocol: null, meta: { userId: PORTAL_USER } });
    await legacy.ready();
    expect(legacy.received).toEqual([]); // no auth-ok: a 0.4.x module would log it as invalid
    legacy.onQuery((q) => legacy.respond(q.id, { scenes: [] }));
    expect(await callJson(mcp, "list-scenes")).toEqual({ isError: false, body: { scenes: [] } });
  });

  it("4001: a wrong key is refused and tools stay offline", async () => {
    const { wsUrl, mcp } = await startPortal();
    const mod = dial(wsUrl, { apiKey: "wrong-key" });
    expect(await mod.closed).toEqual({ code: BridgeCloseCode.unauthorized, reason: "bad-key" });
    expect((await callJson(mcp, "bridge-status")).body).toEqual({ connected: false });
  });

  it("4002 module-stale: once legacy support ends, a 0.4.x module is refused and its queries never run", async () => {
    const { wsUrl, mcp } = await startPortal({ minBridgeProtocol: 1 });
    const stale = dial(wsUrl, { protocol: null });
    let queried = false;
    stale.onQuery(() => {
      queried = true;
    });
    expect(await stale.closed).toEqual({
      code: BridgeCloseCode.protocolMismatch,
      reason: "module-stale",
    });
    const { isError, body } = await callJson(mcp, "list-scenes");
    expect(isError).toBe(true);
    expect(body).toMatchObject({ code: "bridge-offline" });
    expect(queried).toBe(false);
  });

  it("4002 server-stale: a module newer than the server is refused as a version mismatch, not a bad key", async () => {
    const { wsUrl } = await startPortal();
    const future = dial(wsUrl, { protocol: BRIDGE_PROTOCOL + 1 });
    expect(await future.closed).toEqual({
      code: BridgeCloseCode.protocolMismatch,
      reason: "server-stale",
    });
  });

  it("4003: the server, not the module, decides who holds the bridge", async () => {
    const { wsUrl, mcp } = await startPortal({ bridgeUserId: PORTAL_USER });
    const portal = dial(wsUrl, { meta: { userId: PORTAL_USER, userName: "Portal" } });
    await portal.ready();

    // A human GM's tab dials too (its module setting doesn't stop it): refused.
    const human = dial(wsUrl, { meta: { userId: "josh-id", userName: "Josh" } });
    expect(await human.closed).toEqual({
      code: BridgeCloseCode.notDesignated,
      reason: "not-designated",
    });
    expect((await callJson(mcp, "bridge-status")).body).toMatchObject({
      connected: true,
      userId: PORTAL_USER,
    });
  });

  it("4006: with no designation the first user keeps the bridge and a second user is busy", async () => {
    const { wsUrl, mcp } = await startPortal();
    const first = dial(wsUrl, { meta: { userId: "gm-a", userName: "A" } });
    await first.ready();
    const second = dial(wsUrl, { meta: { userId: "gm-b", userName: "B" } });
    expect(await second.closed).toEqual({ code: BridgeCloseCode.busy, reason: "busy" });
    expect((await callJson(mcp, "bridge-status")).body).toMatchObject({ userId: "gm-a" });
  });

  it("4004 + SVC-18: a tab reload mid-call fails the in-flight tool call at once with bridge-replaced", async () => {
    const { wsUrl, mcp } = await startPortal({ bridgeUserId: PORTAL_USER });
    const old = dial(wsUrl, { meta: { userId: PORTAL_USER } });
    await old.ready();
    // The old tab never answers; before svc-2 this call hung for the full query timeout.
    const inFlight = callJson(mcp, "list-scenes");
    await sleep(50);

    const t0 = Date.now();
    const fresh = dial(wsUrl, { meta: { userId: PORTAL_USER } });
    await fresh.ready();
    const { isError, body } = await inFlight;
    expect(Date.now() - t0).toBeLessThan(1_000); // the timeout is 5 s
    expect(isError).toBe(true);
    expect(body).toMatchObject({ code: "bridge-replaced" });
    expect(await old.closed).toEqual({ code: BridgeCloseCode.replaced, reason: "replaced" });

    fresh.onQuery((q) => fresh.respond(q.id, { scenes: [] }));
    expect(await callJson(mcp, "list-scenes")).toEqual({ isError: false, body: { scenes: [] } });
  });

  it("1001: shutting the server down closes the module with server-shutdown", async () => {
    const { wsUrl } = await startPortal();
    const mod = dial(wsUrl);
    await mod.ready();
    handle?.bridge.close();
    expect(await mod.closed).toEqual({
      code: BridgeCloseCode.serverShutdown,
      reason: "server-shutdown",
    });
  });
});
