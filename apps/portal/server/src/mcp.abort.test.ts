import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Bridge } from "./bridge";
import { createMcpRequestHandler } from "./mcp";

const MCP_API_KEY = "test-mcp-key";

/** A bridge no module ever dials: these requests are `initialize`, which no tool handles. */
const bridge = new Bridge({ bridgeApiKey: "unused", queryTimeoutMs: 1_000 });
const oauth = { verifyAccessToken: () => Promise.reject(new Error("not oauth")) };

const handler = createMcpRequestHandler(
  bridge,
  MCP_API_KEY,
  "player-key",
  10,
  oauth,
  "https://p.test",
);

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "abort-test", version: "0" },
  },
});

function mcpRequest(body: BodyInit, signal: AbortSignal): Request {
  // Node needs `duplex` for a stream body; the DOM RequestInit type doesn't declare it.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body,
    signal,
    duplex: "half",
  };
  return new Request("https://p.test/mcp", init);
}

describe("/mcp cleanup when the client disconnects early", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes the request's McpServer when the client aborts while handleRequest is running", async () => {
    const closeSpy = vi.spyOn(McpServer.prototype, "close");
    const abort = new AbortController();
    // The body arrives in two parts, so handleRequest is still reading it when the
    // client goes away.
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(INITIALIZE);
        controller.enqueue(bytes.slice(0, 10));
        finish = () => {
          controller.enqueue(bytes.slice(10));
          controller.close();
        };
      },
    });

    const pending = handler(mcpRequest(body, abort.signal));
    await new Promise((resolve) => setTimeout(resolve, 20));
    abort.abort();
    finish();
    const res = await pending;
    expect(res.status).toBeLessThan(500);
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("closes the request's McpServer when the signal is already aborted on arrival", async () => {
    const closeSpy = vi.spyOn(McpServer.prototype, "close");
    const abort = new AbortController();
    abort.abort();
    await handler(mcpRequest(INITIALIZE, abort.signal));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("still closes exactly once after a normal response is fully read", async () => {
    const closeSpy = vi.spyOn(McpServer.prototype, "close");
    const res = await handler(mcpRequest(INITIALIZE, new AbortController().signal));
    expect(res.status).toBe(200);
    await res.text();
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });
});
