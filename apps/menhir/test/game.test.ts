import { describe, expect, test } from "vitest";

import { must } from "../src/assert";
import {
  computeRanks,
  type GameEvent,
  type PlayerRecord,
  projectHost,
  projectPlayer,
  reduce,
  type RoomState,
} from "../src/game";
import type { Quiz } from "../src/schema";

const QUIZ: Quiz = {
  id: "test-quiz",
  title: "Test Quiz",
  questions: [
    {
      text: "Q1",
      time: 10,
      options: [
        { label: "A", correct: true },
        { label: "B", correct: false },
      ],
    },
    {
      text: "Q2",
      time: 10,
      options: [
        { label: "A", correct: false },
        { label: "B", correct: true },
      ],
    },
  ],
};

function player(state: RoomState, id: string): PlayerRecord {
  return must(state.players.get(id), `missing player ${id}`);
}

function createRoom(now = 0): RoomState {
  return reduce(
    null,
    {
      type: "create",
      quiz: QUIZ,
      code: "ABCD",
      hostToken: "host-tok",
      roomNonce: "nonce-1",
      joinUrl: "https://menhir.iridi.cc/?code=ABCD",
    },
    now,
  ).state;
}

function join(state: RoomState, playerId: string, name: string, now = 0): RoomState {
  return reduce(state, { type: "join", playerId, roomNonce: state.roomNonce, name }, now).state;
}

function connect(state: RoomState, playerId: string, now = 0): RoomState {
  return reduce(state, { type: "connect", playerId }, now).state;
}

function start(state: RoomState, now = 0): RoomState {
  return reduce(
    state,
    { type: "hostAction", action: "start", fromPhase: "lobby", fromIndex: -1 },
    now,
  ).state;
}

describe("scoring (D31-5) — worked table", () => {
  test("correct-answer formula, streak +100 from the 2nd consecutive, base rounding", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Alice", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0); // lobby -> question(0), T=10

    // Q1: answers instantly (t=0). base = round(1000*(1-0/10/2)) = 1000. First
    // correct answer ever -> streak=1, no bonus yet.
    let result = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 0);
    expect(result.result).toEqual({ kind: "accepted" });
    state = result.state;
    let p1 = player(state, "p1");
    expect(p1.answers.get(0)).toEqual({ option: 0, t: 0, pointsGained: 1000 });
    expect(p1.score).toBe(1000);
    expect(p1.streak).toBe(1);

    // Force-close Q1 -> reveal -> scoreboard -> open Q2 (host escape hatch path,
    // exercised deliberately so this test also covers the "next" phase machine).
    state = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "question", fromIndex: 0 },
      1000,
    ).state;
    expect(state.phase).toBe("reveal");
    state = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "reveal", fromIndex: 0 },
      1000,
    ).state;
    expect(state.phase).toBe("scoreboard");
    state = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "scoreboard", fromIndex: 0 },
      2000,
    ).state;
    expect(state.phase).toBe("question");
    expect(state.questionIndex).toBe(1);

    // Q2: answers at t=5s (elapsed 5000ms from questionStartedAt=2000). base =
    // round(1000*(1-(5/10)/2)) = round(750) = 750. This is the 2nd consecutive
    // correct answer -> +100 flat bonus -> pointsGained = 850.
    result = reduce(state, { type: "answer", playerId: "p1", option: 1 }, 7000);
    state = result.state;
    p1 = player(state, "p1");
    expect(p1.answers.get(1)).toEqual({ option: 1, t: 5, pointsGained: 850 });
    expect(p1.streak).toBe(2);
    expect(p1.score).toBe(1000 + 850);
    expect(p1.totalTime).toBe(0 + 5);
  });

  test("wrong answer scores 0 and resets the streak", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Bob", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);

    const result = reduce(state, { type: "answer", playerId: "p1", option: 1 }, 3000); // Q1 option 1 = wrong
    state = result.state;
    const p1 = player(state, "p1");
    expect(p1.answers.get(0)).toEqual({ option: 1, t: 3, pointsGained: 0 });
    expect(p1.score).toBe(0);
    expect(p1.streak).toBe(0);
  });

  test("a non-round base is rounded (Math.round, not truncated)", () => {
    const oneQ: Quiz = {
      id: "round-quiz",
      title: "Round Quiz",
      questions: [
        {
          text: "Q",
          time: 3,
          options: [
            { label: "A", correct: true },
            { label: "B", correct: false },
          ],
        },
      ],
    };
    let state = reduce(
      null,
      { type: "create", quiz: oneQ, code: "WXYZ", hostToken: "t", roomNonce: "n", joinUrl: "u" },
      0,
    ).state;
    state = join(state, "p1", "Cara", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    // t=1s, T=3s: base = 1000*(1 - (1/3)/2) = 1000*0.8333... = 833.33... -> 833.
    const result = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 1000);
    expect(must(player(result.state, "p1").answers.get(0), "Q0 award").pointsGained).toBe(833);
  });

  test("a timeout (never answered) charges the full T and resets streak to 0", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Dara", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    // Manually give Dara a nonzero streak from a prior (synthetic) question so the
    // reset is observable.
    state = {
      ...state,
      players: new Map(state.players).set("p1", { ...player(state, "p1"), streak: 3 }),
    };

    state = reduce(
      state,
      { type: "timerFired", phase: "question", questionIndex: 0 },
      10_000,
    ).state;
    expect(state.phase).toBe("reveal");
    const p1 = player(state, "p1");
    expect(p1.answers.get(0)).toEqual({ option: null, t: 10, pointsGained: 0 });
    expect(p1.streak).toBe(0);
    expect(p1.totalTime).toBe(10);
  });

  test("tiebreak: equal score ranks by lower accumulated answer time", () => {
    const players = new Map<string, PlayerRecord>([
      [
        "p1",
        {
          id: "p1",
          name: "Fast",
          score: 995,
          streak: 1,
          totalTime: 10,
          connected: true,
          answers: new Map(),
        },
      ],
      [
        "p2",
        {
          id: "p2",
          name: "Slow",
          score: 995,
          streak: 1,
          totalTime: 11,
          connected: true,
          answers: new Map(),
        },
      ],
    ]);
    const ranks = computeRanks(players);
    expect(ranks.get("p1")).toBe(1);
    expect(ranks.get("p2")).toBe(2);
  });
});

