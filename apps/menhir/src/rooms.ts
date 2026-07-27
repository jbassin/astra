/**
 * The room runtime (D31-3/D31-8/D31-9) — the imperative shell around the pure
 * `game.ts` reducer. Owns `Map<code, Room>` (in-memory, ephemeral), ONE timer
 * handle per room (cleared before every reduction, re-armed only from a
 * `schedule` effect), the per-room SSE sink registry (host sinks + a refcounted
 * `Map<playerId, Set<sink>>` — two tabs = one player), and the 2h GC sweep.
 *
 * The clock + scheduler are injected (`Clock`) so tests drive time entirely by
 * hand — no real setTimeout waits, no flaky timing assertions.
 */
import { randomUUID } from "node:crypto";

import { lazyCounter } from "@astra/observe";

import {
  type Effect,
  type GameEvent,
  type Phase,
  projectHost,
  projectPlayer,
  reduce,
  type RoomState,
} from "./game";
import { appendResultRow } from "./results";
import { GONE_SNAPSHOT, type HostSnapshot, type Quiz } from "./schema";

// 23-letter unambiguous alphabet (no 0/O/1/I) — D31-8.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;
const HEARTBEAT_MS = 15_000;
const DEFAULT_GC_INTERVAL_MS = 5 * 60_000;
const DEFAULT_ROOM_TTL_MS = 2 * 60 * 60_000;

// D31-11 — lazyCounter defers real-instrument creation to first add(), so these
// (unlike a raw getMeter().createCounter()) are safe at module scope even though
// initTelemetry runs later in the entry (see libs/ts/observe's lazyCounter doc).
const gamesStartedCounter = lazyCounter("astra.menhir", "menhir.games.started", {
  description: "Games created via POST /api/game",
});
const gamesFinishedCounter = lazyCounter("astra.menhir", "menhir.games.finished", {
  description: "Games that reached podium (aborted or completed)",
});
const playersJoinedCounter = lazyCounter("astra.menhir", "menhir.players.joined", {
  description: "New players joining a room (re-attaches excluded)",
});
const answersReceivedCounter = lazyCounter("astra.menhir", "menhir.answers.received", {
  description: "Accepted (first-answer-wins) player answers",
});

export interface Sink {
  send(frame: string): void;
  close(): void;
}

interface Room {
  state: RoomState;
  timer: ReturnType<typeof setTimeout> | null;
  hostSinks: Set<Sink>;
  playerSinks: Map<string, Set<Sink>>;
  /** Runtime bookkeeping only (not engine state) — the pure reducer must never
   * mutate its own input, so GC's "time since last event" lives here, updated by
   * dispatch() after every event (even a no-op one still counts as activity). */
  lastActivity: number;
}

export interface Clock {
  now(): number;
  setTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(handle: ReturnType<typeof setTimeout>): void;
}

function unrefTimer(h: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  (h as unknown as { unref?: () => void }).unref?.();
  return h;
}

export const REAL_CLOCK: Clock = {
  now: () => Date.now(),
  setTimer: (cb, ms) => unrefTimer(setTimeout(cb, ms)),
  clearTimer: (h) => clearTimeout(h),
};

export interface JoinBody {
  name: string;
  playerId?: string;
  roomNonce?: string;
}

export interface AnswerBody {
  playerId: string;
  option: number;
}

export interface HostActionBody {
  hostToken: string;
  action: "start" | "next" | "end";
  fromPhase: Phase;
  fromIndex: number;
}

export type JoinOutcome =
  | { ok: true; playerId: string; roomNonce: string }
  | { ok: false; status: 404 | 403 | 409; error: string };

export type AnswerOutcome = { ok: true } | { ok: false; status: 404 | 400; error: string };

export type HostActionOutcome =
  | { ok: true; snapshot: HostSnapshot }
  | { ok: false; status: 404 | 403; error: string };

export interface RoomsRuntimeOptions {
  quizzes: Quiz[];
  publicOrigin: string;
  resultsPath: string;
  clock?: Clock;
  gcIntervalMs?: number;
  roomTtlMs?: number;
}

export interface RoomsRuntime {
  listQuizzes(): { id: string; title: string; questionCount: number }[];
  createGame(
    quizId: string,
  ): { ok: true; code: string; hostToken: string } | { ok: false; error: string };
  join(code: string, body: JoinBody): JoinOutcome;
  answer(code: string, body: AnswerBody): AnswerOutcome;
  hostAction(code: string, body: HostActionBody): HostActionOutcome;
  /** GET /api/events/:code — never 404s; an unknown/GC'd room streams `gone` once. */
  openStream(
    code: string,
    role: "host" | "player",
    playerId: string | undefined,
  ): ReadableStream<Uint8Array>;
  /** Exposed for tests — the real interval is unref'd + on a multi-minute cadence. */
  gcSweepOnce(): void;
  shutdown(): void;
}

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function randomCode(existing: ReadonlySet<string> | ReadonlyMap<string, unknown>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error("menhir: failed to allocate a unique room code after 1000 attempts");
}

