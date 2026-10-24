/**
 * Pins the exact MCP `tools/list` output (names, titles, descriptions, input schemas)
 * for both key scopes. The tool registry in `@astra/portal-shared` drives registration;
 * this snapshot is what MCP clients see, so any diff here is a client-visible change and
 * must be deliberate (`vitest -u` only after reviewing the diff).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MCP_HTTP_PATH } from "./constants";
import { listen, type PortalServerHandle } from "./server";

const MCP_API_KEY = "test-mcp-key";
const PLAYER_MCP_API_KEY = "test-player-mcp-key";

describe("the pinned tools/list snapshot", () => {
  let handle: PortalServerHandle & { port: number };
  let mcpUrl: URL;

  beforeAll(async () => {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      playerMcpApiKey: PLAYER_MCP_API_KEY,
      bridgeApiKey: "test-bridge-key",
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

  async function listToolsWith(key: string): Promise<unknown> {
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    });
    const client = new Client({ name: "portal-snapshot-client", version: "0.0.0" });
    await client.connect(transport);
    const result = await client.listTools();
    await client.close();
    return result;
  }

  it("the admin key's tools/list is unchanged", async () => {
    const result = await listToolsWith(MCP_API_KEY);
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      "./__snapshots__/tools-list.admin.json",
    );
  });

  it("the player key's tools/list is unchanged", async () => {
    const result = await listToolsWith(PLAYER_MCP_API_KEY);
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      "./__snapshots__/tools-list.player.json",
    );
  });
});
