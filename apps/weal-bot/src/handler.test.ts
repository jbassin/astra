/**
 * Message pipeline (spec 0032 §5 gates D/E, locally-testable cases) — the full
 * classify → engine → host+webhook → persistence → overlay flow, exercised dry
 * with fakes (no Discord/Postgres/network) against the REAL committed wasm
 * engine under a fixed seed (deterministic goldens).
 */

import type { WealHost } from "@astra/ontology";
import { describe, expect, test } from "vitest";

import type { Func, FuncV2, WealStore } from "./db";
import { type HandlerDeps, handleMessage, type OutgoingMessage } from "./handler";
import type { OverlayPayload, SeedInfo } from "./message";
import type { Profile } from "./roster";

function host(slug: string, lines?: Partial<WealHost["lines"]>): WealHost {
  return {
    slug,
    name: slug === "knife" ? "Knife-That-Teaches" : "Gin Soaked Rag",
    color: "#276C4C",
    avatar: `https://example/${slug}.png`,
    lines: {
      crit: lines?.crit ?? [],
      good: lines?.good ?? [],
      okay: lines?.okay ?? [],
      bad: lines?.bad ?? [],
      fumble: lines?.fumble ?? [],
    },
  };
}

const GSR = host("gsr", {
  crit: ["CRIT_LINE"],
  good: ["GOOD_LINE"],
  okay: ["OKAY_LINE"],
  bad: ["BAD_LINE"],
  fumble: ["FUMBLE_LINE"],
});
const KNIFE = host("knife");

const PROFILE: Profile = {
  playerId: 42,
  playerName: "Jorge",
  characterName: "Argyle",
  characterClass: "champion",
  edition: "pathfinder_2e",
};

/** The S5 golden seed (matches libs/ts/weal-engine's smoke suite). */
const SEED = new Uint8Array(32).fill(77);

class FakeStore implements WealStore {
  readonly inserts: [number, number, number, number][] = [];
  readonly funcsV2: FuncV2[] = [];
  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }
  insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void> {
    this.inserts.push([base, value, playerId, blameId]);
    return Promise.resolve();
  }
  getAllFuncs(): Promise<Func[]> {
    return Promise.resolve([]);
  }
  insertFunc(): Promise<void> {
    return Promise.resolve();
  }
  getAllFuncsV2(): Promise<FuncV2[]> {
    return Promise.resolve(this.funcsV2);
  }
  insertFuncV2(name: string, source: string): Promise<void> {
    this.funcsV2.push({ id: this.funcsV2.length + 1, name, source });
    return Promise.resolve();
  }
}

interface Harness {
  deps: HandlerDeps;
  store: FakeStore;
  sent: OutgoingMessage[];
  broadcasts: { payload: OverlayPayload; playerName: string }[];
  funcsAdded: [string, string][];
  seed: SeedInfo;
}

function harness(initFuncs: [string, string][] = []): Harness {
  const store = new FakeStore();
  const sent: OutgoingMessage[] = [];
  const broadcasts: { payload: OverlayPayload; playerName: string }[] = [];
  const funcs = [...initFuncs];
  const funcsAdded: [string, string][] = [];
  const state = { seed: { seed: 999, blameId: 1, blame: "Josh" } as SeedInfo };
  const deps: HandlerDeps = {
    rng: { choose: <T>(xs: readonly T[]) => xs[0] as T },
    store,
    host: (slug) => (slug === "gsr" ? GSR : KNIFE),
    initFuncs: () => funcs,
    addFunc: (name, source) => {
      funcs.push([name, source]);
      funcsAdded.push([name, source]);
    },
    savedNames: () => [...new Set(funcs.map(([name]) => name))],
    seed: () => SEED,
    getSeed: () => state.seed,
    setSeed: (s) => {
      state.seed = s;
    },
    send: (msg) => {
      sent.push(msg);
      return Promise.resolve();
    },
    broadcast: (payload, playerName) => {
      broadcasts.push({ payload, playerName });
      return Promise.resolve();
    },
  };
  return {
    deps,
    store,
    sent,
    broadcasts,
    funcsAdded,
    get seed() {
      return state.seed;
    },
  };
}

describe("classification (unchanged surfaces)", () => {
  test("empty / fence-only message is ignored", async () => {
    const h = harness();
    await handleMessage("```\n```", PROFILE, h.deps);
    expect(h.sent).toEqual([]);
  });

  test("non-weal chat is a silent no-op (parse error)", async () => {
    const h = harness();
    await handleMessage("Hiya", PROFILE, h.deps);
    expect(h.sent).toEqual([]);
    expect(h.store.inserts).toEqual([]);
  });

  test("reseed() → new seed + Knife reseed message", async () => {
    const h = harness();
    await handleMessage("reseed()", PROFILE, h.deps);
    expect(h.seed.blame).toBe("Jorge");
    expect(h.seed.blameId).toBe(42);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.host.slug).toBe("knife");
    expect(h.sent[0]?.title).toBe("Jorge reseeded!");
  });
});

