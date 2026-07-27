import { describe, expect, test } from "vitest";

import { createRoomsRuntime, type Clock } from "../src/rooms";
import type { Quiz } from "../src/schema";

/** Deterministic injected clock: timers fire only via advance(). */
class TestClock implements Clock {
  t = 1_000_000;
  pending: { cb: () => void; at: number; handle: number }[] = [];
  #nextHandle = 1;

  now(): number {
    return this.t;
  }

  setTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout> {
    const handle = this.#nextHandle++;
    this.pending.push({ cb, at: this.t + ms, handle });
    return handle as unknown as ReturnType<typeof setTimeout>;
  }

  clearTimer(handle: ReturnType<typeof setTimeout>): void {
    const h = handle as unknown as number;
    this.pending = this.pending.filter((p) => p.handle !== h);
  }

  advance(ms: number): void {
    this.t += ms;
    const due = this.pending.filter((p) => p.at <= this.t).sort((a, b) => a.at - b.at);
    this.pending = this.pending.filter((p) => p.at > this.t);
    for (const p of due) p.cb();
  }
}

const QUIZ: Quiz = {
  id: "test-quiz",
  title: "Test Quiz",
  questions: [
    {
      text: "Q1?",
      time: 20,
      options: [
        { label: "right", correct: true },
        { label: "wrong", correct: false },
      ],
    },
    {
      text: "Q2?",
      time: 20,
      options: [
        { label: "right", correct: true },
        { label: "wrong", correct: false },
      ],
    },
  ],
};

function bootGame(clock: TestClock) {
  const runtime = createRoomsRuntime({
    quizzes: [QUIZ],
    publicOrigin: "https://menhir.test",
    resultsPath: "/tmp/menhir-rooms-test-results.jsonl",
    clock,
  });
  const created = runtime.createGame("test-quiz");
  if (!created.ok) throw new Error("createGame failed");
  const { code, hostToken } = created;
  const j1 = runtime.join(code, { name: "Ana" });
  const j2 = runtime.join(code, { name: "Bo" });
  if (!j1.ok || !j2.ok) throw new Error("join failed");
  return { runtime, code, hostToken, p1: j1.playerId, p2: j2.playerId };
}

/** Read the current phase via the absolute-action no-op path (mismatched
 * fromPhase returns ok + the CURRENT snapshot without advancing anything). */
function phaseOf(runtime: ReturnType<typeof createRoomsRuntime>, code: string, hostToken: string) {
  const out = runtime.hostAction(code, {
    hostToken,
    action: "next",
    fromPhase: "podium",
    fromIndex: -99,
  });
  if (!out.ok) throw new Error("snapshot probe failed");
  return out.snapshot.phase;
}

describe("rooms runtime timer policy (S2b review blocker)", () => {
  test("a mid-question answer does not disarm the countdown; the timer still closes the question", () => {
    const clock = new TestClock();
    const { runtime, code, hostToken, p1 } = bootGame(clock);

    runtime.hostAction(code, { hostToken, action: "start", fromPhase: "lobby", fromIndex: -1 });
    expect(phaseOf(runtime, code, hostToken)).toBe("question");
    expect(clock.pending.length).toBe(1);

    // One of two joined players answers mid-question — the reduction consumes
    // the timer; the runtime must re-arm the outstanding deadline.
    clock.advance(5_000);
    const ans = runtime.answer(code, { playerId: p1, option: 0 });
    expect(ans.ok).toBe(true);
    expect(phaseOf(runtime, code, hostToken)).toBe("question"); // not early-closed (2nd player pending)
    expect(clock.pending.length).toBe(1); // REGRESSION: was 0 before the fix

    // The countdown still fires at the original deadline and closes the question.
    clock.advance(15_000);
    expect(phaseOf(runtime, code, hostToken)).toBe("reveal");
    runtime.shutdown();
  });

  test("mid-question joins/connect churn also keep the deadline armed", () => {
    const clock = new TestClock();
    const { runtime, code, hostToken, p2 } = bootGame(clock);

    runtime.hostAction(code, { hostToken, action: "start", fromPhase: "lobby", fromIndex: -1 });
    clock.advance(1_000);
    // A re-attach join (branch 1) during the question is a reduction too.
    const rejoin = runtime.join(code, { name: "Bo", playerId: p2, roomNonce: undefined });
    expect(rejoin.ok).toBe(false); // nonce mismatch → first-join path → lobby-gated
    expect(clock.pending.length).toBe(1);

    clock.advance(19_000);
    expect(phaseOf(runtime, code, hostToken)).toBe("reveal");
    runtime.shutdown();
  });
});
