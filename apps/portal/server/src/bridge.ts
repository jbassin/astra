/**
 * The Foundry-module bridge (spec 0023 D4/D6) — a `ws` WebSocketServer mounted on the
 * portal HTTP server at {@link BRIDGE_WS_PATH}. The Foundry module (S3) dials this,
 * completes a one-shot versioned `{type:"auth",apiKey,protocol}` handshake (D6's
 * module→server hop), gets an `auth-ok` back, and from then on answers correlation-id'd
 * {@link McpQuery}/{@link McpResponse} pairs the MCP tool layer (`mcp.ts`) issues via
 * {@link Bridge.sendQuery}.
 *
 * The handshake checks run in a fixed order, each with its own close code
 * ({@link BridgeCloseCode}): protocol version first (so skew never looks like a bad key),
 * then the key, then designation (the server, not the module, decides which Foundry
 * user holds the bridge).
 *
 * Every message crossing the wire is parsed through `BridgeMessage` immediately (KDL-
 * at-the-edges' sibling rule) — nothing downstream ever sees a raw JSON blob. Every
 * denial/failure path resolves to a typed {@link BridgeErrorCode}, never a bare string,
 * so an MCP client can branch on `error.code` (liveness must surface as a typed
 * "offline", never a hang — spec Risks).
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { getLogger, getTracer, lazyCounter, lazyHistogram } from "@astra/observe";
import {
  AuthMsg,
  AuthProbe,
  BRIDGE_PROTOCOL,
  BridgeCloseCode,
  BridgeMessage,
  MIN_BRIDGE_PROTOCOL,
  McpResponseErrUnknownCode,
  PORTAL_VERSION,
  PROTOCOL_MISMATCH_MODULE_STALE,
  PROTOCOL_MISMATCH_SERVER_STALE,
  type BridgeErrorCode,
  type BridgeStatusResult,
  type McpQuery,
  type McpResponse,
} from "@astra/portal-shared";
import { SpanStatusCode } from "@opentelemetry/api";
import { WebSocket, WebSocketServer } from "ws";

import { BRIDGE_WS_PATH, SERVICE_NAME } from "./constants";
import { constantTimeEquals } from "./oauth";

const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);

// Metrics via lazyCounter/lazyHistogram (the TS convention): they bind on first use, so
// the module is safe to import with or without installed telemetry.
const bridgeConnects = lazyCounter(SERVICE_NAME, "astra.portal.bridge.connects", {
  description: "Foundry module bridge WS handshakes that authenticated, by protocol",
});
const bridgeDisconnects = lazyCounter(SERVICE_NAME, "astra.portal.bridge.disconnects", {
  description: "Foundry module bridge disconnects, by cause (closed, replaced)",
});
const authRejections = lazyCounter(SERVICE_NAME, "astra.portal.bridge.auth_rejections", {
  description:
    "Bridge WS handshakes rejected, by reason (bad-key, malformed, timeout, module-stale, " +
    "server-stale, not-designated, busy)",
});
const queryDuration = lazyHistogram(SERVICE_NAME, "astra.portal.bridge.query_duration_ms", {
  description:
    "Round-trip duration of a bridge query, by outcome (ok, error, timeout, offline, replaced)",
  unit: "ms",
});

/** Typed bridge failure — see {@link BridgeErrorCode} for the full reason set. */
export class BridgeError extends Error {
  readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BridgeError";
    this.code = code;
  }
}

/** Liveness + handshake snapshot for the `bridge-status` tool; the schema lives in the
 * tool registry (`BridgeStatusResult` in `@astra/portal-shared`). */
export type BridgeStatus = BridgeStatusResult;

export interface BridgeOptions {
  /** `cfg.portal.bridgeApiKey.resolve()` — the module's handshake secret (D6). */
  bridgeApiKey: string;
  /** `cfg.portal.bridgeTimeoutMs` — how long {@link Bridge.sendQuery} waits for a reply. */
  queryTimeoutMs: number;
  /** `cfg.portal.bridgeUserId` — the one Foundry user id allowed to hold the bridge.
   * Empty or absent: no designation; the first connected user keeps it until it drops. */
  bridgeUserId?: string;
  /** Oldest protocol accepted; defaults to {@link MIN_BRIDGE_PROTOCOL}. Tests raise it to
   * exercise the stale-module path that production reaches once legacy support ends. */
  minProtocol?: number;
  /** How long an unauthenticated socket has to send its `auth` message. */
  authWindowMs?: number;
  /** Heartbeat ping cadence; a missed pong marks the bridge offline within one more tick. */
  heartbeatIntervalMs?: number;
}

