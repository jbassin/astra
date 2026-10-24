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
  "not-designated", // dispatchQuery's defense-in-depth refusal when bridge-user-id is set
  // and this session isn't the matching user (0027 D27-2/D27-9) — distinct from "not-gm"
  // because the session IS a GM, just not the one designated to dial
  "not-a-player-character", // query-player's D28-4 predicate refused a resolved actor
  // whose type isn't "character"/"familiar" (an npc/party/loot/vehicle/hazard uuid)
  "ambiguous-name", // query-player's D28-13 name resolution matched more than one
  // candidate (neither an exact nor an unambiguous-prefix match) — the error message
  // lists the candidates so the caller can retry with a uuid instead
  "bridge-replaced", // the query was in flight on a bridge socket that a newer socket
  // for the same Foundry user replaced (a GM tab reload mid-call); retry it (SVC-18)
]);
export type BridgeErrorCode = z.infer<typeof BridgeErrorCode>;

/**
 * World/system identity the module already knows at handshake time — sent so
 * `bridge-status` (the S3 acceptance) can report world/system/version with no extra
 * bridge round-trip. Optional: an older/mid-upgrade module build that doesn't send it
 * yet must still authenticate cleanly (BridgeStatus just carries less).
 *
 * `userId`/`userName` (0027 D27-8) are the connected Foundry user's identity — also
 * optional for the same reason, and the mechanism that lets `bridge-status` prove
 * *which* session (e.g. the headless "Portal" account) holds the bridge.
 */
export const AuthMeta = z
  .object({
    worldId: z.string().optional(),
    world: z.string().optional(),
    system: z.string().optional(),
    systemVersion: z.string().optional(),
    foundryVersion: z.string().optional(),
    userId: z.string().optional(),
    userName: z.string().optional(),
  })
  .strict();
export type AuthMeta = z.infer<typeof AuthMeta>;

/**
 * The portal release version: the module's `module.json` `version` (a test pins the two
 * together), the `McpServer` version, and the `serverVersion` in `auth-ok`. Bump it on
 * every portal release; Foundry's update check compares `module.json`'s copy.
 */
export const PORTAL_VERSION = "0.5.0";

/**
 * The bridge protocol version this build speaks. The module sends it in `auth`; the
 * server accepts `[MIN_BRIDGE_PROTOCOL, BRIDGE_PROTOCOL]` and closes anything else with
 * {@link BridgeCloseCode.protocolMismatch}. Bump it on any envelope change an older peer
 * cannot parse. Protocol 0 is the unversioned handshake of module 0.4.x and earlier (no
 * `protocol` field).
 */
export const BRIDGE_PROTOCOL = 1;

/**
 * The oldest protocol the server still accepts. 0 keeps the installed 0.4.x module
 * working through the 0.5.0 rollout (a WARN on every legacy handshake); the next release
 * raises it to 1, after which the server closes a 0.4.x module as stale.
 */
export const MIN_BRIDGE_PROTOCOL = 0;

/**
 * WebSocket close codes the server uses for every bridge refusal, so the module (and a
 * human reading its console) can tell a wrong key from version skew from a lost
 * designation race. 4000-4999 is the RFC 6455 application range; shutdown uses the
 * standard 1001 "going away".
 */
export const BridgeCloseCode = {
  /** Wrong bridge key, or a handshake that isn't a well-formed `auth` message. */
  unauthorized: 4001,
  /** Protocol outside the server's accepted range; the reason says which side is stale. */
  protocolMismatch: 4002,
  /** The server's `portal.bridge-user-id` names a different Foundry user. */
  notDesignated: 4003,
  /** A newer socket for the same Foundry user took over (tab reload); don't redial. */
  replaced: 4004,
  /** No `auth` message arrived within the auth window. */
  authTimeout: 4005,
  /** No designation is configured and another user already holds the bridge. */
  busy: 4006,
  /** The server is shutting down; redial normally. */
  serverShutdown: 1001,
} as const;
export type BridgeCloseCode = (typeof BridgeCloseCode)[keyof typeof BridgeCloseCode];

/** The close reasons that go with {@link BridgeCloseCode.protocolMismatch}. */
export const PROTOCOL_MISMATCH_MODULE_STALE = "module-stale";
export const PROTOCOL_MISMATCH_SERVER_STALE = "server-stale";

/**
 * The module's handshake immediately after dialing the bridge WS (D6). `protocol` and
 * `moduleVersion` are absent only from a legacy (protocol 0, module 0.4.x) build.
 */
export const AuthMsg = z
  .object({
    type: z.literal("auth"),
    apiKey: z.string().min(1),
    protocol: z.number().int().nonnegative().optional(),
    moduleVersion: z.string().min(1).optional(),
    meta: AuthMeta.optional(),
  })
  .strict();
export type AuthMsg = z.infer<typeof AuthMsg>;

/**
 * The server reads only these two fields first, so version skew is reported as
 * {@link BridgeCloseCode.protocolMismatch} even when the rest of the message has a shape
 * this build cannot parse (the old "skew looks like a bad key" bug). Not strict on
 * purpose.
 */
export const AuthProbe = z.object({
  type: z.literal("auth"),
  protocol: z.number().int().nonnegative().optional(),
});
export type AuthProbe = z.infer<typeof AuthProbe>;

/** Server -> module: the handshake succeeded and this socket is now the bridge. Sent
 * only to a versioned module (a legacy one would log it as an invalid message). */
export const AuthOkMsg = z
  .object({
    type: z.literal("auth-ok"),
    protocol: z.number().int().nonnegative(),
    serverVersion: z.string().min(1),
  })
  .strict();
export type AuthOkMsg = z.infer<typeof AuthOkMsg>;

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
 * D28-14's skew-recovery shape: a well-formed error `response` envelope whose
 * `error.code` ISN'T one of `BridgeErrorCode`'s closed enum members — the exact
 * shape a 0.4.0+ module sends when it returns a code this build's `BridgeErrorCode`
 * doesn't know yet (e.g. a rolled-back pre-0028 server talking to a 0.4.0 module
 * that returns `not-a-player-character`/`ambiguous-name`). `code` is only checked
 * for being a non-empty string here — {@link McpResponseErr}'s stricter `code:
 * BridgeErrorCode` already covers every KNOWN code, so this schema only ever
 * matches after that one has already failed to parse. `server/src/bridge.ts`'s
 * `#onMessage` tries this as a second-chance parse and remaps the code to a
 * generic `foundry-error` (message preserved) instead of silently dropping the
 * message into a timeout. */
export const McpResponseErrUnknownCode = z
  .object({
    type: z.literal("response"),
    id: z.string().min(1),
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  })
  .strict();
export type McpResponseErrUnknownCode = z.infer<typeof McpResponseErrUnknownCode>;

/**
 * The full bridge wire envelope. A `Map<id, {resolve,reject,timeout}>` request
 * tracker (S2) keys off `McpQuery.id`/`McpResponse.id`; everything else is
 * connection-lifecycle (`auth`/`ping`/`pong`).
 */
export const BridgeMessage = z.discriminatedUnion("type", [
  AuthMsg,
  AuthOkMsg,
  PingMsg,
  PongMsg,
  McpQuery,
  McpResponse,
]);
export type BridgeMessage = z.infer<typeof BridgeMessage>;
