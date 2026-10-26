/**
 * Telemetry adds, asserted through a mocked `@astra/observe`
 * (the real module's instruments are no-ops without installed telemetry): the
 * `weal.v2.errors{stage}` / `weal.v2.fuel_aborts` counters, the engine-fault
 * ERROR (a Class-A rule pages Discord on ERROR, so only engine faults use it),
 * the history-failure and stale-row WARNs, and the `weal.goodness` /
 * `weal.engine_ms` span attributes.
 */

import type { WealHost } from "@astra/ontology";
import { beforeEach, describe, expect, test, vi } from "vitest";

const counted: { name: string; attrs?: Record<string, unknown> }[] = [];
const logged: { severityText?: string; body?: unknown; attributes?: Record<string, unknown> }[] =
  [];
const spanAttrs: Record<string, unknown> = {};

vi.mock("@astra/observe", () => ({
  getLogger: () => ({
    emit: (rec: {
      severityText?: string;
      body?: unknown;
      attributes?: Record<string, unknown>;
    }) => {
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
      insertDice: () => Promise.resolve(),
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

describe("counters", () => {
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

describe("engine fault logging (stage internal)", () => {
  test("a fault counts weal.v2.errors{stage:internal} and logs one ERROR with the detail", async () => {
    await handleMessage(
      "d20 + 1",
      PROFILE,
      deps({
        engineHooks: {
          evaluateFn: () => ({
            ok: false,
            stage: "internal",
            message: "internal error: boom",
            span: { start: 0, end: 3 },
            preludeName: null,
          }),
        },
      }),
    );
    expect(counted).toContainEqual({ name: "weal.v2.errors", attrs: { stage: "internal" } });
    const errors = logged.filter((l) => l.severityText === "ERROR");
    expect(errors).toHaveLength(1);
    expect(String(errors[0]?.body)).toBe(
      "weal engine fault (stage internal) for Jorge: internal error: boom — source: d20 + 1",
    );
    expect(errors[0]?.attributes).toEqual({
      "weal.stage": "internal",
      "weal.player": "Jorge",
      "weal.source": "d20 + 1",
      "weal.span": "0..3",
    });
    expect(spanAttrs["weal.stage"]).toBe("internal");
  });

  test("a paren bomb logs nothing at ERROR and counts as a fuel abort", async () => {
    await handleMessage(`${"(".repeat(2000)}d20${")".repeat(2000)}`, PROFILE, deps());
    expect(logged.some((l) => l.severityText === "ERROR")).toBe(false);
    expect(counted).toContainEqual({ name: "weal.v2.errors", attrs: { stage: "fuel" } });
    expect(counted.some((c) => c.name === "weal.v2.fuel_aborts")).toBe(true);
  });

  test("a player's own error logs nothing at ERROR", async () => {
    await handleMessage('1 + "a"', PROFILE, deps());
    expect(logged.some((l) => l.severityText === "ERROR")).toBe(false);
  });
});

describe("roll history failures", () => {
  test("a failed write counts weal.dice.persist_failures and logs a WARN", async () => {
    const store = {
      ...deps().store,
      insertDice: () => Promise.reject(new Error("connection refused")),
    };
    await handleMessage("d20", PROFILE, deps({ store }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(counted).toContainEqual({ name: "weal.dice.persist_failures", attrs: undefined });
    const warns = logged.filter((l) => String(l.body).includes("roll history write failed"));
    expect(warns).toHaveLength(1);
    expect(warns[0]?.severityText).toBe("WARN");
    expect(String(warns[0]?.body)).toContain("connection refused");
  });
});

describe("boot validation logging", () => {
  test("a stale funcs_v2 row is skipped with exactly a WARN naming it", () => {
    const rows = [
      { id: 1, name: "bonus", source: "3" },
      { id: 2, name: "bad", source: "1 +" },
      { id: 3, name: "zero", source: "1 / 0" },
      { id: 4, name: "kh", source: "3" },
    ];
    expect(loadValidatedFuncs(rows)).toEqual([["bonus", "3"]]);
    const warns = logged.filter((l) => l.severityText === "WARN");
    expect(warns).toHaveLength(3);
    expect(String(warns[0]?.body)).toContain("funcs_v2 row 2 (bad)");
    expect(String(warns[1]?.body)).toBe(
      "skipping saved weal source: funcs_v2 row 3 (zero): rolls `d20`: prelude: division by zero",
    );
    expect(warns[1]?.attributes).toEqual({ "weal.save": "zero", "weal.stage": "prelude" });
    expect(String(warns[2]?.body)).toContain(
      "skipping saved weal source: funcs_v2 row 4 (kh): rolls `2d20kh1 + 1`: type:",
    );
    expect(logged.some((l) => l.severityText === "ERROR")).toBe(false);
  });
});

describe("save guard telemetry", () => {
  test("a refused save counts weal.v2.saves_refused{kind}, sets the span attr, logs WARN", async () => {
    await handleMessage("save(:kh, 3)", PROFILE, deps());
    expect(counted).toContainEqual({ name: "weal.v2.saves_refused", attrs: { kind: "rolls" } });
    expect(spanAttrs["weal.save_refused"]).toBe("rolls");
    const warns = logged.filter((l) => String(l.body).includes("refused save kh"));
    expect(warns).toHaveLength(1);
    expect(warns[0]?.severityText).toBe("WARN");
    expect(String(warns[0]?.body)).toContain("from Jorge (rolls, `2d20kh1 + 1`): type:");
    expect(logged.some((l) => l.severityText === "ERROR")).toBe(false);
  });

  test("an accepted save counts no refusal", async () => {
    await handleMessage("save(:smite, |x| x + 3)", PROFILE, deps());
    expect(counted.some((c) => c.name === "weal.v2.saves_refused")).toBe(false);
  });
});

describe("span attributes", () => {
  test("a roll sets weal.goodness + weal.engine_ms on the message span", async () => {
    await handleMessage("d6", PROFILE, deps());
    expect(spanAttrs["weal.goodness"]).toBe("crit");
    expect(typeof spanAttrs["weal.engine_ms"]).toBe("number");
  });
});
