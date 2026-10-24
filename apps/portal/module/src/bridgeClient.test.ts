import { BRIDGE_PROTOCOL, PORTAL_VERSION, type AuthMsg } from "@astra/portal-shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BridgeClient,
  type BridgeClientOptions,
  type CloseInfo,
  type MinimalWebSocket,
  type WebSocketFactory,
} from "./bridgeClient";

type Listener = () => void;
type CloseListener = (ev: CloseInfo) => void;
type MessageListener = (ev: { data: string }) => void;

/** A fake `WebSocket` — just enough of the `MinimalWebSocket` surface to drive
 * `BridgeClient` manually (`open()`/`receive()`/`remoteClose()`) instead of a real
 * socket (S3 is entirely Foundry-free; this is deliberately browser-free too). */
class FakeSocket implements MinimalWebSocket {
  readonly sent: string[] = [];
  #openListener: Listener | null = null;
  #closeListener: CloseListener | null = null;
  #errorListener: Listener | null = null;
  #messageListener: MessageListener | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    // Nothing to simulate here — tests drive disconnects via remoteClose().
  }

  addEventListener(type: "open" | "error", listener: Listener): void;
  addEventListener(type: "close", listener: CloseListener): void;
  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: string, listener: Listener | CloseListener | MessageListener): void {
    if (type === "open") this.#openListener = listener as Listener;
    else if (type === "close") this.#closeListener = listener as CloseListener;
    else if (type === "error") this.#errorListener = listener as Listener;
    else if (type === "message") this.#messageListener = listener as MessageListener;
  }

  /** Test helper: simulate the socket finishing its opening handshake. */
  open(): void {
    this.#openListener?.();
  }

  /** Test helper: simulate a server->client message. */
  receive(msg: unknown): void {
    this.#messageListener?.({ data: JSON.stringify(msg) });
  }

  /** Test helper: simulate a raw (not-necessarily-valid-JSON) server->client frame. */
  receiveRaw(raw: string): void {
    this.#messageListener?.({ data: raw });
  }

  /** Test helper: simulate the server (or the network) dropping the connection; the
   * default 1006 is an abnormal close with no close frame. */
  remoteClose(code = 1006, reason = ""): void {
    this.#closeListener?.({ code, reason });
  }

  /** Test helper: simulate a socket error (the ensuing close still drives reconnect). */
  triggerError(): void {
    this.#errorListener?.();
  }

  lastSent(): unknown {
    const raw = this.sent.at(-1);
    if (raw === undefined) throw new Error("no message sent yet");
    return JSON.parse(raw);
  }
}

/** Flushes pending microtasks (real timers only — `dispatch`'s mocked promise settles
 * asynchronously, so a `query` response isn't sent synchronously off `receive()`). */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeFactory(): { factory: WebSocketFactory; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const factory: WebSocketFactory = () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  return { factory, sockets };
}

/** `sockets[index]`, but throws instead of typing as possibly-`undefined` — every
 * caller here already asserted the length, so a throw only ever means a real bug. */
function socketAt(sockets: FakeSocket[], index: number): FakeSocket {
  const socket = sockets[index];
  if (!socket) throw new Error(`no socket at index ${index} (only ${sockets.length} created)`);
  return socket;
}

const AUTH_OK = { type: "auth-ok", protocol: BRIDGE_PROTOCOL, serverVersion: PORTAL_VERSION };

function newClient(
  factory: WebSocketFactory,
  overrides: Partial<BridgeClientOptions> = {},
): BridgeClient {
  return new BridgeClient({
    wsUrl: "wss://portal.iridi.cc/ws",
    apiKey: "k",
    meta: () => undefined,
    dispatch: async () => ({}),
    createWebSocket: factory,
    ...overrides,
  });
}

const META: AuthMsg["meta"] = {
  worldId: "faerrin",
  world: "Faerrin",
  system: "pf2e",
  systemVersion: "7.12.2",
  foundryVersion: "13.351",
};