describe("absolute host actions (D31-3)", () => {
  test("two identical `next` calls advance exactly once", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Eve", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0); // lobby -> question(0)
    expect(state.phase).toBe("question");
    expect(state.questionIndex).toBe(0);

    const event: GameEvent = {
      type: "hostAction",
      action: "next",
      fromPhase: "question",
      fromIndex: 0,
    };
    const first = reduce(state, event, 1000);
    expect(first.state.phase).toBe("reveal"); // force-close applies

    // Replaying the SAME (now-stale) fromPhase/fromIndex must no-op.
    const second = reduce(first.state, event, 1500);
    expect(second.state.phase).toBe("reveal");
    expect(second.state).toEqual(first.state);
    expect(second.effects).toEqual([]);
  });

  test("a mismatched fromPhase/fromIndex is a 200 no-op", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Fay", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    const result = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "scoreboard", fromIndex: 4 },
      1000,
    );
    expect(result.state).toBe(state); // untouched
    expect(result.effects).toEqual([]);
  });
});

describe("early close (D31-3)", () => {
  test("zero connected roster members never early-closes, even with an answer recorded", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Gia", 0); // joined but NEVER connected
    state = start(state, 0);
    expect(state.phase).toBe("question");

    const result = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 500);
    expect(result.state.phase).toBe("question"); // still open — no early close
    expect(result.effects).toEqual([{ kind: "broadcast" }]); // no cancelTimer
  });

  test("all connected roster members answering closes the question early", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Hana", 0);
    state = connect(state, "p1", 0);
    state = join(state, "p2", "Ivo", 0);
    state = connect(state, "p2", 0);
    state = start(state, 0);

    let result = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 100);
    expect(result.state.phase).toBe("question"); // 1 of 2 answered — not yet
    result = reduce(result.state, { type: "answer", playerId: "p2", option: 1 }, 200);
    expect(result.state.phase).toBe("reveal"); // 2 of 2 — early close
    expect(result.effects).toEqual(
      expect.arrayContaining([{ kind: "cancelTimer" }, { kind: "broadcast" }]),
    );
  });
});

describe("stale timerFired (D31-3)", () => {
  test("a timerFired armed for a phase/index we've moved past no-ops", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Jael", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    // Force-close to reveal via the host escape hatch — the ORIGINAL question(0)
    // timer is now stale.
    state = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "question", fromIndex: 0 },
      500,
    ).state;
    expect(state.phase).toBe("reveal");

    const stale = reduce(
      state,
      { type: "timerFired", phase: "question", questionIndex: 0 },
      10_000,
    );
    expect(stale.state).toBe(state); // untouched
    expect(stale.effects).toEqual([]);
  });
});

