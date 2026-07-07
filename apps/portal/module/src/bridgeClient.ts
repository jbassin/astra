/**
 * The Foundry-side half of the bridge (spec 0023 D1/D6/S3): dials portal-server's WS,
 * sends the `{type:"auth",apiKey,meta}` handshake, answers heartbeat pings, and routes
 * `query` messages to an injected `dispatch` function, wrapping the result/error into a
 * `McpResponse`.
 *
 * Every environment touchpoint is an injected dependency (`BridgeClientOptions`)
 * instead of a direct reference to the real Foundry/browser globals — so the whole
 * wire-parsing/dispatch/reconnect state machine is unit-testable with a fake
 * `WebSocket` and fake timers, with zero Foundry runtime involved (S3's Foundry-free
 * constraint). `main.ts` supplies the real `WebSocket` global + `handlers.ts`'s
 * `dispatchQuery` (which DOES touch `game`/`CONFIG`) on the `ready` hook.
 */
import { BridgeMessage, type AuthMsg, type BridgeErrorCode } from "@astra/portal-shared";

/** First reconnect delay. */
const BASE_BACKOFF_MS = 1_000;
/** Reconnect delay never grows past this (the GM's tab may outlive a portal restart by
 * hours — no point retrying every 30s+ faster once it's clearly not coming right back,
 * but no point ever giving up either). */
const MAX_BACKOFF_MS = 30_000;
/** A socket that stayed open at least this long counts as "was healthy" — its close is
 * a fresh outage (portal restart, network flap), so the next retry starts from base.
 * A shorter-lived socket (wrong key → the server's near-instant policy close; an
 * unreachable host) keeps climbing instead — without this, a misconfigured key would
 * reconnect-hammer the server at ~1/s forever (open resets, close follows instantly). */
const HEALTHY_HOLD_MS = 10_000;

export type LogLevel = "info" | "warn" | "error";
export type LogFn = (level: LogLevel, message: string) => void;

/** The slice of the real `WebSocket` instance API `BridgeClient` needs — the browser
 * global satisfies this directly (`main.ts` passes `(url) => new WebSocket(url)` with
 * no cast needed); tests supply a fake implementing just this. `addEventListener`, not
 * `on<event> =` property assignment: assigning the `on<event>` properties directly
 * doesn't typecheck against the real `WebSocket` here (its property types are DOM's
 * richer `Event`/`MessageEvent`, which fails `strictFunctionTypes`), and it's the
 * lint-preferred idiom (unicorn/prefer-add-event-listener) besides. */
export interface MinimalWebSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "close" | "error", listener: () => void): void;
  addEventListener(type: "message", listener: (ev: { data: string }) => void): void;
}

export type WebSocketFactory = (url: string) => MinimalWebSocket;

/** Shape `dispatch` may reject with to control the wire error code precisely (this is
 * what `handlers.ts`'s `BridgeHandlerError` satisfies structurally — `bridgeClient.ts`
 * deliberately doesn't import that class, so it stays decoupled from any particular
 * handler-registry implementation). Anything else thrown maps to `foundry-error`. */
export interface DispatchError {
  code: BridgeErrorCode;
  message: string;
}

function isDispatchError(err: unknown): err is DispatchError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

// Wrapped rather than referenced directly: the ambient `setTimeout`/`clearTimeout`
// globals resolve to Node's `NodeJS.Timeout`-returning overload here (this tsconfig's
// base `types: ["node"]` sits alongside the DOM lib this browser-run module also
// needs — see tsconfig.json), which doesn't structurally match the `unknown`-typed
// injection seam `BridgeClientOptions` exposes for tests. The one-line cast back on
// the way into `clearTimeout` is safe: the handle only ever came from our own
// `defaultSetTimeout` call.
const defaultSetTimeout: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms);
const defaultClearTimeout: (handle: unknown) => void = (handle) => {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
};

export interface BridgeClientOptions {
  /** `wss://<portal public-origin>/ws` — the module's `ws-url` setting. */
  wsUrl: string;
  /** The D6 module->server handshake secret — the module's `bridge-api-key` setting. */
  apiKey: string;
  /** Called fresh on every connect attempt (so a `main.ts` that re-reads `game.world`
   * etc. each time never ships a stale snapshot, even though in practice these don't
   * change mid-session). */
  meta: () => AuthMsg["meta"];
  /** Handles one dispatched `query` (`msg.method`, already carrying the `portal.`
   * prefix, and `msg.params` verbatim). Reject with a {@link DispatchError}-shaped
   * value to control the response's `error.code`; anything else maps to
   * `foundry-error`. */
  dispatch: (method: string, params: unknown) => Promise<unknown>;
  /** The real `WebSocket` constructor in production; a fake in tests. */
  createWebSocket: WebSocketFactory;
  log?: LogFn;
  /** Injectable timer functions — production uses the real globals; tests use
   * `vi.useFakeTimers()` (which patches the same globals, so these defaults suffice
   * there too — the params exist for tests that want an isolated fake instead). */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  /** Injectable clock (for the healthy-hold backoff reset); defaults to `Date.now`. */
  nowFn?: () => number;
}

