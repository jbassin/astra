/**
 * portal-server wire constants — the two HTTP surfaces the S2 skeleton will bind
 * (spec 0023 D4): the Foundry module's bridge WebSocket, and the Streamable-HTTP
 * MCP endpoint the MCP clients (Claude Code + Claude Desktop, D10) hit. Split out
 * so both the server entrypoint and its tests reference one literal, not two.
 */

/** Hardcoded, not config-sourced (D3): portal has no browser RUM surface to derive
 * a name from, mirroring orator-backend's `initTelemetry("astra.orator-backend")`. */
export const SERVICE_NAME = "astra.portal";

/** The path the Foundry module dials (`wss://<public-origin><BRIDGE_WS_PATH>`). */
export const BRIDGE_WS_PATH = "/ws";

/** The path the Streamable-HTTP MCP server listens on. */
export const MCP_HTTP_PATH = "/mcp";