describe("BridgeClient (spec 0023 S3 — Foundry-free)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the auth handshake, with meta, as soon as the socket opens", () => {
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "bridge-key",
      meta: () => META,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    expect(sockets).toHaveLength(1);
    const socket = socketAt(sockets, 0);
    socket.open();

    expect(socket.sent).toHaveLength(1);
    expect(socket.lastSent()).toEqual({
      type: "auth",
      apiKey: "bridge-key",
      protocol: BRIDGE_PROTOCOL,
      moduleVersion: PORTAL_VERSION,
      meta: META,
    });
    client.stop();
  });

  it("answers a ping with a pong", () => {
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.open();
    socket.receive({ type: "ping" });

    expect(socket.lastSent()).toEqual({ type: "pong" });
    client.stop();
  });

  it("dispatches a query to the registered handler and sends back an ok response", async () => {
    const { factory, sockets } = fakeFactory();
    const dispatch = vi.fn().mockResolvedValue({ pong: true, worldId: "faerrin" });
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch,
      createWebSocket: factory,
    });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.open();
    socket.receive({ type: "query", id: "q-1", method: "portal.ping", params: undefined });
    await flush();

    expect(dispatch).toHaveBeenCalledWith("portal.ping", undefined);
    expect(socket.lastSent()).toEqual({
      type: "response",
      id: "q-1",
      ok: true,
      result: { pong: true, worldId: "faerrin" },
    });
    client.stop();
  });

  it("wraps a bare thrown error as a foundry-error response", async () => {
    const { factory, sockets } = fakeFactory();
    const dispatch = vi.fn().mockRejectedValue(new Error("boom"));
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch,
      createWebSocket: factory,
    });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.open();
    socket.receive({ type: "query", id: "q-2", method: "portal.ping" });
    await flush();

    expect(socket.lastSent()).toEqual({
      type: "response",
      id: "q-2",
      ok: false,
      error: { code: "foundry-error", message: "boom" },
    });
    client.stop();
  });

  it("passes through a typed dispatch error code (e.g. not-gm) verbatim", async () => {
    const { factory, sockets } = fakeFactory();
    const dispatch = vi.fn().mockRejectedValue({ code: "not-gm", message: "not a GM" });
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch,
      createWebSocket: factory,
    });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.open();
    socket.receive({ type: "query", id: "q-3", method: "portal.ping" });
    await flush();

    expect(socket.lastSent()).toEqual({
      type: "response",
      id: "q-3",
      ok: false,
      error: { code: "not-gm", message: "not a GM" },
    });
    client.stop();
  });

  it("ignores an unparseable message instead of throwing", () => {
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.open();
    expect(() => socket.receiveRaw("not json{{{")).not.toThrow();
    client.stop();
  });

  it("reconnects with capped exponential backoff after each close", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    expect(sockets).toHaveLength(1);

    socketAt(sockets, 0).remoteClose(); // 1st backoff: base 1000ms
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    socketAt(sockets, 1).remoteClose(); // 2nd backoff: doubled to 2000ms
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    client.stop();
  });

  it("reconnects after an error too (the ensuing close drives it)", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.triggerError();
    socket.remoteClose(); // a real WebSocket always follows error with close
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    client.stop();
  });

  it("caps the backoff at 30s instead of growing forever", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    // Close repeatedly without ever reopening — backoff climbs 1s,2s,4s,8s,16s,30s(capped),30s...
    for (let i = 0; i < 7; i++) {
      const before = sockets.length;
      socketAt(sockets, sockets.length - 1).remoteClose();
      vi.advanceTimersByTime(30_000);
      expect(sockets.length).toBe(before + 1);
    }
    client.stop();
  });

  it("resets the backoff to base on auth-ok, not on open alone", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = newClient(factory);

    client.start();
    socketAt(sockets, 0).remoteClose(); // 1st reconnect at 1000ms; next backoff = 2000ms
    vi.advanceTimersByTime(1000);
    const reopened = socketAt(sockets, 1);
    reopened.open();
    reopened.receive(AUTH_OK);
    reopened.remoteClose(); // a fresh outage after a good handshake
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3); // base 1000ms again, not the un-reset 2000ms

    client.stop();
  });

  it("keeps climbing when a socket closes before auth-ok (open alone never resets)", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = newClient(factory);

    client.start();
    socketAt(sockets, 0).remoteClose(); // next backoff = 2000ms
    vi.advanceTimersByTime(1000);
    const reopened = socketAt(sockets, 1);
    reopened.open();
    reopened.remoteClose(); // no auth-ok → no reset
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    client.stop();
  });

  it.each([
    ["a wrong key", 4001, "bad-key", "error"],
    ["a server older than the module", 4002, "server-stale", "error"],
    ["a different designated user", 4003, "not-designated", "info"],
    ["another user holding the bridge", 4006, "busy", "info"],
  ] as const)(
    "backs off straight to the 30s cap after %s (close %i)",
    (_label, code, reason, level) => {
      vi.useFakeTimers();
      const { factory, sockets } = fakeFactory();
      const log = vi.fn();
      const client = newClient(factory, { log });

      client.start();
      const socket = socketAt(sockets, 0);
      socket.open();
      socket.remoteClose(code, reason);
      vi.advanceTimersByTime(29_999);
      expect(sockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(2);
      expect(log).toHaveBeenCalledWith(level, expect.stringContaining("bridge client:"));

      // The same refusal again logs nothing new: a 30 s retry loop must not spam.
      const isRefusal = ([, m]: unknown[]) => typeof m === "string" && !m.includes("reconnecting");
      const refusals = log.mock.calls.filter(isRefusal).length;
      socketAt(sockets, 1).remoteClose(code, reason);
      expect(log.mock.calls.filter(isRefusal)).toHaveLength(refusals);

      client.stop();
    },
  );

  it("tells the GM the module is stale and stops dialing on a module-stale close", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const log = vi.fn();
    const notify = vi.fn();
    const client = newClient(factory, { log, notify });

    client.start();
    socketAt(sockets, 0).open();
    socketAt(sockets, 0).remoteClose(4002, "module-stale");
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith("error", expect.stringMatching(/stale.*reload/is));
    expect(log).toHaveBeenCalledWith("error", expect.stringContaining("stale"));
    client.stop();
  });

  it("keeps redialing at the 30s cap after being replaced, and takes the bridge back", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const log = vi.fn();
    const client = newClient(factory, { log });

    client.start();
    socketAt(sockets, 0).open();
    socketAt(sockets, 0).receive(AUTH_OK);
    socketAt(sockets, 0).remoteClose(4004, "replaced");
    expect(log).toHaveBeenCalledWith("warn", expect.stringContaining("newer session"));
    vi.advanceTimersByTime(29_999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    // The replacer has left: this redial gets auth-ok and the backoff is back at base.
    socketAt(sockets, 1).open();
    socketAt(sockets, 1).receive(AUTH_OK);
    socketAt(sockets, 1).remoteClose();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
    client.stop();
  });

  it("notifies the GM about a wrong key", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const notify = vi.fn();
    const client = newClient(factory, { notify });

    client.start();
    socketAt(sockets, 0).open();
    socketAt(sockets, 0).remoteClose(4001, "bad-key");
    expect(notify).toHaveBeenCalledWith("error", expect.stringContaining("bridge key"));
    client.stop();
  });

  it("redials from base after a server shutdown (1001) that followed a good handshake", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = newClient(factory);

    client.start();
    socketAt(sockets, 0).open();
    socketAt(sockets, 0).receive(AUTH_OK);
    socketAt(sockets, 0).remoteClose(1001, "server-shutdown");
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it("maps a thrown error whose code isn't a bridge error code to foundry-error", async () => {
    const { factory, sockets } = fakeFactory();
    const dispatch = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("no such file"), { code: "ENOENT" }));
    const client = newClient(factory, { dispatch });

    client.start();
    const socket = socketAt(sockets, 0);
    socket.open();
    socket.receive({ type: "query", id: "q-4", method: "portal.ping" });
    await flush();

    expect(socket.lastSent()).toEqual({
      type: "response",
      id: "q-4",
      ok: false,
      error: { code: "foundry-error", message: "no such file" },
    });
    client.stop();
  });

  it("stop() cancels a pending reconnect and never redials again", () => {
    vi.useFakeTimers();
    const { factory, sockets } = fakeFactory();
    const client = new BridgeClient({
      wsUrl: "wss://portal.iridi.cc/ws",
      apiKey: "k",
      meta: () => undefined,
      dispatch: async () => ({}),
      createWebSocket: factory,
    });

    client.start();
    socketAt(sockets, 0).remoteClose();
    client.stop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});
