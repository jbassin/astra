import type { McpQuery } from "@astra/portal-shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { BRIDGE_WS_PATH, MCP_HTTP_PATH } from "./constants";
import { createPortalServer, type PortalServerHandle, listen } from "./server";

const MCP_API_KEY = "test-mcp-key";
const BRIDGE_API_KEY = "test-bridge-key";
const MAX_CREATES_PER_REQUEST = 10;
// S6's module-package routes are exercised separately (modulePackage.test.ts); these
// MCP-tool tests never hit /module/*, so a non-existent moduleDir is fine (any request
// would just 503, per modulePackage.ts).
const TEST_PUBLIC_ORIGIN = "https://portal.test";
const TEST_MODULE_DIR = "/nonexistent/portal-module-fixture";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A fake Foundry module for the S4 read-tool tests — dials the bridge, completes the
 * D6 handshake, and answers whatever `query` a test scripts (mirrors bridge.test.ts's
 * FakeModule, scoped to what these MCP-tool round-trip tests need). */
class FakeModule {
  readonly ws: WebSocket;
  readonly #opened: Promise<void>;
  #onQuery?: (msg: McpQuery) => void;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.#opened = new Promise((resolve) => {
      this.ws.once("open", () => {
        this.ws.send(JSON.stringify({ type: "auth", apiKey: BRIDGE_API_KEY }));
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

  /** Answers every query with the same canned result, regardless of method. */
  onQuery(handler: (msg: McpQuery) => void): void {
    this.#onQuery = handler;
  }

  respond(id: string, result: unknown): void {
    this.ws.send(JSON.stringify({ type: "response", id, ok: true, result }));
  }

  respondError(id: string, code: string, message: string): void {
    this.ws.send(JSON.stringify({ type: "response", id, ok: false, error: { code, message } }));
  }

  close(): void {
    this.ws.close();
  }
}

describe("the /mcp Streamable-HTTP surface (spec 0023 S2 — Foundry-free)", () => {
  let handle: PortalServerHandle & { port: number };
  let mcpUrl: URL;

  beforeEach(async () => {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: MAX_CREATES_PER_REQUEST,
      publicOrigin: TEST_PUBLIC_ORIGIN,
      moduleDir: TEST_MODULE_DIR,
    });
    mcpUrl = new URL(`http://127.0.0.1:${handle.port}${MCP_HTTP_PATH}`);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a request with the wrong bearer key", async () => {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
  });

  it("serves the bridge-status tool (offline, no module connected) through a real MCP client round-trip", async () => {
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({ name: "bridge-status" });
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    expect(content).toBeDefined();
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual({ connected: false });

    await client.close();
  });

  it("maps a bridge-offline BridgeError to an isError result when no module is connected (S4)", async () => {
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({ name: "list-scenes", arguments: {} });
    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual({
      code: "bridge-offline",
      message: "no Foundry module is connected",
    });

    await client.close();
  });

  it("search-compendium round-trips params + the module's result through a real MCP client (S4)", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();

    const canned = {
      results: [
        {
          uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1",
          id: "g1",
          name: "Goblin Warrior",
          type: "Actor",
          pack: "pf2e.pathfinder-bestiary",
          packLabel: "Pathfinder Bestiary",
        },
      ],
    };
    mod.onQuery((q) => {
      expect(q.method).toBe("portal.search-compendium");
      expect(q.params).toEqual({ query: "goblin" });
      mod.respond(q.id, canned);
    });

    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "search-compendium",
      arguments: { query: "goblin" },
    });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual(canned);

    await client.close();
    mod.close();
  });

  it("get-document maps the module's typed not-found error onto an isError result (S4)", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();

    mod.onQuery((q) => {
      mod.respondError(q.id, "not-found", "not found: Actor.nope");
    });

    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "get-document",
      arguments: { uuid: "Actor.nope" },
    });
    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual({
      code: "not-found",
      message: "not found: Actor.nope",
    });

    await client.close();
    mod.close();
  });
});