describe("die rolls (real engine, seeded)", () => {
  test("d20 + 7 end-to-end: embed golden + persistence + overlay", async () => {
    const h = harness();
    await handleMessage("d20 + 7", PROFILE, h.deps);
    // seed 77 draws a 4 → 11, goodness "bad"
    expect(h.store.inserts).toEqual([[20, 4, 42, 1]]);
    expect(h.sent).toHaveLength(1);
    const msg = h.sent[0];
    expect(msg?.host.slug).toBe("gsr");
    expect(msg?.title).toBe("Argyle: 11");
    expect(msg?.contents).toBe("BAD_LINE");
    expect(msg?.fields).toEqual([["Results", "d20 ⟪4⟫ + 7 = `11`"]]);
    expect(msg?.thumbnail).toBe("https://2e.aonprd.com/Images/Class/champion_Icon.png");
    expect(msg?.footer).toBe("bad • 999 (Josh did this)");
    expect(h.broadcasts).toEqual([
      {
        payload: {
          v: 1,
          user: "Jorge",
          expression: "d20 + 7",
          total: 11,
          value: 11,
          is_crit: false,
          is_fumble: false,
          display: "11",
        },
        playerName: "Jorge",
      },
    ]);
  });

  test("a crit die gets the [Crit!] tag + the crit bank + crit footer", async () => {
    const h = harness();
    await handleMessage("d6", PROFILE, h.deps);
    // seed 77 rolls a 6 on d6 → crit
    const msg = h.sent[0];
    expect(msg?.title).toBe("Argyle: 6 [Crit!]");
    expect(msg?.contents).toBe("CRIT_LINE");
    expect(msg?.footer).toBe("very good • 999 (from Josh, with love)");
  });

  test("2d20kh1 + 7 (the sum-coercion case) shows the struck dropped die", async () => {
    const h = harness();
    await handleMessage("2d20kh1 + 7", PROFILE, h.deps);
    expect(h.sent[0]?.fields).toEqual([["Results", "2d20 ⟪~~4~~,15⟫kh1 + 7 = `22`"]]);
    // BOTH sampled dice persist, kept and dropped alike (D32-17)
    expect(h.store.inserts).toEqual([
      [20, 4, 42, 1],
      [20, 15, 42, 1],
    ]);
  });

  test("a null-goodness die (single-face dl) — no tag, okay bank, no rows", async () => {
    const h = harness();
    await handleMessage("dl([:only])", PROFILE, h.deps);
    const msg = h.sent[0];
    expect(msg?.title).toBe("Argyle: :only"); // no [Crit!]/[Fumble!] tag
    expect(msg?.contents).toBe("OKAY_LINE");
    expect(msg?.footer).toBe("okay • 999 (by Josh)");
    expect(h.store.inserts).toEqual([]); // atom dice contribute no standard rows
  });

  test("atom-die roll: overlay carries display with total 0 + goodness flags", async () => {
    const h = harness();
    await handleMessage("dl([:fine, :good, :great])", PROFILE, h.deps);
    expect(h.sent[0]?.title).toBe("Argyle: :great [Crit!]");
    expect(h.broadcasts[0]?.payload).toEqual({
      v: 1,
      user: "Jorge",
      expression: "dl([:fine, :good, :great])",
      total: 0,
      value: 0,
      is_crit: true,
      is_fumble: false,
      display: ":great",
    });
  });
});

describe("value displays (the Knife invented flow)", () => {
  test("a bare number → Knife message, no save, no broadcast", async () => {
    const h = harness();
    await handleMessage("5", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.host.slug).toBe("knife");
    expect(h.sent[0]?.title).toBe("i invented the number 5");
    expect(h.sent[0]?.fields).toEqual([["Result", "5 = `5`"]]);
    expect(h.store.inserts).toEqual([]);
    expect(h.broadcasts).toEqual([]);
  });
});

