/**
 * The bridge wire envelope — every message shape that crosses the module<->
 * portal-server WebSocket (spec 0023 D4 "a WebSocket server the module dials" / D6
 * "two-hop key auth"). Both sides (the Foundry module + portal-server) import this
 * package so the contract can't drift between them.
 *
 * KDL-at-the-edges' sibling rule for the wire: parse into these schemas immediately
 * on receipt, never thread a raw JSON-parsed blob through bridge/tool code.
 */
import { z } from "zod";

/**
 * Typed reasons an MCP tool call can fail (D6 auth, D8 write-gate, liveness). Every
 * denial/failure path in portal-server + the module must map to one of these — never
 * a bare string — so an MCP client can branch on `error.code`.
 */
export const BridgeErrorCode = z.enum([
  "bridge-offline", // no Foundry module currently connected (the liveness constraint)
  "unauthorized", // wrong/missing mcp-api-key or bridge-api-key
  "not-gm", // the connected Foundry session isn't a GM (D8 write gate)
  "writes-disabled", // the module's allow-write-operations setting is off
  "cap-exceeded", // max-creates-per-request exceeded (D8)
  "timeout", // the module didn't answer a query within the bridge timeout
  "not-found", // a read resolved no such document (e.g. a bad get-document uuid) — a
  // normal, branchable outcome, not a generic Foundry-side failure (S4)
  "foundry-error", // the module's Foundry-side call itself threw
  "not-portal-created", // delete-document refused a document not stamped
  // flags["astra-portal"].created — portal can only clean up after itself (0026 D-4/D-6)
  "validation-failed", // a pf2e DataModel rejected the payload (DataModelValidationError,
  // Foundry's message preserved verbatim) or a known-derived PC path was targeted (0026 D-7/D-10)
  "execution-failed", // execute-macro's script/chat macro threw at runtime (0026 D-9);
  // the thrown error's message is preserved, distinct from the module dispatch itself failing
]);
export type BridgeErrorCode = z.infer<typeof BridgeErrorCode>;

/**
 * World/system identity the module already knows at handshake time — sent so
 * `bridge-status` (the S3 acceptance) can report world/system/version with no extra
 * bridge round-trip. Optional: an older/mid-upgrade module build that doesn't send it
 * yet must still authenticate cleanly (BridgeStatus just carries less).
 */
export const AuthMeta = z
  .object({
    worldId: z.string().optional(),
    world: z.string().optional(),
    system: z.string().optional(),
    systemVersion: z.string().optional(),
    foundryVersion: z.string().optional(),
  })
  .strict();
export type AuthMeta = z.infer<typeof AuthMeta>;

/** The module's handshake immediately after dialing the bridge WS (D6). */
export const AuthMsg = z
  .object({
    type: z.literal("auth"),
    apiKey: z.string().min(1),
    meta: AuthMeta.optional(),
  })
  .strict();
export type AuthMsg = z.infer<typeof AuthMsg>;

/** Heartbeat, either direction. */
export const PingMsg = z.object({ type: z.literal("ping") }).strict();
export type PingMsg = z.infer<typeof PingMsg>;

export const PongMsg = z.object({ type: z.literal("pong") }).strict();
export type PongMsg = z.infer<typeof PongMsg>;

/** Server -> module: a correlation-id'd tool call to run against the live world. */
export const McpQuery = z
  .object({
    type: z.literal("query"),
    id: z.string().min(1), // correlation id — the response echoes it back
    method: z.string().min(1), // e.g. "portal.ping", "portal.search-compendium"
    params: z.unknown().optional(),
  })
  .strict();
export type McpQuery = z.infer<typeof McpQuery>;

const McpResponseOk = z
  .object({
    type: z.literal("response"),
    id: z.string().min(1),
    ok: z.literal(true),
    result: z.unknown(),
  })
  .strict();

const McpResponseErr = z
  .object({
    type: z.literal("response"),
    id: z.string().min(1),
    ok: z.literal(false),
    error: z
      .object({
        code: BridgeErrorCode,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

/** Module -> server: the outcome of a dispatched `McpQuery`, keyed by the same id. */
export const McpResponse = z.discriminatedUnion("ok", [McpResponseOk, McpResponseErr]);
export type McpResponse = z.infer<typeof McpResponse>;

/**
 * The full bridge wire envelope. A `Map<id, {resolve,reject,timeout}>` request
 * tracker (S2) keys off `McpQuery.id`/`McpResponse.id`; everything else is
 * connection-lifecycle (`auth`/`ping`/`pong`).
 */
export const BridgeMessage = z.discriminatedUnion("type", [
  AuthMsg,
  PingMsg,
  PongMsg,
  McpQuery,
  McpResponse,
]);
export type BridgeMessage = z.infer<typeof BridgeMessage>;
