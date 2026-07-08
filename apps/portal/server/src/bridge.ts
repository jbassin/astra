/**
 * The Foundry-module bridge (spec 0023 D4/D6) — a `ws` WebSocketServer mounted on the
 * portal HTTP server at {@link BRIDGE_WS_PATH}. The Foundry module (S3) dials this,
 * completes a one-shot `{type:"auth",apiKey}` handshake (D6's module→server hop), and
 * from then on answers correlation-id'd {@link McpQuery}/{@link McpResponse} pairs the
 * MCP tool layer (`mcp.ts`) issues via {@link Bridge.sendQuery}.
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
  BridgeMessage,
  type AuthMeta,
  type BridgeErrorCode,
  type McpQuery,
  type McpResponse,
} from "@astra/portal-shared";
import { SpanStatusCode } from "@opentelemetry/api";
import { WebSocket, WebSocketServer } from "ws";

import { BRIDGE_WS_PATH, SERVICE_NAME } from "./constants";

const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);

// Metrics via lazyCounter/lazyHistogram ONLY — a module-scope `getMeter().createCounter()`
// call is a PERMANENT no-op if it runs before `initTelemetry` (it does, under ESM import
// hoisting — see [[telemetry-coverage-pass]]); these defer instrument creation to first use.
const bridgeConnects = lazyCounter(SERVICE_NAME, "astra.portal.bridge.connects", {
  description: "Foundry module bridge WS handshakes that authenticated successfully",
});
const bridgeDisconnects = lazyCounter(SERVICE_NAME, "astra.portal.bridge.disconnects", {
  description: "Foundry module bridge disconnects, by cause",
});
const authRejections = lazyCounter(SERVICE_NAME, "astra.portal.bridge.auth_rejections", {
  description: "Bridge WS handshakes rejected, by reason (bad-key, timeout)",
});
const queryDuration = lazyHistogram(SERVICE_NAME, "astra.portal.bridge.query_duration_ms", {
  description: "Round-trip duration of a bridge query, by outcome (ok, error, timeout, offline)",
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

/** Liveness + handshake snapshot for the `bridge-status` tool. `worldId`/`world`/
 * `system`/`systemVersion`/`foundryVersion`/`userId`/`userName` come straight from the
 * module's auth `meta` (optional — an older module build that doesn't send them yet
 * just leaves these absent, same as pre-S3). `userId`/`userName` (0027 D27-8) are what
 * lets `bridge-status` prove which Foundry session — e.g. the headless "Portal"
 * account — currently holds the bridge. */
export interface BridgeStatus {
  connected: boolean;
  worldId?: string;
  world?: string;
  system?: string;
  systemVersion?: string;
  foundryVersion?: string;
  userId?: string;
  userName?: string;
}

export interface BridgeOptions {
  /** `cfg.portal.bridgeApiKey.resolve()` — the module's handshake secret (D6). */
  bridgeApiKey: string;
  /** `cfg.portal.bridgeTimeoutMs` — how long {@link Bridge.sendQuery} waits for a reply. */
  queryTimeoutMs: number;
  /** How long an unauthenticated socket has to send its `auth` message. */
  authWindowMs?: number;
  /** Heartbeat ping cadence; a missed pong marks the bridge offline within one more tick. */
  heartbeatIntervalMs?: number;
}

interface ResolvedBridgeOptions extends Required<
  Omit<BridgeOptions, "bridgeApiKey" | "queryTimeoutMs">
> {
  bridgeApiKey: string;
  queryTimeoutMs: number;
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: BridgeError) => void;
  timeout: NodeJS.Timeout;
  start: number;
}

