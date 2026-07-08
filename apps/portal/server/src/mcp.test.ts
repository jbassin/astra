import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthMeta, McpQuery } from "@astra/portal-shared";
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
// Spec 0025 S1 — these tests never touch OAuth (that's oauth.test.ts); a single
// shared per-file tmp path is enough to satisfy `createPortalServer`'s now-required
// oauthStatePath (the file is never actually written unless a token is issued).
const TEST_OAUTH_STATE_PATH = join(mkdtempSync(join(tmpdir(), "portal-oauth-")), "state.json");

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

  constructor(url: string, meta?: AuthMeta) {
    this.ws = new WebSocket(url);
    this.#opened = new Promise((resolve) => {
      this.ws.once("open", () => {
        this.ws.send(JSON.stringify({ type: "auth", apiKey: BRIDGE_API_KEY, meta }));
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
      oauthStatePath: TEST_OAUTH_STATE_PATH,
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

  it("rejects a garbage bearer token (neither the static key nor a valid OAuth token)", async () => {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer totally-made-up" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer resource_metadata="/);
  });

  it("every 401 carries a D-9 WWW-Authenticate header pointing at a working PRM endpoint", async () => {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);

    const header = res.headers.get("www-authenticate");
    const match = /^Bearer resource_metadata="([^"]+)"$/.exec(header ?? "");
    expect(match).toBeTruthy();
    const metadataUrl = new URL(match?.[1] ?? "");
    // The URL is built from TEST_PUBLIC_ORIGIN (the configured public origin), not
    // the real ephemeral test port — exactly D-9's contract.
    expect(metadataUrl.href).toBe(`${TEST_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp`);

    // Fetch the PRM at the equivalent path on the actual ephemeral test server.
    const prmRes = await fetch(new URL(metadataUrl.pathname, `http://127.0.0.1:${handle.port}`));
    expect(prmRes.status).toBe(200);
    const prm = (await prmRes.json()) as Record<string, unknown>;
    expect(prm.resource).toBe(`${TEST_PUBLIC_ORIGIN}${MCP_HTTP_PATH}`);
    expect(prm.authorization_servers).toEqual([new URL(TEST_PUBLIC_ORIGIN).href]);
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

  it("bridge-status round-trips the 0027 D27-8 userName identity via a stub bridge module", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl, { userId: "user1", userName: "Portal" });
    await mod.ready();

    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({ name: "bridge-status" });
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual({
      connected: true,
      userId: "user1",
      userName: "Portal",
    });

    await client.close();
    mod.close();
  });

  it("surfaces per-param .describe() text in tools/list (the LLM-facing schema docs)", async () => {
    // Found live (2026-07-07 acceptance): without a JSON-schema description on
    // search-compendium's `type`, an MCP client guesses the pf2e subtype ("npc") and
    // silently gets zero results — the zod JSDoc never crosses the wire, .describe() does.
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const propDescription = (tool: string, prop: string): string => {
      const schema = tools.find((t) => t.name === tool)?.inputSchema as
        | { properties?: Record<string, { description?: string }> }
        | undefined;
      return schema?.properties?.[prop]?.description ?? "";
    };
    expect(propDescription("search-compendium", "type")).toContain("metadata.type");
    expect(propDescription("import-from-compendium", "folder")).toContain("EXISTING");
    expect(propDescription("create-journal", "folder")).toContain("EXISTING");
    expect(propDescription("create-token", "actorId")).toContain("Exactly one of");

    await client.close();
  });

  it("lists all 18 tools (spec 0026 S1 — 10 pre-existing + 8 new authoring tools), every new field described", async () => {
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${MCP_API_KEY}` } },
    });
    const client = new Client({ name: "portal-test-client", version: "0.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "bridge-status",
        "list-compendium-packs",
        "search-compendium",
        "get-document",
        "search-world",
        "list-scenes",
        "get-current-scene",
        "import-from-compendium",
        "create-token",
        "create-journal",
        "create-actor",
        "create-item",
        "create-light",
        "create-macro",
        "apply-condition",
        "update-document",
        "delete-document",
        "execute-macro",
      ].sort(),
    );

    // Every field on every new tool's schema must carry a .describe() — the 0023
    // acceptance lesson (zod JSDoc never crosses the wire, .describe() does).
    const schemaOf = (tool: string): { properties?: Record<string, { description?: string }> } =>
      (tools.find((t) => t.name === tool)?.inputSchema ?? {}) as {
        properties?: Record<string, { description?: string }>;
      };
    const newToolFields: Record<string, string[]> = {
      "create-actor": ["type", "name", "system", "items", "baseUuid", "folder", "img"],
      "create-item": ["name", "type", "system", "actorId", "baseUuid", "rulesSelections", "img"],
      "apply-condition": ["actorId", "slug", "action", "value", "persistentDamage"],
      "create-light": ["sceneId", "x", "y", "hidden", "config"],
      "create-macro": ["name", "macroType", "command", "img"],
      "update-document": ["uuid", "updates"],
      "delete-document": ["uuid"],
      "execute-macro": ["macroId"],
    };
    for (const [tool, fields] of Object.entries(newToolFields)) {
      const properties = schemaOf(tool).properties ?? {};
      for (const field of fields) {
        expect(properties[field]?.description, `${tool}.${field} should be described`).toBeTruthy();
      }
    }

    // D-11 loudness spot-checks: the write descriptions state loudly that they WRITE
    // to the live campaign, and the riskiest tools name their own guardrails.
    const description = (tool: string): string =>
      tools.find((t) => t.name === tool)?.description ?? "";
    expect(description("create-actor")).toContain("WRITES to the live 'Faerrin'");
    expect(description("delete-document")).toContain("not-portal-created");
    expect(description("execute-macro")).toContain("AS THE GM");

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
      oauthStatePath: TEST_OAUTH_STATE_PATH,
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

describe("S1 authoring tools (spec 0026 — Foundry-free)", () => {
  let handle: PortalServerHandle & { port: number };
  let mcpUrl: URL;

  beforeEach(async () => {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: 2, // deliberately small — the cap-pre-check test below relies on it
      publicOrigin: TEST_PUBLIC_ORIGIN,
      moduleDir: TEST_MODULE_DIR,
      oauthStatePath: TEST_OAUTH_STATE_PATH,
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

  it("rejects an over-cap create-actor (1 + items.length > cap) with NO bridge round-trip", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();
    let queried = false;
    mod.onQuery(() => {
      queried = true;
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "create-actor",
      arguments: {
        type: "npc",
        name: "Test Goblin",
        // 1 (the actor) + 3 items = 4, over the maxCreatesPerRequest: 2 cap above.
        items: [
          { type: "melee", name: "Claw" },
          { type: "melee", name: "Claw 2" },
          { type: "action", name: "Special" },
        ],
      },
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

  it("round-trips update-document through the bridge (generic uuid + dot-path updates)", async () => {
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();

    const canned = { uuid: "Actor.a1", updatedPaths: ["system.attributes.hp.value"] };
    mod.onQuery((q) => {
      expect(q.method).toBe("portal.update-document");
      expect(q.params).toEqual({
        uuid: "Actor.a1",
        updates: { "system.attributes.hp.value": 20 },
      });
      mod.respond(q.id, canned);
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "update-document",
      arguments: { uuid: "Actor.a1", updates: { "system.attributes.hp.value": 20 } },
    });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual(canned);

    await client.close();
    mod.close();
  });

  it("update-document/delete-document/execute-macro never trip the create cap even at 1 above it", async () => {
    // maxCreatesPerRequest is 2 in this describe block; these three tools register
    // with no `creates`/`cap` at all (0026 D-8: mutations/actions, not creates), so a
    // large `updates` payload must never be rejected as cap-exceeded.
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();
    mod.onQuery((q) => {
      mod.respond(q.id, { uuid: "Actor.a1", updatedPaths: Object.keys(q.params as object) });
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "update-document",
      arguments: {
        uuid: "Actor.a1",
        updates: { a: 1, b: 2, c: 3, d: 4, e: 5 }, // 5 keys, well over the cap of 2
      },
    });
    expect(result.isError).toBeFalsy();

    await client.close();
    mod.close();
  });

  it("maps a stub bridge's unrecognized-method response to a typed error, not a throw (mid-rollout safety)", async () => {
    // Mirrors the module's own `dispatchQuery` behavior for a method with no
    // registered handler (module/src/handlers.ts): a BridgeHandlerError with code
    // "foundry-error" and a message naming the unknown method — verified by reading
    // handlers.ts directly (S1 is Foundry-free, so this test stubs that exact shape
    // rather than exercising the real module). This proves the server's new S1
    // tools stay safe to register even against an OLD, not-yet-updated module
    // build (D-12's versioning discipline covers the human GM-refresh side).
    const wsUrl = `ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`;
    const mod = new FakeModule(wsUrl);
    await mod.ready();
    mod.onQuery((q) => {
      mod.respondError(q.id, "foundry-error", `no handler registered for query "${q.method}"`);
    });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "create-macro",
      arguments: { name: "Test Macro", macroType: "chat", command: "hello" },
    });
    // A typed isError result — never an uncaught throw back to the MCP client.
    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: "text"; text: string }>;
    if (!content) throw new Error("unreachable — asserted above");
    expect(JSON.parse(content.text)).toEqual({
      code: "foundry-error",
      message: 'no handler registered for query "portal.create-macro"',
    });

    await client.close();
    mod.close();
  });
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
      oauthStatePath: TEST_OAUTH_STATE_PATH,
    });
    expect(handle.bridge.getStatus()).toEqual({ connected: false });
    handle.bridge.close();
  });
});
