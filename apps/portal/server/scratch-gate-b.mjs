// Throwaway (untracked, deleted after use): 0028 S4 acceptance-B scope proof.
// Run: SOPS_AGE_KEY_FILE=deploy/sops/age.key sops exec-env deploy/sops/secrets.enc.yaml 'node apps/portal/server/scratch-gate-b.mjs'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = new URL("https://portal.iridi.cc/mcp");

async function connect(key) {
  const transport = new StreamableHTTPClientTransport(URL_, {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: "astra-0028-gate-b", version: "0.0.1" });
  await client.connect(transport);
  return client;
}

// 1. player key: exact tool list
const player = await connect(process.env.portal_player_api_key);
const pTools = (await player.listTools()).tools.map((t) => t.name).sort();
console.log(`player tools (${pTools.length}):`, pTools.join(", "));

// 2. player key: bridge-status works
const bs = await player.callTool({ name: "bridge-status", arguments: {} });
console.log("player bridge-status:", (bs.content?.[0]?.text ?? "").slice(0, 200));

// 3. player key: an admin tool is unknown/unreachable
try {
  const r = await player.callTool({ name: "search-world", arguments: { query: "argyle" } });
  console.log(
    "player search-world -> isError:",
    r.isError === true,
    (r.content?.[0]?.text ?? "").slice(0, 120),
  );
} catch (e) {
  console.log("player search-world -> rejected:", String(e).slice(0, 160));
}

// 4. player key: a query tool against the still-0.3.0 module (expected typed skew error until GM updates)
try {
  const q = await player.callTool({ name: "query-party", arguments: {} });
  console.log(
    "player query-party:",
    `isError=${q.isError === true}`,
    (q.content?.[0]?.text ?? "").slice(0, 250),
  );
} catch (e) {
  console.log("player query-party -> rejected:", String(e).slice(0, 200));
}
await player.close();

// 5. admin key: exactly 22 tools
const admin = await connect(process.env.portal_mcp_api_key);
const aTools = (await admin.listTools()).tools.map((t) => t.name);
console.log(`admin tools (${aTools.length})`);
await admin.close();

// 6. garbage key: 401 + resource_metadata header
const res = await fetch(URL_, {
  method: "POST",
  headers: {
    Authorization: "Bearer not-a-real-key",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
console.log("garbage key:", res.status, "www-authenticate:", res.headers.get("www-authenticate"));