export function createRoomsRuntime(opts: RoomsRuntimeOptions): RoomsRuntime {
  const clock = opts.clock ?? REAL_CLOCK;
  const gcIntervalMs = opts.gcIntervalMs ?? DEFAULT_GC_INTERVAL_MS;
  const roomTtlMs = opts.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
  const quizzesById = new Map(opts.quizzes.map((q) => [q.id, q]));
  const rooms = new Map<string, Room>();

  function broadcastRoom(room: Room, now: number): void {
    const hostFrame = sseFrame(projectHost(room.state, now));
    for (const sink of room.hostSinks) sink.send(hostFrame);
    for (const [playerId, sinks] of room.playerSinks) {
      const frame = sseFrame(projectPlayer(room.state, playerId, now));
      for (const sink of sinks) sink.send(frame);
    }
  }

  function applyEffects(code: string, room: Room, effects: Effect[], now: number): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case "schedule": {
          const delay = Math.max(0, effect.at - now);
          const armedPhase = room.state.phase;
          const armedIndex = room.state.questionIndex;
          room.timer = clock.setTimer(() => {
            room.timer = null;
            dispatch(
              code,
              { type: "timerFired", phase: armedPhase, questionIndex: armedIndex },
              clock.now(),
            );
          }, delay);
          break;
        }
        case "cancelTimer":
          // Already cleared unconditionally at the top of dispatch() below —
          // this branch documents transition intent, nothing more to do.
          break;
        case "broadcast":
          broadcastRoom(room, now);
          break;
        case "appendResults":
          gamesFinishedCounter.add(1, { aborted: String(effect.row.aborted) });
          void appendResultRow(opts.resultsPath, effect.row);
          break;
      }
    }
  }

  /** The ONE call site that runs an event through the pure reducer. Clears the
   * room's outstanding timer handle FIRST (spec discipline: "cleared before every
   * reduction"), then re-arms only if a `schedule` effect comes back. */
  function dispatch(code: string, event: GameEvent, now: number) {
    const room = rooms.get(code);
    if (!room) return null;
    if (room.timer !== null) {
      clock.clearTimer(room.timer);
      room.timer = null;
    }
    const result = reduce(room.state, event, now);
    room.state = result.state;
    room.lastActivity = now;
    applyEffects(code, room, result.effects, now);
    // Re-arm the outstanding question deadline when a reduction consumed the
    // timer without scheduling a new one — only openQuestion emits `schedule`,
    // so without this an answer/join/connect during a live question would
    // permanently disarm the countdown (S2b review blocker).
    if (
      room.timer === null &&
      room.state.phase === "question" &&
      room.state.questionStartedAt !== null
    ) {
      const q = room.state.questions[room.state.questionIndex];
      if (q) {
        const at = room.state.questionStartedAt + q.time * 1000;
        applyEffects(code, room, [{ kind: "schedule", at }], now);
      }
    }
    return result;
  }

  function gcSweepOnce(): void {
    const now = clock.now();
    const gone = sseFrame(GONE_SNAPSHOT);
    for (const [code, room] of rooms) {
      if (now - room.lastActivity <= roomTtlMs) continue;
      for (const sink of room.hostSinks) {
        sink.send(gone);
        sink.close();
      }
      for (const set of room.playerSinks.values()) {
        for (const sink of set) {
          sink.send(gone);
          sink.close();
        }
      }
      if (room.timer !== null) clock.clearTimer(room.timer);
      rooms.delete(code);
    }
  }

  const gcTimer = unrefTimer(
    setInterval(() => gcSweepOnce(), gcIntervalMs) as unknown as ReturnType<typeof setTimeout>,
  );

  const heartbeatTimer = unrefTimer(
    setInterval(() => {
      const frame = ": ping\n\n";
      for (const room of rooms.values()) {
        for (const sink of room.hostSinks) sink.send(frame);
        for (const set of room.playerSinks.values()) for (const sink of set) sink.send(frame);
      }
    }, HEARTBEAT_MS) as unknown as ReturnType<typeof setTimeout>,
  );

  return {
    listQuizzes() {
      return opts.quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        questionCount: q.questions.length,
      }));
    },

    createGame(quizId) {
      const quiz = quizzesById.get(quizId);
      if (!quiz) return { ok: false, error: "unknown quiz" };
      const now = clock.now();
      const code = randomCode(rooms);
      const hostToken = randomUUID();
      const roomNonce = randomUUID();
      const joinUrl = `${opts.publicOrigin}/?code=${code}`;
      const result = reduce(
        null,
        { type: "create", quiz, code, hostToken, roomNonce, joinUrl },
        now,
      );
      rooms.set(code, {
        state: result.state,
        timer: null,
        hostSinks: new Set(),
        playerSinks: new Map(),
        lastActivity: now,
      });
      gamesStartedCounter.add(1);
      return { ok: true, code, hostToken };
    },

    join(code, body) {
      const room = rooms.get(code);
      if (!room) return { ok: false, status: 404, error: "unknown room code" };
      const now = clock.now();
      const playerId = body.playerId ?? randomUUID();
      const roomNonce = body.roomNonce ?? "";
      const result = dispatch(code, { type: "join", playerId, roomNonce, name: body.name }, now);
      const outcome = result?.result;
      if (outcome?.kind === "rejected") {
        return {
          ok: false,
          status: outcome.reason === "lobby-only" ? 403 : 409,
          error: outcome.reason,
        };
      }
      if (outcome?.kind === "joined") {
        if (!outcome.reattached) playersJoinedCounter.add(1);
        return { ok: true, playerId: outcome.playerId, roomNonce: outcome.roomNonce };
      }
      return { ok: false, status: 404, error: "join produced no result" };
    },

    answer(code, body) {
      const room = rooms.get(code);
      if (!room) return { ok: false, status: 404, error: "unknown room code" };
      const now = clock.now();
      const result = dispatch(
        code,
        { type: "answer", playerId: body.playerId, option: body.option },
        now,
      );
      const outcome = result?.result;
      if (outcome?.kind === "rejected") return { ok: false, status: 400, error: outcome.reason };
      answersReceivedCounter.add(1);
      return { ok: true };
    },

    hostAction(code, body) {
      const room = rooms.get(code);
      if (!room) return { ok: false, status: 404, error: "unknown room code" };
      if (body.hostToken !== room.state.hostToken) {
        return { ok: false, status: 403, error: "bad host token" };
      }
      const now = clock.now();
      dispatch(
        code,
        {
          type: "hostAction",
          action: body.action,
          fromPhase: body.fromPhase,
          fromIndex: body.fromIndex,
        },
        now,
      );
      return { ok: true, snapshot: projectHost(room.state, clock.now()) };
    },

    openStream(code, role, playerId) {
      const encoder = new TextEncoder();
      // Held across start()/cancel() (the same underlying-source object's two
      // lifecycle callbacks) so cancel() removes exactly THIS connection's sink —
      // not every sink in the room (two host tabs, or two tabs for one player
      // via refcounting, must each be tracked independently).
      let sink: Sink | undefined;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          sink = {
            send(frame) {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(frame));
              } catch {
                closed = true;
              }
            },
            close() {
              if (closed) return;
              closed = true;
              try {
                controller.close();
              } catch {
                // already closed by the client side
              }
            },
          };

          const room = rooms.get(code);
          if (!room) {
            sink.send(sseFrame(GONE_SNAPSHOT));
            sink.close();
            return;
          }

          if (role === "host") {
            room.hostSinks.add(sink);
            sink.send(sseFrame(projectHost(room.state, clock.now())));
          } else {
            const pid = playerId ?? "";
            let set = room.playerSinks.get(pid);
            const wasEmpty = !set || set.size === 0;
            if (!set) {
              set = new Set();
              room.playerSinks.set(pid, set);
            }
            set.add(sink);
            sink.send(sseFrame(projectPlayer(room.state, pid, clock.now())));
            if (wasEmpty) dispatch(code, { type: "connect", playerId: pid }, clock.now());
          }
        },
        cancel() {
          if (!sink) return;
          const room = rooms.get(code);
          if (!room) return;
          if (role === "host") {
            room.hostSinks.delete(sink);
          } else {
            const pid = playerId ?? "";
            const set = room.playerSinks.get(pid);
            if (set) {
              set.delete(sink);
              if (set.size === 0) {
                room.playerSinks.delete(pid);
                dispatch(code, { type: "disconnect", playerId: pid }, clock.now());
              }
            }
          }
        },
      });
    },

    gcSweepOnce,

    shutdown() {
      clearInterval(gcTimer);
      clearInterval(heartbeatTimer);
    },
  };
}