/**
 * Dials `wsUrl` forever, reconnecting with capped exponential backoff on every close
 * (a real `WebSocket` always follows an `error` with a `close`, so hooking only `close`
 * to schedule the reconnect is sufficient and avoids double-scheduling). Call
 * {@link start} once; {@link stop} tears down the live socket and cancels any pending
 * reconnect timer.
 */
export class BridgeClient {
  readonly #opts: BridgeClientOptions;
  #ws: MinimalWebSocket | null = null;
  #backoffMs = BASE_BACKOFF_MS;
  #reconnectHandle: unknown = null;
  #stopped = true;
  #openedAt: number | null = null;

  constructor(opts: BridgeClientOptions) {
    this.#opts = opts;
  }

  start(): void {
    this.#stopped = false;
    this.#connect();
  }

  /** Tears down the live socket (if any) and cancels a pending reconnect. Idempotent.
   * Doesn't bother detaching the `close` listener first — `#scheduleReconnect` already
   * no-ops once `#stopped` is set, so the ensuing `close` event (if any) is harmless. */
  stop(): void {
    this.#stopped = true;
    const clear = this.#opts.clearTimeoutFn ?? defaultClearTimeout;
    if (this.#reconnectHandle !== null) clear(this.#reconnectHandle);
    this.#reconnectHandle = null;
    const ws = this.#ws;
    this.#ws = null;
    ws?.close();
  }

  #log(level: LogLevel, message: string): void {
    this.#opts.log?.(level, `bridge client: ${message}`);
  }

  #connect(): void {
    const ws = this.#opts.createWebSocket(this.#opts.wsUrl);
    this.#ws = ws;

    ws.addEventListener("open", () => {
      // The bridge sends no ack for `auth` (bridge.ts adopts the socket silently), so
      // there is no direct "handshake succeeded" signal client-side. Instead the close
      // handler resets the backoff only if the socket survived HEALTHY_HOLD_MS — see
      // that constant for why open-resets would let a wrong key hammer the server.
      this.#openedAt = this.#now();
      const auth: AuthMsg = {
        type: "auth",
        apiKey: this.#opts.apiKey,
        meta: this.#opts.meta(),
      };
      ws.send(JSON.stringify(auth));
    });

    ws.addEventListener("message", (ev) => {
      void this.#onMessage(ev.data);
    });

    ws.addEventListener("error", () => {
      this.#log("warn", "socket error (the ensuing close drives reconnect)");
    });

    ws.addEventListener("close", () => {
      if (this.#ws === ws) this.#ws = null;
      // Healthy-hold backoff reset — see HEALTHY_HOLD_MS.
      if (this.#openedAt !== null && this.#now() - this.#openedAt >= HEALTHY_HOLD_MS) {
        this.#backoffMs = BASE_BACKOFF_MS;
      }
      this.#openedAt = null;
      this.#scheduleReconnect();
    });
  }

  #now(): number {
    return (this.#opts.nowFn ?? Date.now)();
  }

  #scheduleReconnect(): void {
    if (this.#stopped) return;
    const delay = this.#backoffMs;
    this.#backoffMs = Math.min(this.#backoffMs * 2, MAX_BACKOFF_MS);
    this.#log("info", `reconnecting in ${delay}ms`);
    const set = this.#opts.setTimeoutFn ?? defaultSetTimeout;
    this.#reconnectHandle = set(() => {
      this.#reconnectHandle = null;
      this.#connect();
    }, delay);
  }

  async #onMessage(raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.#log("warn", `received unparseable message: ${raw}`);
      return;
    }
    const parsed = BridgeMessage.safeParse(json);
    if (!parsed.success) {
      this.#log("warn", `received an invalid bridge message: ${raw}`);
      return;
    }
    const msg = parsed.data;
    switch (msg.type) {
      case "ping":
        this.#send({ type: "pong" });
        return;
      case "query":
        await this.#handleQuery(msg.id, msg.method, msg.params);
        return;
      case "auth":
      case "pong":
      case "response":
        // Never sent server->module on this wire (see bridge.ts's mirror-image
        // switch) — ignore rather than throw.
        return;
    }
  }

  async #handleQuery(id: string, method: string, params: unknown): Promise<void> {
    try {
      const result = await this.#opts.dispatch(method, params);
      this.#send({ type: "response", id, ok: true, result });
    } catch (err) {
      const { code, message }: DispatchError = isDispatchError(err)
        ? err
        : { code: "foundry-error", message: err instanceof Error ? err.message : String(err) };
      this.#send({ type: "response", id, ok: false, error: { code, message } });
    }
  }

  #send(msg: BridgeMessage): void {
    this.#ws?.send(JSON.stringify(msg));
  }
}
