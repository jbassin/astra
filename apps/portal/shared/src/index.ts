// @astra/portal-shared — the contract portal-server and the Foundry module share:
// - `envelope.ts`: the bridge WS envelope. Parse a raw WS message into
//   `BridgeMessage` on receipt; never thread a raw JSON blob through bridge code.
// - `tools.ts`: each tool's param and result schemas (compact, LLM-friendly rows, not
//   modeled pf2e — see the file header).
// - `registry.ts`: the tool registry (`PORTAL_TOOLS`) that drives MCP registration,
//   player visibility and module dispatch.
export * from "./envelope";
export * from "./registry";
export * from "./tools";