describe("error visibility + the noise gate (D32-14)", () => {
  test("`lol` (bare unknown word) stays silent despite the type error", async () => {
    const h = harness();
    await handleMessage("lol", PROFILE, h.deps);
    expect(h.sent).toEqual([]);
  });

  test("`:p` (bare atom) stays silent despite evaluating fine", async () => {
    const h = harness();
    await handleMessage(":p", PROFILE, h.deps);
    expect(h.sent).toEqual([]);
    expect(h.broadcasts).toEqual([]);
  });

  test("`xyzzy + 1` (operator present) → visible unbound-ident reply golden", async () => {
    const h = harness();
    await handleMessage("xyzzy + 1", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    const msg = h.sent[0];
    expect(msg?.host.slug).toBe("knife");
    expect(msg?.title).toBe("that didn't check out");
    expect(msg?.contents).toBe("unbound identifier `xyzzy`\n```\nxyzzy + 1\n^^^^^\n```");
  });

  test("`4d7kq2` (die token) → visible unknown-suffix reply with caret", async () => {
    const h = harness();
    await handleMessage("4d7kq2", PROFILE, h.deps);
    expect(h.sent[0]?.contents).toBe("unknown die suffix `kq`\n```\n4d7kq2\n   ^^\n```");
  });

  test('type-error reply golden (1 + "a")', async () => {
    const h = harness();
    await handleMessage('1 + "a"', PROFILE, h.deps);
    expect(h.sent[0]?.title).toBe("that didn't check out");
    expect(h.sent[0]?.contents).toBe(
      'arithmetic isn\'t defined on `Str`\n```\n1 + "a"\n^^^^^^^\n```',
    );
  });

  test("a prelude-stage error names the bad save and excerpts ITS source", async () => {
    const h = harness([["bad", "1 +"]]);
    await handleMessage("d6", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.contents).toBe(
      "parse error: expected an expression, found end of input\n```\n1 +\n   ^\n```\n(in bad)",
    );
  });

  test("fuel abort (10000d10000) is visible", async () => {
    const h = harness();
    await handleMessage("10000d10000", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.title).toBe("that didn't check out");
    expect(h.sent[0]?.contents).toBe("fuel exhausted: transitions");
    expect(h.store.inserts).toEqual([]);
  });
});

describe("panic containment (injected throwing engine — D32-14)", () => {
  test("a thrown engine error → fault reply + reinstantiate called", async () => {
    const h = harness();
    let reinstantiated = 0;
    h.deps.engineHooks = {
      evaluateFn: () => {
        throw new Error("wasm trap: unreachable");
      },
      reinstantiateFn: () => {
        reinstantiated += 1;
      },
    };
    await handleMessage("d20 + 7", PROFILE, h.deps);
    expect(reinstantiated).toBe(1);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.host.slug).toBe("knife");
    expect(h.sent[0]?.title).toBe("engine fault");
    expect(h.store.inserts).toEqual([]);
    expect(h.broadcasts).toEqual([]);
  });
});

describe("saves (D32-15/17)", () => {
  test("save flow: funcs_v2 insert + savedNames update + weal-fenced source embed", async () => {
    const h = harness();
    await handleMessage("save(:smite, |x| x + 3)", PROFILE, h.deps);
    expect(h.funcsAdded).toEqual([["smite", "|x| x + 3"]]);
    expect(h.store.funcsV2).toEqual([{ id: 1, name: "smite", source: "|x| x + 3" }]);
    expect(h.deps.savedNames()).toEqual(["smite"]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.host.slug).toBe("knife");
    expect(h.sent[0]?.title).toBe("smite saved!");
    expect(h.sent[0]?.contents).toBe(
      "hmm.... okay jorge, ill remember that\n```weal\n|x| x + 3\n```",
    );
  });
});

describe("persistence guards (D32-17)", () => {
  test("4d6kh3 writes all 4 sampled rows incl. the dropped die", async () => {
    const h = harness();
    await handleMessage("4d6kh3", PROFILE, h.deps);
    expect(h.sent[0]?.fields).toEqual([["Results", "4d6 ⟪6,~~1~~,3,6⟫kh3 = `15`"]]);
    expect(h.store.inserts).toEqual([
      [6, 6, 42, 1],
      [6, 1, 42, 1],
      [6, 3, 42, 1],
      [6, 6, 42, 1],
    ]);
  });

  test("a 31-die pool rolls + posts but persists nothing (MAX_POOL)", async () => {
    const h = harness();
    await handleMessage("31d6", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.broadcasts).toHaveLength(1);
    expect(h.store.inserts).toEqual([]);
  });

  test("a d200 die is skipped per-die; the d20 beside it persists (MAX_BASE)", async () => {
    const h = harness();
    await handleMessage("d200 + d20", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.store.inserts).toEqual([[20, 15, 42, 1]]);
  });
});

describe("plots (D32-16)", () => {
  test("plot(d6): GSR embed w/ attachment image + mean/std; no rows, no broadcast", async () => {
    const h = harness();
    await handleMessage("plot(d6)", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    const msg = h.sent[0];
    expect(msg?.host.slug).toBe("gsr");
    expect(msg?.title).toBe("d6");
    expect(msg?.fields).toEqual([
      ["Mean", "3.500000"],
      ["Std", "1.707825"],
    ]);
    expect(msg?.image).toBe("attachment://plot.png");
    expect(msg?.files).toHaveLength(1);
    expect(msg?.files?.[0]?.name).toBe("plot.png");
    // PNG magic bytes prove the base64 → bytes decode
    expect([...(msg?.files?.[0]?.data.slice(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(h.store.inserts).toEqual([]);
    expect(h.broadcasts).toEqual([]);
  });
});