interface ResolvedBridgeOptions {
  bridgeApiKey: string;
  queryTimeoutMs: number;
  bridgeUserId: string;
  minProtocol: number;
  authWindowMs: number;
  heartbeatIntervalMs: number;
}

interface Pending {
  /** The socket the query went out on: only that socket's close or replacement may
   * settle it early (SVC-18). */
  ws: WebSocket;
  resolve: (result: unknown) => void;
  reject: (err: BridgeError) => void;
  timeout: NodeJS.Timeout;
  start: number;
}

const DEFAULT_AUTH_WINDOW_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
/** The largest bridge frame accepted (ws closes a bigger one with 1009). The biggest
 * legitimate messages are module results: `get-document` returns a whole document's
 * source, and a large pf2e NPC or PC with its embedded items and spells runs to about
 * 1-2 MB of JSON. 8 MiB leaves 4x headroom over that, against the ws default of 100 MiB
 * on a public endpoint. */
export const MAX_BRIDGE_PAYLOAD_BYTES = 8 * 1024 * 1024;
/** How much of an unauthenticated peer's parse error reaches the log. */
const MAX_LOGGED_DETAIL_CHARS = 200;

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * D28-14's skew fix: `#onMessage` only reaches this once `BridgeMessage.safeParse`
 * has ALREADY failed — so if the message is otherwise a well-formed error
 * `response` envelope (checked via {@link McpResponseErrUnknownCode}, which is
 * identical to `McpResponse`'s error variant except `error.code` is any non-empty
 * string instead of the closed `BridgeErrorCode` enum), the only thing wrong with
 * it is an unrecognized code — remap to a generic `foundry-error` (message
 * preserved verbatim) instead of the prior silent drop-to-timeout. Returns
 * `undefined` for anything else (a genuinely malformed message, a query/auth/ping
 * message that merely happens to be malformed, ...), which keeps `#onMessage`'s
 * normal "unparseable message" WARN path as the fallback.
 */
function recoverSkewedErrorResponse(
  raw: unknown,
): { response: McpResponse; originalCode: string } | undefined {
  const loose = McpResponseErrUnknownCode.safeParse(raw);
  if (!loose.success) return undefined;
  return {
    response: {
      type: "response",
      id: loose.data.id,
      ok: false,
      error: { code: "foundry-error", message: loose.data.error.message },
    },
    originalCode: loose.data.error.code,
  };
}

/**
 * The bridge. Only one authenticated socket is ever "the Foundry connection". Which one
 * is the server's call, never the module's:
 *
 * - With `bridgeUserId` set, only that Foundry user may connect; any other is closed
 *   with `notDesignated`.
 * - A new socket for the same user as the current one **replaces** it (a GM reloading
 *   their tab must reconnect at once, not wait out the dead socket's heartbeat). The old
 *   socket is closed with `replaced` and its in-flight queries fail with
 *   `bridge-replaced` instead of hanging until the timeout (SVC-18).
 * - A new socket for a different user while one is connected (possible only with no
 *   designation) is closed with `busy`, so two GM sessions can never take turns
 *   replacing each other.
 */
export class Bridge {
  readonly #wss: WebSocketServer;
  readonly #opts: ResolvedBridgeOptions;
  #socket: WebSocket | null = null;
  #socketUserId: string | undefined;
  #status: BridgeStatus = { connected: false };
  readonly #pending = new Map<string, Pending>();
  #heartbeat: NodeJS.Timeout | null = null;
  #awaitingPong = false;

