import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { type Clock, createRoomsRuntime, type Timer } from "../src/rooms";
import type { Quiz } from "../src/schema";

interface Scheduled {
  cb: () => void;
  at: number;
  id: number;
}

/** Deterministic injected clock: timers and intervals fire only via advance(). */
class TestClock implements Clock {
  t = 1_000_000;
  /** One-shot timers (the question deadline). */
  pending: Scheduled[] = [];
  /** Repeating timers (the GC sweep, the SSE heartbeat), with their period. */
  intervals: (Scheduled & { every: number })[] = [];
  #nextId = 1;

  now(): number {
    return this.t;
  }

  setTimeout(cb: () => void, ms: number): Timer {
    const id = this.#nextId++;
    this.pending.push({ cb, at: this.t + ms, id });
    return { cancel: () => (this.pending = this.pending.filter((p) => p.id !== id)) };
  }

  setInterval(cb: () => void, ms: number): Timer {
    const id = this.#nextId++;
    this.intervals.push({ cb, at: this.t + ms, id, every: ms });
    return { cancel: () => (this.intervals = this.intervals.filter((p) => p.id !== id)) };
  }

  /** Move time forward, firing each due timer in order at its own due time. */
  advance(ms: number): void {
    const until = this.t + ms;
    for (;;) {
      const next = [...this.pending, ...this.intervals]
        .filter((p) => p.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.t = next.at;
      const interval = this.intervals.find((p) => p.id === next.id);
      if (interval) interval.at += interval.every;
      else this.pending = this.pending.filter((p) => p.id !== next.id);
      next.cb();
    }
    this.t = until;
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

  test("an unchanged deadline keeps its timer; leaving the question clears it", () => {
    const clock = new TestClock();
    const { runtime, code, hostToken, p1 } = bootGame(clock);

    runtime.hostAction(code, { hostToken, action: "start", fromPhase: "lobby", fromIndex: -1 });
    const [armed] = clock.pending;
    runtime.answer(code, { playerId: p1, option: 0 });
    expect(clock.pending).toEqual([armed]); // same handle, same due time: not re-armed

    runtime.hostAction(code, { hostToken, action: "next", fromPhase: "question", fromIndex: 0 });
    expect(clock.pending).toEqual([]); // reveal has no deadline
    runtime.hostAction(code, { hostToken, action: "next", fromPhase: "reveal", fromIndex: 0 });
    runtime.hostAction(code, { hostToken, action: "next", fromPhase: "scoreboard", fromIndex: 0 });
    expect(clock.pending.map((p) => p.at)).toEqual([clock.t + 20_000]); // question 2's own
    runtime.hostAction(code, { hostToken, action: "end", fromPhase: "question", fromIndex: 1 });
    expect(clock.pending).toEqual([]);
    runtime.shutdown();
  });
});

describe("rooms runtime clock seam", () => {
  test("the GC sweep runs on the injected clock and collects an idle room", () => {
    const clock = new TestClock();
    const runtime = createRoomsRuntime({
      quizzes: [QUIZ],
      publicOrigin: "https://menhir.test",
      resultsPath: join(mkdtempSync(join(tmpdir(), "menhir-gc-")), "results.jsonl"),
      clock,
      gcIntervalMs: 60_000,
      roomTtlMs: 120_000,
    });
    const created = runtime.createGame("test-quiz");
    if (!created.ok) throw new Error("createGame failed");
    clock.advance(120_000); // idle exactly the TTL: kept
    expect(runtime.join(created.code, { name: "Ana" }).ok).toBe(true);
    clock.advance(180_000); // idle past the TTL at the next sweep: collected
    expect(runtime.join(created.code, { name: "Bo" })).toMatchObject({ ok: false, status: 404 });
    runtime.shutdown();
    expect(clock.intervals).toEqual([]); // shutdown cancels the GC sweep and the heartbeat
  });

  test("the SSE heartbeat runs on the injected clock", async () => {
    const clock = new TestClock();
    const { runtime, code } = bootGame(clock);
    const reader = runtime.openStream(code, "host", undefined).getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first.startsWith("data: ")).toBe(true);
    clock.advance(15_000);
    expect(decoder.decode((await reader.read()).value)).toBe(": ping\n\n");
    await reader.cancel();
    runtime.shutdown();
  });

  test("a results row is stamped with the clock's time, not the wall clock", async () => {
    const clock = new TestClock();
    const resultsPath = join(mkdtempSync(join(tmpdir(), "menhir-results-")), "results.jsonl");
    const runtime = createRoomsRuntime({
      quizzes: [QUIZ],
      publicOrigin: "https://menhir.test",
      resultsPath,
      clock,
    });
    const created = runtime.createGame("test-quiz");
    if (!created.ok) throw new Error("createGame failed");
    runtime.hostAction(created.code, {
      hostToken: created.hostToken,
      action: "end",
      fromPhase: "lobby",
      fromIndex: -1,
    });
    await vi.waitFor(() => expect(existsSync(resultsPath)).toBe(true));
    const row = JSON.parse(readFileSync(resultsPath, "utf8")) as { at: string };
    expect(row.at).toBe(new Date(clock.t).toISOString());
    runtime.shutdown();
  });
});
