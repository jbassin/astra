/**
 * Telemetry adds (spec 0032 D32-20), asserted through a mocked `@astra/observe`
 * (the real module's instruments are no-ops without initTelemetry): the
 * `weal.v2.errors{stage}` / `weal.v2.fuel_aborts` counters, the panic WARN (a
 * Class-A rule pages Discord on ERROR — WARN is load-bearing), the stale-row
 * boot WARN, and the `weal.goodness` / `weal.engine_ms` span attributes.
 */

import type { WealHost } from "@astra/ontology";
import { beforeEach, describe, expect, test, vi } from "vitest";

const counted: { name: string; attrs?: Record<string, unknown> }[] = [];
const logged: { severityText?: string; body?: unknown }[] = [];
const spanAttrs: Record<string, unknown> = {};

vi.mock("@astra/observe", () => ({
  getLogger: () => ({
    emit: (rec: { severityText?: string; body?: unknown }) => {
      logged.push(rec);
    },
  }),
  getTracer: () => ({
    startActiveSpan: (
      _name: string,
      _opts: unknown,
      fn: (span: {
        setAttribute: (k: string, v: unknown) => void;
        setStatus: (s: unknown) => void;
        end: () => void;
      }) => Promise<void>,
    ) =>
      fn({
        setAttribute: (k: string, v: unknown) => {
          spanAttrs[k] = v;
        },
        setStatus: () => {},
        end: () => {},
      }),
  }),
  lazyCounter: (_scope: string, name: string) => ({
    add: (_n: number, attrs?: Record<string, unknown>) => {
      counted.push({ name, attrs });
    },
  }),
}));

// Imported AFTER the mock so the module-scope instruments bind to the fakes.
const { handleMessage } = await import("./handler");
const { loadValidatedFuncs } = await import("./engine");

import type { HandlerDeps } from "./handler";
import type { Profile } from "./roster";

function host(slug: string): WealHost {
  return {
    slug,
    name: slug,
    color: "#276C4C",
    avatar: "",
    lines: { crit: [], good: [], okay: [], bad: [], fumble: [] },
  };
}

const PROFILE: Profile = {
  playerId: 42,
  playerName: "Jorge",
  characterName: "Argyle",
  characterClass: "champion",
  edition: "pathfinder_2e",
};

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    rng: { choose: <T>(xs: readonly T[]) => xs[0] as T },
    store: {
      ensureSchema: () => Promise.resolve(),
      insertDie: () => Promise.resolve(),
      getAllFuncs: () => Promise.resolve([]),
      insertFunc: () => Promise.resolve(),
      getAllFuncsV2: () => Promise.resolve([]),
      insertFuncV2: () => Promise.resolve(),
    },
    host,
    initFuncs: () => [],
    addFunc: () => {},
    savedNames: () => [],
    seed: () => new Uint8Array(32).fill(77),
    getSeed: () => ({ seed: 999, blameId: 1, blame: "Josh" }),
    setSeed: () => {},
    send: () => Promise.resolve(),
    broadcast: () => Promise.resolve(),
    ...over,
  };
}

beforeEach(() => {
  counted.length = 0;
  logged.length = 0;
  for (const k of Object.keys(spanAttrs)) delete spanAttrs[k];
});

describe("counters (D32-20)", () => {
  test("a fuel abort counts weal.v2.errors{stage:fuel} AND weal.v2.fuel_aborts", async () => {
    await handleMessage("10000d10000", PROFILE, deps());
    expect(counted).toContainEqual({ name: "weal.v2.errors", attrs: { stage: "fuel" } });
    expect(counted).toContainEqual({ name: "weal.v2.fuel_aborts", attrs: undefined });
  });

  test("a noise-gated silent error still counts its stage", async () => {
    await handleMessage("lol", PROFILE, deps());
    expect(counted).toContainEqual({ name: "weal.v2.errors", attrs: { stage: "type" } });
  });

  test("a parse failure counts nothing", async () => {
    await handleMessage("Hiya", PROFILE, deps());
    expect(counted).toEqual([]);
  });

  test("a die roll counts astra.weal.rolls by goodness", async () => {
    await handleMessage("d6", PROFILE, deps());
    expect(counted).toContainEqual({ name: "astra.weal.rolls", attrs: { goodness: "crit" } });
  });
});

describe("panic containment logging (D32-14)", () => {
  test("panic → weal.v2.errors{stage:panic} + a WARN (never ERROR) log", async () => {
    await handleMessage(
      "d20",
      PROFILE,
      deps({
        engineHooks: {
          evaluateFn: () => {
            throw new Error("wasm trap: unreachable");
          },
          reinstantiateFn: () => {},
        },
      }),
    );
    expect(counted).toContainEqual({ name: "weal.v2.errors", attrs: { stage: "panic" } });
    const panicLogs = logged.filter((l) => String(l.body).includes("weal engine panic"));
    expect(panicLogs).toHaveLength(1);
    expect(panicLogs[0]?.severityText).toBe("WARN");
    expect(logged.some((l) => l.severityText === "ERROR")).toBe(false);
  });
});

describe("boot validation logging (D32-17)", () => {
  test("a stale funcs_v2 row is skipped with exactly a WARN naming it", () => {
    const rows = [
      { id: 1, name: "bonus", source: "3" },
      { id: 2, name: "bad", source: "1 +" },
    ];
    expect(loadValidatedFuncs(rows)).toEqual([["bonus", "3"]]);
    const warns = logged.filter((l) => l.severityText === "WARN");
    expect(warns).toHaveLength(1);
    expect(String(warns[0]?.body)).toContain("funcs_v2 row 2 (bad)");
    expect(logged.some((l) => l.severityText === "ERROR")).toBe(false);
  });
});

describe("span attributes (D32-20)", () => {
  test("a roll sets weal.goodness + weal.engine_ms on the message span", async () => {
    await handleMessage("d6", PROFILE, deps());
    expect(spanAttrs["weal.goodness"]).toBe("crit");
    expect(typeof spanAttrs["weal.engine_ms"]).toBe("number");
  });
});
