/**
 * The server side of the tool registry agreement, over the real protocol (an MCP client
 * over HTTP, a fake module over a real WebSocket): the server registers exactly the
 * registry's tools in registry order, filters the player key by `access`, and forwards
 * every bridge tool as `bridgeMethod(name)`. The module side
 * (`module/src/registry.test.ts`) proves the module answers exactly those methods.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BRIDGE_TOOL_NAMES,
  bridgeMethod,
  type BridgeToolName,
  PORTAL_TOOL_NAMES,
  PORTAL_TOOLS,
} from "@astra/portal-shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { BRIDGE_WS_PATH, MCP_HTTP_PATH } from "./constants";
import { listen, type PortalServerHandle } from "./server";

const MCP_API_KEY = "test-mcp-key";
const PLAYER_MCP_API_KEY = "test-player-mcp-key";
const BRIDGE_API_KEY = "test-bridge-key";

/** Minimal valid params per bridge tool. Typed by `BridgeToolName`, so a new tool
 * without an entry here fails to compile. */
const MINIMAL_PARAMS: { [K in BridgeToolName]: Record<string, unknown> } = {
  "list-compendium-packs": {},
  "search-compendium": { query: "goblin" },
  "get-document": { uuid: "Actor.a1" },
  "search-world": { query: "goblin" },
  "list-scenes": {},
  "get-current-scene": {},
  "query-party": {},
  "query-player": { name: "Argyle", section: "summary" },
  "query-item": { name: "Grab" },
  "query-rolls": {},
  "import-from-compendium": { uuid: "Compendium.pf2e.x.Actor.a1" },
  "create-token": { actorId: "a1", x: 0, y: 0 },
  "create-journal": { name: "Notes", content: "<p>hi</p>" },
  "create-actor": { type: "npc", name: "Goblin" },
  "create-item": { name: "Glow", type: "effect" },
  "create-light": { x: 0, y: 0 },
  "create-macro": { name: "M", macroType: "chat", command: "hi" },
  "apply-condition": { actorId: "a1", slug: "frightened", action: "increase" },
  "update-document": { uuid: "Actor.a1", updates: { name: "B" } },
  "delete-document": { uuid: "Actor.a1" },
  "execute-macro": { macroId: "m1" },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("the server agrees with the tool registry", () => {
  let handle: PortalServerHandle & { port: number };
  let mcpUrl: URL;

  beforeAll(async () => {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      playerMcpApiKey: PLAYER_MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: 10,
      publicOrigin: "https://portal.test",
      moduleDir: "/nonexistent/portal-module-fixture",
      oauthStatePath: join(mkdtempSync(join(tmpdir(), "portal-oauth-")), "state.json"),
    });
    mcpUrl = new URL(`http://127.0.0.1:${handle.port}${MCP_HTTP_PATH}`);
  });

  afterAll(async () => {
    await handle.close();
  });

  async function clientWith(key: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    });
    const client = new Client({ name: "portal-registry-client", version: "0.0.0" });
    await client.connect(transport);
    return client;
  }

  it("registers every registry tool, in registry order, for the admin key", async () => {
    const client = await clientWith(MCP_API_KEY);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(PORTAL_TOOL_NAMES);
    await client.close();
  });

  it("registers exactly the player-access tools for the player key", async () => {
    const client = await clientWith(PLAYER_MCP_API_KEY);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      PORTAL_TOOL_NAMES.filter((name) => PORTAL_TOOLS[name].access === "player"),
    );
    await client.close();
  });

  it("the minimal params fixture is valid input for every bridge tool", () => {
    for (const name of BRIDGE_TOOL_NAMES) {
      expect(PORTAL_TOOLS[name].params.safeParse(MINIMAL_PARAMS[name]).success, name).toBe(true);
    }
  });

  it("forwards every bridge tool to the module as its wire method, with its parsed params", async () => {
    const received: Array<{ method: string; params: unknown }> = [];
    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}${BRIDGE_WS_PATH}`);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    ws.send(JSON.stringify({ type: "auth", apiKey: BRIDGE_API_KEY }));
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as {
        type: string;
        id: string;
        method: string;
        params: unknown;
      };
      if (msg.type !== "query") return;
      received.push({ method: msg.method, params: msg.params });
      ws.send(JSON.stringify({ type: "response", id: msg.id, ok: true, result: {} }));
    });
    await sleep(50);

    const client = await clientWith(MCP_API_KEY);
    for (const name of BRIDGE_TOOL_NAMES) {
      // The canned `{}` result renders badly for the markdown tools (the SDK rejects
      // that tool result); only the forwarded method and params matter here.
      await client.callTool({ name, arguments: MINIMAL_PARAMS[name] }).catch(() => undefined);
    }
    await client.close();
    ws.close();

    expect(received.map((r) => r.method)).toEqual(
      BRIDGE_TOOL_NAMES.map((name) => bridgeMethod(name)),
    );
    for (const [i, name] of BRIDGE_TOOL_NAMES.entries()) {
      // The SDK hands the handler its zod-parsed args (defaults filled in).
      const parsed: unknown = PORTAL_TOOLS[name].params.parse(MINIMAL_PARAMS[name]);
      expect(received[i]?.params, name).toEqual(parsed);
    }
  });
});