  constructor(opts: BridgeOptions) {
    this.#opts = {
      bridgeApiKey: opts.bridgeApiKey,
      queryTimeoutMs: opts.queryTimeoutMs,
      bridgeUserId: opts.bridgeUserId ?? "",
      minProtocol: opts.minProtocol ?? MIN_BRIDGE_PROTOCOL,
      authWindowMs: opts.authWindowMs ?? DEFAULT_AUTH_WINDOW_MS,
      heartbeatIntervalMs: opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    };
    this.#wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BRIDGE_PAYLOAD_BYTES });
  }

  /** Wire the bridge's WS upgrade onto an HTTP server at {@link BRIDGE_WS_PATH}; upgrade
   * requests for any other path are left alone (not ours to handle). */
  attach(server: HttpServer): void {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      if (pathname !== BRIDGE_WS_PATH) return;
      this.#wss.handleUpgrade(req, socket, head, (ws) => this.#onConnection(ws));
    });
  }

  #reject(ws: WebSocket, code: BridgeCloseCode, reason: string, detail: string): void {
    authRejections.add(1, { reason });
    log.emit({
      severityText: "WARN",
      body: `bridge handshake refused (${code} ${reason}): ${detail}`,
      attributes: { "portal.bridge.close_code": code, "portal.bridge.close_reason": reason },
    });
    ws.close(code, reason);
  }

  #onConnection(ws: WebSocket): void {
    ws.on("error", () => {
      /* swallowed pre-auth — the close handler below covers cleanup */
    });

    let authed = false;
    const authTimer = setTimeout(() => {
      if (authed) return;
      this.#reject(ws, BridgeCloseCode.authTimeout, "timeout", "no auth message in time");
    }, this.#opts.authWindowMs);
    // A socket that closes before authenticating is not an auth timeout.
    ws.once("close", () => clearTimeout(authTimer));

    ws.once("message", (data: WebSocket.RawData) => {
      authed = true;
      clearTimeout(authTimer);
      this.#onHandshake(ws, safeJsonParse(data.toString()));
    });
  }

  #onHandshake(ws: WebSocket, raw: unknown): void {
    // 1. Protocol, read from the loosest possible shape so skew is never "bad key".
    const probe = AuthProbe.safeParse(raw);
    if (!probe.success) {
      this.#reject(ws, BridgeCloseCode.unauthorized, "malformed", "not an auth message");
      return;
    }
    const protocol = probe.data.protocol ?? 0;
    if (protocol < this.#opts.minProtocol) {
      this.#reject(
        ws,
        BridgeCloseCode.protocolMismatch,
        PROTOCOL_MISMATCH_MODULE_STALE,
        `module speaks protocol ${protocol}; this server needs ${this.#opts.minProtocol}` +
          `-${BRIDGE_PROTOCOL} — install the current module and reload`,
      );
      return;
    }
    if (protocol > BRIDGE_PROTOCOL) {
      this.#reject(
        ws,
        BridgeCloseCode.protocolMismatch,
        PROTOCOL_MISMATCH_SERVER_STALE,
        `module speaks protocol ${protocol}; this server (${PORTAL_VERSION}) speaks at most ` +
          `${BRIDGE_PROTOCOL} — deploy the matching server`,
      );
      return;
    }

    // 2. The key, against the full handshake schema of a protocol this build knows.
    const parsed = AuthMsg.safeParse(raw);
    if (!parsed.success) {
      // Unauthenticated input: log only a bounded prefix of the parse error.
      const detail = parsed.error.message.slice(0, MAX_LOGGED_DETAIL_CHARS);
      this.#reject(ws, BridgeCloseCode.unauthorized, "malformed", detail);
      return;
    }
    const auth = parsed.data;
    if (!constantTimeEquals(auth.apiKey, this.#opts.bridgeApiKey)) {
      this.#reject(ws, BridgeCloseCode.unauthorized, "bad-key", "wrong bridge api key");
      return;
    }

    // 3. Designation: the server decides who holds the bridge.
    const userId = auth.meta?.userId;
    const designated = this.#opts.bridgeUserId;
    if (designated && userId !== designated) {
      this.#reject(
        ws,
        BridgeCloseCode.notDesignated,
        "not-designated",
        `user "${userId ?? "(none)"}" (${auth.meta?.userName ?? "unknown"}) is not the ` +
          "designated bridge user (portal.bridge-user-id)",
      );
      return;
    }
    if (this.#socket && this.#socketUserId !== userId) {
      this.#reject(
        ws,
        BridgeCloseCode.busy,
        "busy",
        `user "${userId ?? "(none)"}" dialed while user "${this.#socketUserId ?? "(none)"}" ` +
          "holds the bridge and no portal.bridge-user-id is configured",
      );
      return;
    }

    if (auth.protocol === undefined) {
      log.emit({
        severityText: "WARN",
        body:
          "legacy (protocol 0) portal module connected — install module " +
          `${PORTAL_VERSION}; the next server release refuses protocol 0`,
      });
    }
    this.#adopt(ws, auth);
  }

  #adopt(ws: WebSocket, auth: AuthMsg): void {
    const prior = this.#socket;
    if (prior && prior !== ws) this.#replace(prior);
    this.#socket = ws;
    this.#socketUserId = auth.meta?.userId;
    this.#status = { connected: true, ...auth.meta };
    const protocol = auth.protocol ?? 0;
    bridgeConnects.add(1, { protocol });
    log.emit({
      severityText: "INFO",
      body:
        `foundry module bridge connected (protocol ${protocol}, module ` +
        `${auth.moduleVersion ?? "legacy"}, user ${auth.meta?.userName ?? "unknown"})`,
    });
    this.#startHeartbeat();

    ws.on("error", () => {
      /* the ensuing "close" event drives #onDisconnect */
    });
    ws.on("message", (data: WebSocket.RawData) => this.#onMessage(ws, data));
    ws.on("close", () => this.#onDisconnect(ws));
    // A legacy module would log `auth-ok` as an invalid message, so only a versioned
    // one gets it.
    if (auth.protocol !== undefined) {
      this.#send(ws, { type: "auth-ok", protocol: BRIDGE_PROTOCOL, serverVersion: PORTAL_VERSION });
    }
  }

  /** Retire a socket that a newer one for the same user replaced (SVC-18). */
  #replace(prior: WebSocket): void {
    prior.removeAllListeners();
    prior.on("error", () => {
      /* the socket is being retired; nothing is listening any more */
    });
    prior.close(BridgeCloseCode.replaced, "replaced");
    bridgeDisconnects.add(1, { cause: "replaced" });
    log.emit({
      severityText: "INFO",
      body: "foundry module bridge replaced by a newer socket for the same user",
    });
    this.#rejectPending(
      prior,
      new BridgeError(
        "bridge-replaced",
        "the bridge socket this query was sent on was replaced by a newer one (a Foundry " +
          "tab reload); retry the call",
      ),
      "replaced",
    );
  }

  #startHeartbeat(): void {
    // On a replace-adopt the prior socket's interval is still live — clear it or it
    // leaks AND double-pings the new socket (two offset intervals sharing
    // #awaitingPong can terminate a healthy connection on pong latency).
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#awaitingPong = false;
    this.#heartbeat = setInterval(() => {
      const ws = this.#socket;
      if (!ws) return;
      if (this.#awaitingPong) {
        log.emit({
          severityText: "WARN",
          body: "bridge heartbeat missed a pong — marking offline",
        });
        ws.terminate(); // -> "close" -> #onDisconnect
        return;
      }
      this.#awaitingPong = true;
      this.#send(ws, { type: "ping" });
    }, this.#opts.heartbeatIntervalMs);
  }

  #onMessage(ws: WebSocket, data: WebSocket.RawData): void {
    const raw = safeJsonParse(data.toString());
    const parsed = BridgeMessage.safeParse(raw);
    if (!parsed.success) {
      const recovered = recoverSkewedErrorResponse(raw);
      if (recovered) {
        log.emit({
          severityText: "WARN",
          body:
            `bridge received a response with an unknown error code "${recovered.originalCode}" ` +
            "— mapping to foundry-error (module/server version skew — D28-14)",
        });
        this.#onResponse(recovered.response);
        return;
      }
      log.emit({
        severityText: "WARN",
        body: `bridge received an unparseable message: ${String(data)}`,
      });
      return;
    }
    const msg = parsed.data;
    switch (msg.type) {
      case "pong":
        this.#awaitingPong = false;
        return;
      case "ping":
        // Be a good heartbeat citizen if the module ever pings first.
        this.#send(ws, { type: "pong" });
        return;
      case "response":
        this.#onResponse(msg);
        return;
      case "auth":
      case "auth-ok":
      case "query":
        // None arrives post-handshake in this direction; ignore rather than throw.
        return;
    }
  }

  #onResponse(msg: McpResponse): void {
    const pending = this.#pending.get(msg.id);
    if (!pending) return; // late/duplicate/unknown id — drop it
    this.#pending.delete(msg.id);
    clearTimeout(pending.timeout);
    queryDuration.record(Date.now() - pending.start, { outcome: msg.ok ? "ok" : "error" });
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new BridgeError(msg.error.code, msg.error.message));
  }

  #onDisconnect(ws: WebSocket): void {
    if (this.#socket !== ws) return; // a stale listener from an already-replaced socket
    this.#socket = null;
    this.#socketUserId = undefined;
    this.#status = { connected: false };
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    bridgeDisconnects.add(1, { cause: "closed" });
    log.emit({ severityText: "INFO", body: "foundry module bridge disconnected" });
    this.#rejectPending(
      ws,
      new BridgeError("bridge-offline", "the Foundry module disconnected"),
      "offline",
    );
  }

  /** Settle every query still waiting on `ws` with `err` (the socket is gone). */
  #rejectPending(ws: WebSocket, err: BridgeError, outcome: "offline" | "replaced"): void {
    for (const [id, pending] of this.#pending) {
      if (pending.ws !== ws) continue;
      clearTimeout(pending.timeout);
      queryDuration.record(Date.now() - pending.start, { outcome });
      pending.reject(err);
      this.#pending.delete(id);
    }
  }

  #send(ws: WebSocket, msg: BridgeMessage): void {
    ws.send(JSON.stringify(msg));
  }

  /** Current liveness snapshot for the `bridge-status` MCP tool. */
  getStatus(): BridgeStatus {
    return { ...this.#status };
  }

  /**
   * Dispatch a correlation-id'd query to the connected module. Resolves with the
   * module's `result`; rejects with a typed {@link BridgeError} — `bridge-offline`
   * immediately when no module is connected, `timeout` after `queryTimeoutMs` with no
   * reply, `bridge-offline` if the module disconnects mid-flight, `bridge-replaced` if a
   * newer socket replaces the one the query went out on, or whatever typed code the
   * module's own response carries.
   */
  // oxlint-disable-next-line require-await -- async so a throw reaches the caller as a rejection
  async sendQuery(method: string, params?: unknown): Promise<unknown> {
    return tracer.startActiveSpan("portal.bridge.query", async (span) => {
      span.setAttribute("portal.bridge.method", method);
      try {
        const ws = this.#socket;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new BridgeError("bridge-offline", "no Foundry module is connected");
        }
        const id = randomUUID();
        const start = Date.now();
        const result = await new Promise<unknown>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.#pending.delete(id);
            queryDuration.record(Date.now() - start, { outcome: "timeout" });
            reject(
              new BridgeError(
                "timeout",
                `bridge query "${method}" timed out after ${this.#opts.queryTimeoutMs}ms`,
              ),
            );
          }, this.#opts.queryTimeoutMs);
          this.#pending.set(id, { ws, resolve, reject, timeout, start });
          const query: McpQuery = { type: "query", id, method, params };
          this.#send(ws, query);
        });
        return result;
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /** Shutdown: closes the live socket with `serverShutdown` (the module redials
   * normally), fails its in-flight queries with `bridge-offline`, and stops the WS
   * server. */
  close(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    const ws = this.#socket;
    this.#socket = null;
    this.#socketUserId = undefined;
    this.#status = { connected: false };
    if (ws) {
      ws.removeAllListeners();
      ws.on("error", () => {
        /* shutting down */
      });
      ws.close(BridgeCloseCode.serverShutdown, "server-shutdown");
      this.#rejectPending(
        ws,
        new BridgeError("bridge-offline", "the portal server is shutting down"),
        "offline",
      );
    }
    this.#wss.close();
  }
}