describe("join (D31-9)", () => {
  test("first join is lobby-gated: rejected mid-game for an unknown playerId", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Kess", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0); // now in "question"

    const result = reduce(
      state,
      { type: "join", playerId: "brand-new", roomNonce: state.roomNonce, name: "Late" },
      100,
    );
    expect(result.result).toEqual({ kind: "rejected", reason: "lobby-only" });
    expect(result.state.players.has("brand-new")).toBe(false);
  });

  test("re-attach works in any phase for a known playerId + matching nonce, and keeps score", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Lira", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    state = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 100).state; // score > 0
    const scoreBefore = player(state, "p1").score;
    expect(scoreBefore).toBeGreaterThan(0);

    const result = reduce(
      state,
      { type: "join", playerId: "p1", roomNonce: state.roomNonce, name: "Lira" },
      200,
    );
    expect(result.result).toEqual({
      kind: "joined",
      playerId: "p1",
      roomNonce: state.roomNonce,
      reattached: true,
    });
    expect(player(result.state, "p1").score).toBe(scoreBefore); // untouched
  });

  test("a roomNonce mismatch for an otherwise-known playerId falls through to branch 2 (first-join), never errors", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Mira", 0);
    // "p1" IS a known playerId in this room, but the nonce is wrong (the
    // recycled-code scenario, D31-8) — this must be treated as unknown, not
    // re-attached. Still in lobby + a free name, so branch 2 succeeds.
    const result = reduce(
      state,
      { type: "join", playerId: "p1", roomNonce: "some-other-nonce", name: "Mira2" },
      50,
    );
    expect(result.result).toEqual({
      kind: "joined",
      playerId: "p1",
      roomNonce: state.roomNonce,
      reattached: false,
    });
  });

  test("live name collision on a first join is rejected 409", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Nox", 0);
    const result = reduce(
      state,
      { type: "join", playerId: "new-guy", roomNonce: state.roomNonce, name: "Nox" },
      10,
    );
    expect(result.result).toEqual({ kind: "rejected", reason: "name-taken" });
  });
});

describe("answer (D31-3/D31-5)", () => {
  test("first answer wins — a second answer for the same question is rejected, idempotent", () => {
    // Deliberately never connects (kept in the "zero connected" regime) so the
    // early-close predicate can't fire and flip the phase to "reveal" out from
    // under this test — the thing under test is answer-idempotency, not close timing.
    let state = createRoom(0);
    state = join(state, "p1", "Osk", 0);
    state = start(state, 0);

    const first = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 100);
    expect(first.result).toEqual({ kind: "accepted" });
    state = first.state;

    const second = reduce(state, { type: "answer", playerId: "p1", option: 1 }, 200);
    expect(second.result).toEqual({ kind: "rejected", reason: "already-answered" });
    // The original award is untouched by the rejected re-answer.
    expect(player(second.state, "p1").answers.get(0)).toEqual(player(state, "p1").answers.get(0));
  });

  test("an answer outside the question phase is rejected", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Pax", 0);
    const result = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 10); // still in lobby
    expect(result.result).toEqual({ kind: "rejected", reason: "not-question-phase" });
  });

  test("an answer from an unknown player is rejected", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Quin", 0);
    state = start(state, 0);
    const result = reduce(state, { type: "answer", playerId: "ghost", option: 0 }, 10);
    expect(result.result).toEqual({ kind: "rejected", reason: "unknown-player" });
  });
});

describe("projections (§4a) never leak answers pre-reveal", () => {
  test("the player question projection carries no option text or correct flag", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Rho", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    const snapshot = projectPlayer(state, "p1", 500);
    expect(snapshot).toMatchObject({ phase: "question", optionCount: 2, hasAnswered: false });
    expect(snapshot).not.toHaveProperty("options");
    expect(snapshot).not.toHaveProperty("questionText");
  });

  test("the host question projection carries option labels + shapes, no correct flag", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Sol", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    const snapshot = projectHost(state, 500);
    expect(snapshot.phase).toBe("question");
    if (snapshot.phase === "question") {
      expect(snapshot.options).toEqual([
        { label: "A", shape: "triangle" },
        { label: "B", shape: "diamond" },
      ]);
    }
  });
});

describe("podium (D31-10)", () => {
  test("`end` from any phase reaches podium and marks aborted", () => {
    let state = createRoom(0);
    state = join(state, "p1", "Tam", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    const result = reduce(
      state,
      { type: "hostAction", action: "end", fromPhase: "question", fromIndex: 0 },
      500,
    );
    expect(result.state.phase).toBe("podium");
    expect(result.state.aborted).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { kind: "cancelTimer" },
        { kind: "broadcast" },
        expect.objectContaining({ kind: "appendResults" }),
      ]),
    );
  });

  test("reaching podium naturally (last scoreboard -> next) is not aborted", () => {
    const oneQ: Quiz = {
      id: "one-q",
      title: "One Q",
      questions: [
        {
          text: "Q",
          time: 10,
          options: [
            { label: "A", correct: true },
            { label: "B", correct: false },
          ],
        },
      ],
    };
    let state = reduce(
      null,
      { type: "create", quiz: oneQ, code: "ZZZZ", hostToken: "t", roomNonce: "n", joinUrl: "u" },
      0,
    ).state;
    state = join(state, "p1", "Uma", 0);
    state = connect(state, "p1", 0);
    state = start(state, 0);
    state = reduce(state, { type: "answer", playerId: "p1", option: 0 }, 100).state; // early-close (1/1 connected)
    expect(state.phase).toBe("reveal");
    state = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "reveal", fromIndex: 0 },
      200,
    ).state;
    expect(state.phase).toBe("scoreboard");
    const result = reduce(
      state,
      { type: "hostAction", action: "next", fromPhase: "scoreboard", fromIndex: 0 },
      300,
    );
    expect(result.state.phase).toBe("podium");
    expect(result.state.aborted).toBe(false);
  });
});
