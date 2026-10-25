/**
 * portal-server wire constants — the paths the server binds: the Foundry module's
 * bridge WebSocket, the Streamable-HTTP MCP endpoint the MCP clients (Claude Code,
 * Claude Desktop, claude.ai) hit, and the OAuth consent route. Split out so both the
 * server entrypoint and its tests reference one literal, not two.
 */

/** The tracer, meter and logger name; it matches config.kdl `portal.service-name`,
 * which names the process (`@astra/observe/register`). */
export const SERVICE_NAME = "astra.portal";

/** The path the Foundry module dials (`wss://<public-origin><BRIDGE_WS_PATH>`). */
export const BRIDGE_WS_PATH = "/ws";

/** The path the Streamable-HTTP MCP server listens on. */
export const MCP_HTTP_PATH = "/mcp";

/** The one OAuth-flow path portal itself owns — `/authorize`,
 * `/token`, `/register`, `/revoke`, and every `/.well-known/*` metadata path are
 * mounted by the MCP SDK's own `mcpAuthRouter` (see `oauth.ts`); this is the astra-
 * authored consent-form POST route the SDK knows nothing about. Shared between
 * `server.ts` (dispatch) and `oauth.ts` (the form's `action=`), same pattern as
 * `MCP_HTTP_PATH`. */
export const OAUTH_CONSENT_PATH = "/consent";
