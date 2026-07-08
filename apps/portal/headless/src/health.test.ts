/**
 * `/health` tests (spec 0027 D27-11). `snapshotFromSupervisor` is the ONE place the
 * `ok` semantics live — process-up + browser-connected only, `world-down` is a
 * reported state, never a reason `ok` goes false — so most of this is table-driven
 * against that function; a couple of tests hit the real `node:http` server end to end.
 */
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  createHealthServer,
  type SupervisorSnapshotSource,
  snapshotFromSupervisor,
} from "./health";

function source(overrides: Partial<SupervisorSnapshotSource>): SupervisorSnapshotSource {
  return {
    state: "in-world",
    browserConnected: true,
    lastJoinAt: null,
    joins: 0,
    relaunches: 0,
    ...overrides,
  };
}

describe("snapshotFromSupervisor (D27-11 ok semantics)", () => {
  it("world-down + browser connected is still ok: true — a reported state, not unhealthy", () => {
    const snap = snapshotFromSupervisor(source({ state: "world-down", browserConnected: true }));
    expect(snap).toEqual({
      ok: true,
      browserConnected: true,
      state: "world-down",
      inWorld: false,
      lastJoinAt: null,
      joins: 0,
      relaunches: 0,
    });
  });

  it("in-world reports inWorld: true", () => {
    const snap = snapshotFromSupervisor(source({ state: "in-world" }));
    expect(snap.inWorld).toBe(true);
    expect(snap.ok).toBe(true);
  });

  it("browser disconnected is NOT ok, regardless of the reported state", () => {
    for (const state of ["in-world", "join", "world-down", "broken"] as const) {
      const snap = snapshotFromSupervisor(source({ state, browserConnected: false }));
      expect(snap.ok).toBe(false);
      expect(snap.state).toBe(state);
    }
  });

  it("carries lastJoinAt/joins/relaunches through verbatim", () => {
    const snap = snapshotFromSupervisor(source({ lastJoinAt: 12_345, joins: 3, relaunches: 2 }));
    expect(snap.lastJoinAt).toBe(12_345);
    expect(snap.joins).toBe(3);
    expect(snap.relaunches).toBe(2);
  });
});

describe("createHealthServer (end to end)", () => {
  let close: (() => void) | null = null;

  afterEach(() => {
    close?.();
    close = null;
  });

  it("serves the live snapshot as JSON on /health", async () => {
    let current: SupervisorSnapshotSource = source({ state: "join" });
    const server = createHealthServer(() => snapshotFromSupervisor(current));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    close = () => server.close();
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({
      ok: true,
      browserConnected: true,
      state: "join",
      inWorld: false,
      lastJoinAt: null,
      joins: 0,
      relaunches: 0,
    });

    // Fresh per request — flip the underlying state and confirm the NEXT fetch sees it.
    current = source({ state: "world-down", browserConnected: true });
    const res2 = await fetch(`http://127.0.0.1:${port}/health`);
    expect((await res2.json()).state).toBe("world-down");
  });

  it("404s anything that isn't /health", async () => {
    const server = createHealthServer(() => snapshotFromSupervisor(source({})));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    close = () => server.close();
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(res.status).toBe(404);
  });
});