describe("S5 write tools (spec 0023 D8 — Foundry-free)", () => {
  let handle: PortalServerHandle & { port: number };
  let mcpUrl: URL;

  beforeEach(async () => {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: 2, // deliberately small — S5's cap-pre-check test relies on it
      publicOrigin: TEST_PUBLIC_ORIGIN,
      moduleDir: TEST_MODULE_DIR,
    });
    mcpUrl = new URL(`http://127.0.0.1:${handle.port}${MCP_HTTP_PATH}`);
  });

  afterEach(async () => {
    await handle.close();
  });

  async function connectedClient(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);
    return client;
  }

  it("rejects an over-cap import-from-compendium with NO bridge round-trip", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();
    let queried = false;
    mod.onQuery(() => {
      queried = true;
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "import-from-compendium",
      arguments: { uuid: "Compendium.pf2e.pathfinder-bestiary.Actor.g1", quantity: 5 },
    });
    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toMatchObject({ code: "cap-exceeded" });
    // The cap rejection must short-circuit BEFORE the bridge query — the connected
    // fake module should never have seen this request at all.
    expect(queried).toBe(false);

    await client.close();
    mod.close();
  });

  it("allows an at-cap create-token and round-trips it through the bridge (S5/D13)", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();

    const canned = {
      actor: { uuid: "Actor.a1", id: "a1", name: "Goblin Warrior" },
      tokens: [
        { id: "t1", x: 100, y: 100 },
        { id: "t2", x: 200, y: 200 },
      ],
      sceneId: "sc1",
    };
    mod.onQuery((q) => {
      expect(q.method).toBe("portal.create-token");
      expect(q.params).toMatchObject({ actorId: "a1", x: 100, y: 100, quantity: 2 });
      mod.respond(q.id, canned);
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "create-token",
      arguments: { actorId: "a1", x: 100, y: 100, quantity: 2 },
    });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual(canned);

    await client.close();
    mod.close();
  });

  it("round-trips create-journal through the bridge — always exactly 1 create, never caps out", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();

    const canned = { uuid: "JournalEntry.j1", id: "j1", name: "Session Notes" };
    mod.onQuery((q) => {
      expect(q.method).toBe("portal.create-journal");
      expect(q.params).toMatchObject({ name: "Session Notes", content: "<p>hi</p>" });
      mod.respond(q.id, canned);
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "create-journal",
      arguments: { name: "Session Notes", content: "<p>hi</p>" },
    });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual(canned);

    await client.close();
    mod.close();
  });

  it("maps a module-side writes-disabled denial onto a typed isError result", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();
    mod.onQuery((q) => {
      mod.respondError(q.id, "writes-disabled", "write operations are disabled");
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "create-journal",
      arguments: { name: "x", content: "y" },
    });
    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual({
      code: "writes-disabled",
      message: "write operations are disabled",
    });

    await client.close();
    mod.close();
  });

  // Note: the audit-log line itself (mcp.ts's `auditWrite` -> `log.emit`) isn't
  // cheaply assertable from this test file — `@astra/observe`'s `getLogger` resolves
  // to a no-op OTel logger unless a real LoggerProvider is installed (`initTelemetry`,
  // never called in these Foundry-free unit tests), and wiring an in-memory log
  // exporter here would mean adding `@opentelemetry/sdk-logs` as a new portal-server
  // devDependency for one assertion. The write-tool round-trip tests above already
  // exercise every `auditWrite` call site (ok/denied/cap-exceeded); the log line's
  // presence is a one-line, low-risk addition reviewed by inspection instead.
});

describe("createPortalServer (unbound — construction only)", () => {
  it("builds without binding a port", () => {
    const handle = createPortalServer({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: MAX_CREATES_PER_REQUEST,
      publicOrigin: TEST_PUBLIC_ORIGIN,
      moduleDir: TEST_MODULE_DIR,
    });
    expect(handle.bridge.getStatus()).toEqual({ connected: false });
    handle.bridge.close();
  });
});
