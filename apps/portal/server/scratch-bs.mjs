// Throwaway: bridge-status via the player key.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const t = new StreamableHTTPClientTransport(new URL("https://portal.iridi.cc/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.portal_player_api_key}` } },
});
const c = new Client({ name: "gate", version: "0" });
await c.connect(t);
const r = await c.callTool({ name: "bridge-status", arguments: {} });
console.log(r.content?.[0]?.text);
await c.close();