const DEFAULT_AUTH_WINDOW_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
/** WS close code: policy violation (RFC 6455 §7.4.1) — used for every auth rejection. */
const CLOSE_POLICY_VIOLATION = 1008;

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The bridge. Only one authenticated socket is ever "the Foundry connection": a second
 * authed handshake **replaces** the first rather than being rejected — a GM reloading
 * their browser tab should reconnect cleanly and immediately, not wait out the dead
 * socket's heartbeat window (the module has no way to gracefully hand off on reload, so
 * replace is the only option that doesn't strand the new tab behind a stale timeout).
 */
export class Bridge {
  readonly #wss: WebSocketServer;
  readonly #opts: ResolvedBridgeOptions;
  #socket: WebSocket | null = null;
  #status: BridgeStatus = { connected: false };
  readonly #pending = new Map<string, Pending>();
  #heartbeat: NodeJS.Timeout | null = null;
  #awaitingPong = false;

  constructor(opts: BridgeOptions) {
    this.#opts = {
      authWindowMs: DEFAULT_AUTH_WINDOW_MS,
      heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
      ...opts,
    };
    this.#wss = new WebSocketServer({ noServer: true });
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

  #onConnection(ws: WebSocket): void {
    ws.on("error", () => {
      /* swallowed pre-auth — the close handler below covers cleanup */
    });

    let authed = false;
    const authTimer = setTimeout(() => {
      if (authed) return;
      authRejections.add(1, { reason: "timeout" });
      ws.close(CLOSE_POLICY_VIOLATION, "auth timeout");
    }, this.#opts.authWindowMs);

    ws.once("message", (data: WebSocket.RawData) => {
      const parsed = BridgeMessage.safeParse(safeJsonParse(data.toString()));
      if (
        !parsed.success ||
        parsed.data.type !== "auth" ||
        parsed.data.apiKey !== this.#opts.bridgeApiKey
      ) {
        authRejections.add(1, { reason: "bad-key" });
        clearTimeout(authTimer);
        ws.close(CLOSE_POLICY_VIOLATION, "unauthorized");
        return;
      }
      authed = true;
      clearTimeout(authTimer);
      this.#adopt(ws, parsed.data.meta);
    });
  }

  #adopt(ws: WebSocket, meta?: AuthMeta): void {
    // A second authed socket REPLACES the first — see the class docstring.
    const prior = this.#socket;
    if (prior && prior !== ws) {
      prior.removeAllListeners();
      prior.terminate();
    }
    this.#socket = ws;
    this.#status = { connected: true, ...meta };
    bridgeConnects.add(1);
    log.emit({ severityText: "INFO", body: "foundry module bridge connected" });
    this.#startHeartbeat();

    ws.on("error", () => {
      /* the ensuing "close" event drives #onDisconnect */
    });
    ws.on("message", (data: WebSocket.RawData) => this.#onMessage(data));
    ws.on("close", () => this.#onDisconnect(ws));
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

  #onMessage(data: WebSocket.RawData): void {
    const parsed = BridgeMessage.safeParse(safeJsonParse(data.toString()));
    if (!parsed.success) {
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
        if (this.#socket) this.#send(this.#socket, { type: "pong" });
        return;
      case "response":
        this.#onResponse(msg);
        return;
      case "auth":
      case "query":
        // Neither arrives post-handshake in this direction; ignore rather than throw.
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
    this.#status = { connected: false };
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    bridgeDisconnects.add(1);
    log.emit({ severityText: "INFO", body: "foundry module bridge disconnected" });
    this.#rejectAllPending(new BridgeError("bridge-offline", "the Foundry module disconnected"));
  }

  #rejectAllPending(err: BridgeError): void {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timeout);
      queryDuration.record(Date.now() - pending.start, { outcome: "offline" });
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
   * reply, `bridge-offline` for every still-pending query if the module disconnects
   * mid-flight, or whatever typed code the module's own response carries.
   */
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
          this.#pending.set(id, { resolve, reject, timeout, start });
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

  /** Test/shutdown teardown: terminates any live socket and stops the WS server. */
  close(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#socket?.terminate();
    this.#wss.close();
  }
}
