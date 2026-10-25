/**
 * The Foundry-side half of the bridge: dials portal-server's WS,
 * sends the versioned `{type:"auth",apiKey,protocol,moduleVersion,meta}` handshake,
 * waits for `auth-ok`, answers heartbeat pings, and routes `query` messages to an
 * injected `dispatch` function, wrapping the result/error into a `McpResponse`.
 *
 * The server refuses a handshake with a distinct close code ({@link BridgeCloseCode});
 * the close handler maps each code to what this client should do next (redial, back
 * off to the cap, or stop) and says why in the GM's console.
 *
 * Every environment touchpoint is an injected dependency (`BridgeClientOptions`)
 * instead of a direct reference to the real Foundry/browser globals — so the whole
 * wire-parsing/dispatch/reconnect state machine is unit-testable with a fake
 * `WebSocket` and fake timers, with zero Foundry runtime involved.
 * `main.ts` supplies the real `WebSocket` global + `handlers/index.ts`'s
 * `dispatchQuery` (which DOES touch `game`/`CONFIG`) on the `ready` hook.
 */
import {
  BRIDGE_PROTOCOL,
  BridgeCloseCode,
  BridgeErrorCode,
  BridgeMessage,
  PORTAL_VERSION,
  PROTOCOL_MISMATCH_MODULE_STALE,
  type AuthMsg,
} from "@astra/portal-shared";

/** First reconnect delay. */
const BASE_BACKOFF_MS = 1_000;
/** Reconnect delay never grows past this (the GM's tab may outlive a portal restart by
 * hours — no point retrying every 30s+ faster once it's clearly not coming right back,
 * but no point ever giving up either). */
const MAX_BACKOFF_MS = 30_000;

type LogLevel = "info" | "warn" | "error";
export type LogFn = (level: LogLevel, message: string) => void;

/** The close event fields this client reads (the DOM `CloseEvent` has both). */
export interface CloseInfo {
  code: number;
  reason: string;
}

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
  addEventListener(type: "open" | "error", listener: () => void): void;
  addEventListener(type: "close", listener: (ev: CloseInfo) => void): void;
  addEventListener(type: "message", listener: (ev: { data: string }) => void): void;
}

export type WebSocketFactory = (url: string) => MinimalWebSocket;

/** Shape `dispatch` may reject with to control the wire error code precisely (this is
 * what `BridgeError` from `@astra/portal-shared` satisfies structurally — `bridgeClient.ts`
 * deliberately doesn't import that class, so it stays decoupled from any particular
 * handler-registry implementation). Anything else thrown maps to `foundry-error`. */
interface DispatchError {
  code: BridgeErrorCode;
  message: string;
}

/** True only for a thrown value whose `code` is one of the wire's {@link BridgeErrorCode}
 * members: a Foundry or browser error carrying its own `code` (e.g. `"ENOENT"`) must map
 * to `foundry-error`, not reach the server as an unknown code. */
function isDispatchError(err: unknown): err is DispatchError {
  return (
    typeof err === "object" &&
    err !== null &&
    BridgeErrorCode.safeParse((err as { code?: unknown }).code).success &&
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
  /** The module->server handshake secret — the module's `bridge-api-key` setting. */
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
  /** Shows a message to the GM (Foundry's `ui.notifications`) for refusals a human has
   * to act on: a wrong key, a stale module or server. */
  notify?: LogFn;
  /** Injectable timer functions — production uses the real globals; tests use
   * `vi.useFakeTimers()` (which patches the same globals, so these defaults suffice
   * there too — the params exist for tests that want an isolated fake instead). */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/** What the close handler does after a given close. */
type CloseAction = "redial" | "slow" | "stop";

/**
 * Dials `wsUrl`, reconnecting with capped exponential backoff after each close (a real
 * `WebSocket` always follows an `error` with a `close`, so hooking only `close` to
 * schedule the reconnect is sufficient and avoids double-scheduling). The backoff
 * resets to base on `auth-ok`, so a refused handshake keeps climbing instead of
 * hammering the server. Call {@link start} once; {@link stop} tears down the live
 * socket and cancels any pending reconnect timer.
 */
export class BridgeClient {
  readonly #opts: BridgeClientOptions;
  #ws: MinimalWebSocket | null = null;
  #backoffMs = BASE_BACKOFF_MS;
  #reconnectHandle: unknown = null;
  #stopped = true;
  /** The last refusal reported, so a refusal repeated every 30 s logs only once. */
  #lastRefusal: string | null = null;

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
      const auth: AuthMsg = {
        type: "auth",
        apiKey: this.#opts.apiKey,
        protocol: BRIDGE_PROTOCOL,
        moduleVersion: PORTAL_VERSION,
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

    ws.addEventListener("close", (ev) => {
      if (this.#ws === ws) this.#ws = null;
      this.#onClose(ev);
    });
  }

  /** Maps a close code to the next step and reports a refusal once per distinct cause. */
  #onClose({ code, reason }: CloseInfo): void {
    const action = this.#classifyClose(code, reason);
    if (action === "stop") {
      this.#stopped = true;
      return;
    }
    if (action === "slow") this.#backoffMs = MAX_BACKOFF_MS;
    this.#scheduleReconnect();
  }

  #classifyClose(code: number, reason: string): CloseAction {
    switch (code) {
      case BridgeCloseCode.unauthorized:
        this.#refused(
          "error",
          `the portal server rejected the bridge key (${reason}). Check the "Portal bridge ` +
            'API key" module setting.',
          true,
        );
        return "slow";
      case BridgeCloseCode.protocolMismatch:
        if (reason === PROTOCOL_MISMATCH_MODULE_STALE) {
          this.#refused(
            "error",
            `the portal module (${PORTAL_VERSION}) is stale for this portal server. Update ` +
              "the module in Foundry, then reload (F5).", // decision-ids: ignore[code-in-parens] -- F5 is the browser reload key
            true,
          );
          return "stop";
        }
        this.#refused(
          "error",
          `the portal server is older than this module (${PORTAL_VERSION}, protocol ` +
            `${BRIDGE_PROTOCOL}). Deploy the matching server; retrying every 30 s.`,
          true,
        );
        return "slow";
      case BridgeCloseCode.notDesignated:
        this.#refused(
          "info",
          "the portal server designates a different Foundry user to hold the bridge " +
            "(portal.bridge-user-id); this session stays off it and retries every 30 s.",
        );
        return "slow";
      case BridgeCloseCode.busy:
        this.#refused("info", "another Foundry user holds the portal bridge; retrying every 30 s.");
        return "slow";
      case BridgeCloseCode.replaced:
        this.#refused(
          "warn",
          "a newer session for this Foundry user took over the portal bridge; retrying " +
            "every 30 s, so this tab takes it back if that session leaves.",
        );
        // Not "stop": the replacer may close (a tab opened briefly), and nothing else
        // would bring the headless session back. Two live sessions of one user then
        // trade the bridge at most every 30 s (last writer wins).
        return "slow";
      default:
        this.#lastRefusal = null;
        return "redial";
    }
  }

  #refused(level: LogLevel, message: string, notify = false): void {
    if (this.#lastRefusal === message) return;
    this.#lastRefusal = message;
    this.#log(level, message);
    if (notify) this.#opts.notify?.(level, `Portal: ${message}`);
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
      case "auth-ok":
        this.#backoffMs = BASE_BACKOFF_MS;
        this.#lastRefusal = null;
        this.#log(
          "info",
          `connected (protocol ${msg.protocol}, portal server ${msg.serverVersion})`,
        );
        return;
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
