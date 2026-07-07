import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MCP_HTTP_PATH } from "./constants";
import { createPortalServer, type PortalServerHandle, listen } from "./server";

const MCP_API_KEY = "test-mcp-key";
const BRIDGE_API_KEY = "test-bridge-key";

describe("the /mcp Streamable-HTTP surface (spec 0023 S2 — Foundry-free)", () => {
  let handle: PortalServerHandle & { port: number };
  let mcpUrl: URL;

  beforeEach(async () => {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
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
});

describe("createPortalServer (unbound — construction only)", () => {
  it("builds without binding a port", () => {
    const handle = createPortalServer({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
    });
    expect(handle.bridge.getStatus()).toEqual({ connected: false });
    handle.bridge.close();
  });
});
