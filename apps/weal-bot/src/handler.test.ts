/**
 * Message pipeline (spec acceptance D) — the full classify → roll → host+webhook →
 * save → overlay flow, exercised dry with fakes (no Discord/Postgres/network).
 */

import { describe, expect, test } from "bun:test";
import type { WealHost } from "@astra/ontology";
import type { Func, WealStore } from "./db";
import { type HandlerDeps, handleMessage, type OutgoingMessage } from "./handler";
import type { OverlayPayload, SeedInfo } from "./message";
import type { RollRng } from "./roller";
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

const GSR = host("gsr", { crit: ["CRIT_LINE"], fumble: ["FUMBLE_LINE"], okay: ["OKAY_LINE"] });
const KNIFE = host("knife");

const PROFILE: Profile = {
  playerId: 42,
  playerName: "Jorge",
  characterName: "Argyle",
  characterClass: "champion",
  edition: "pathfinder_2e",
};

/** Scripted RNG: genRange replays faces; choose returns the first element. */
function scriptedRng(faces: number[]): RollRng {
  let i = 0;
  return {
    genRange: () => {
      const f = faces[i++];
      if (f === undefined) throw new Error("out of faces");
      return f;
    },
    choose: <T>(xs: T[]) => xs[0] as T,
  };
}

class FakeStore implements WealStore {
  readonly inserts: [number, number, number, number][] = [];
  readonly funcs: Func[] = [];
  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }
  insertDie(base: number, value: number, playerId: number, blameId: number): Promise<void> {
    this.inserts.push([base, value, playerId, blameId]);
    return Promise.resolve();
  }
  getAllFuncs(): Promise<Func[]> {
    return Promise.resolve(this.funcs);
  }
  insertFunc(name: string, payload: string): Promise<void> {
    this.funcs.push({ name, payload });
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

function harness(faces: number[]): Harness {
  const store = new FakeStore();
  const sent: OutgoingMessage[] = [];
  const broadcasts: { payload: OverlayPayload; playerName: string }[] = [];
  const funcsAdded: [string, string][] = [];
  const state = { seed: { seed: 999, blameId: 1, blame: "Josh" } as SeedInfo };
  const deps: HandlerDeps = {
    rng: scriptedRng(faces),
    store,
    host: (slug) => (slug === "gsr" ? GSR : KNIFE),
    initFuncs: () => [],
    addFunc: (name, payload) => funcsAdded.push([name, payload]),
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

describe("handleMessage", () => {
  test("empty / fence-only message is ignored", async () => {
    const h = harness([]);
    await handleMessage("```\n```", PROFILE, h.deps);
    expect(h.sent).toEqual([]);
  });

  test("non-roll text is a silent no-op (parse error)", async () => {
    const h = harness([]);
    await handleMessage("Hiya", PROFILE, h.deps);
    expect(h.sent).toEqual([]);
    expect(h.store.inserts).toEqual([]);
  });

  test("a number → Knife message, no save, no broadcast", async () => {
    const h = harness([]);
    await handleMessage("5", PROFILE, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.host.slug).toBe("knife");
    expect(h.sent[0]?.title).toBe("i invented the number 5");
    expect(h.sent[0]?.fields).toEqual([["Result", "5 = `5`"]]);
    expect(h.store.inserts).toEqual([]);
    expect(h.broadcasts).toEqual([]);
  });

  test("a nat-20 d20 → save + GSR crit embed + v1 broadcast", async () => {
    const h = harness([20]);
    await handleMessage("d20", PROFILE, h.deps);
    // saved to the store under the player id + blame id
    expect(h.store.inserts).toEqual([[20, 20, 42, 1]]);
    // posted as GSR with a crit title + the crit flavor line + pf2e class thumbnail
    expect(h.sent).toHaveLength(1);
    const msg = h.sent[0];
    expect(msg?.host.slug).toBe("gsr");
    expect(msg?.title).toBe("Argyle: 20 [Crit!]");
    expect(msg?.contents).toBe("CRIT_LINE");
    expect(msg?.thumbnail).toBe("https://2e.aonprd.com/Images/Class/champion_Icon.png");
    expect(msg?.footer).toBe("very good • 999 (from Josh, with love)");
    // overlay v1 payload
    expect(h.broadcasts).toHaveLength(1);
    expect(h.broadcasts[0]?.payload).toEqual({
      v: 1,
      user: "Jorge",
      expression: "d20 ⟪20⟫",
      total: 20,
      value: 20,
      is_crit: true,
      is_fumble: false,
    });
  });

  test("reseed() → new seed + Knife reseed message", async () => {
    const h = harness([]);
    await handleMessage("reseed()", PROFILE, h.deps);
    expect(h.seed.blame).toBe("Jorge"); // reseeded by the caller
    expect(h.seed.blameId).toBe(42);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.host.slug).toBe("knife");
    expect(h.sent[0]?.title).toBe("Jorge reseeded!");
  });

  test("save(:x, 5) → records the macro + a Knife save message", async () => {
    const h = harness([]);
    await handleMessage("save(:x, 5)", PROFILE, h.deps);
    expect(h.funcsAdded).toEqual([["x", '{"Number":5}']]);
    expect(h.store.funcs).toEqual([{ name: "x", payload: '{"Number":5}' }]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.title).toBe("x saved!");
  });
});
