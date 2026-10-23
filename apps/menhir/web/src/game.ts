/**
 * The pure menhir game engine (D31-3). `reduce(state, event, now) → {state, effects}`
 * is the single source of truth for every phase transition + the scoring formula
 * (D31-5); `rooms.ts` is the only caller, owning the timer handle, the SSE sink
 * registry, and IO (the `appendResults` effect). Nothing in this file touches the
 * clock or a scheduler directly — `now` is always injected — so every event
 * sequence here is driven by hand in tests, no fake timers required.
 *
 * `create` is modelled as a reduce event too (state: RoomState | null — `null`
 * exclusively for `create`), so the whole event list in the spec (create, join,
 * answer, hostAction, timerFired, connect, disconnect) goes through one function.
 * The literal spec signature is `reduce(state, event, now) → {state, effects}`;
 * this file adds an optional `result` alongside for the handful of events whose
 * caller needs more than a state diff to answer an HTTP request (join's assigned
 * playerId, join/answer's rejection reason) — the state+effects contract is
 * unchanged, `result` is a documented, disclosed extension (see the S1 build
 * record / handoff report for the rationale).
 */
import { must } from "./assert";
import { type Quiz, type Shape, SHAPES } from "./schema";

// --- state ------------------------------------------------------------------------

export type Phase = "lobby" | "question" | "reveal" | "scoreboard" | "podium";

/** `{option, t, pointsGained}` — the single source for delta/pointsGained/rank/tiebreak
 * (spec §4a). `option: null` = the player never answered (timeout). */
export interface AwardRecord {
  option: number | null;
  t: number;
  pointsGained: number;
}

export interface PlayerRecord {
  id: string;
  name: string;
  score: number;
  streak: number;
  /** Sum of each question's charged time (min(t,T), or T for a timeout) — the D31-5 tiebreak. */
  totalTime: number;
  /** ≥1 live SSE sink right now (rooms.ts refcounts tabs down to this one flag). */
  connected: boolean;
  /** questionIndex → this player's award for that question. */
  answers: Map<number, AwardRecord>;
}

export interface RoomState {
  code: string;
  roomNonce: string;
  hostToken: string;
  quizId: string;
  quizTitle: string;
  questions: Quiz["questions"];
  joinUrl: string;
  phase: Phase;
  /** -1 in lobby; 0-based once the first question opens. */
  questionIndex: number;
  /** Server time the current question opened (null outside "question"). */
  questionStartedAt: number | null;
  players: Map<string, PlayerRecord>;
  aborted: boolean;
  createdAt: number;
}

// --- events -------------------------------------------------------------------------

export type GameEvent =
  | {
      type: "create";
      quiz: Quiz;
      code: string;
      hostToken: string;
      roomNonce: string;
      joinUrl: string;
    }
  | { type: "join"; playerId: string; roomNonce: string; name: string }
  | { type: "answer"; playerId: string; option: number }
  | {
      type: "hostAction";
      action: "start" | "next" | "end";
      fromPhase: Phase;
      fromIndex: number;
    }
  | { type: "timerFired"; phase: Phase; questionIndex: number }
  | { type: "connect"; playerId?: string }
  | { type: "disconnect"; playerId?: string };

// --- effects --------------------------------------------------------------------

export type Effect =
  | { kind: "schedule"; at: number }
  | { kind: "cancelTimer" }
  | { kind: "broadcast" }
  | { kind: "appendResults"; row: import("./schema").ResultRow };

export type JoinResult =
  | { kind: "joined"; playerId: string; roomNonce: string; reattached: boolean }
  | { kind: "rejected"; reason: "lobby-only" | "name-taken" };

export type AnswerResult =
  | { kind: "accepted" }
  | {
      kind: "rejected";
      reason: "not-question-phase" | "already-answered" | "unknown-player" | "invalid-option";
    };

export interface ReduceResult {
  state: RoomState;
  effects: Effect[];
  result?: JoinResult | AnswerResult;
}

// --- helpers ----------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** SHAPES is a fixed 4-tuple and options.length is Zod-bounded to 2-4 (D31-4), so
 * this index is always in range — `must` documents that invariant instead of `!`. */
function shapeFor(index: number): Shape {
  return must(SHAPES[index], `option index ${index} has no shape (max 4 options)`);
}

function clonePlayers(players: Map<string, PlayerRecord>): Map<string, PlayerRecord> {
  return new Map(players);
}

function currentQuestion(state: RoomState): Quiz["questions"][number] {
  const q = state.questions[state.questionIndex];
  if (!q) throw new Error(`menhir: no question at index ${state.questionIndex}`);
  return q;
}

function countAnswered(state: RoomState): number {
  let n = 0;
  for (const p of state.players.values()) if (p.answers.has(state.questionIndex)) n++;
  return n;
}

function countConnectedRoster(state: RoomState): number {
  let n = 0;
  for (const p of state.players.values()) if (p.connected) n++;
  return n;
}

/** Dense competition ranking: score desc, then totalTime asc (lower charged time wins ties). */
export function computeRanks(players: Map<string, PlayerRecord>): Map<string, number> {
  const list = [...players.values()];
  const ranks = new Map<string, number>();
  for (const p of list) {
    const better = list.filter(
      (o) => o.score > p.score || (o.score === p.score && o.totalTime < p.totalTime),
    ).length;
    ranks.set(p.id, better + 1);
  }
  return ranks;
}

/** Assign timeout awards `{option:null, t:T, pointsGained:0}` + reset the streak for
 * every joined player who never answered the current question. Pure; does not
 * change `phase`. Shared by `closeQuestion` and the `end`-mid-question path. */
function applyTimeouts(state: RoomState): RoomState {
  const q = currentQuestion(state);
  const players = clonePlayers(state.players);
  for (const [id, p] of players) {
    if (p.answers.has(state.questionIndex)) continue;
    const answers = new Map(p.answers);
    answers.set(state.questionIndex, { option: null, t: q.time, pointsGained: 0 });
    players.set(id, { ...p, streak: 0, totalTime: p.totalTime + q.time, answers });
  }
  return { ...state, players };
}

/** question → reveal: fill in timeouts, stop the clock. */
function closeQuestion(state: RoomState): RoomState {
  return { ...applyTimeouts(state), phase: "reveal", questionStartedAt: null };
}

/** lobby|scoreboard → question(index): fresh countdown, `schedule` effect. */
function openQuestion(state: RoomState, index: number, now: number): ReduceResult {
  const q = state.questions[index];
  if (!q) throw new Error(`menhir: openQuestion out of range (index ${index})`);
  const next: RoomState = {
    ...state,
    phase: "question",
    questionIndex: index,
    questionStartedAt: now,
  };
  return {
    state: next,
    effects: [{ kind: "schedule", at: now + q.time * 1000 }, { kind: "broadcast" }],
  };
}

function buildResultRow(state: RoomState, aborted: boolean): import("./schema").ResultRow {
  const ranked = [...state.players.values()].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.totalTime - b.totalTime;
  });
  return {
    at: new Date().toISOString(),
    quizId: state.quizId,
    quizTitle: state.quizTitle,
    questionCount: state.questions.length,
    aborted,
    standings: ranked.map((p) => ({ name: p.name, score: p.score })),
  };
}

/** any → podium: append the results row (D31-10), including aborted games. */
function toPodium(state: RoomState, aborted: boolean, hadTimer: boolean): ReduceResult {
  const next: RoomState = { ...state, phase: "podium", aborted, questionStartedAt: null };
  const effects: Effect[] = [];
  if (hadTimer) effects.push({ kind: "cancelTimer" });
  effects.push(
    { kind: "appendResults", row: buildResultRow(next, aborted) },
    { kind: "broadcast" },
  );
  return { state: next, effects };
}

/** Re-check the early-close predicate (D31-3) after an answer/connect/disconnect.
 * A room with zero connected roster members NEVER early-closes (explicit guard,
 * kept even though `answeredCount > 0` alone would almost always imply it — the
 * spec calls this out as an invariant to hold under every edge case). */
function maybeEarlyClose(state: RoomState): { state: RoomState; closed: boolean } {
  if (state.phase !== "question") return { state, closed: false };
  const answered = countAnswered(state);
  const connected = countConnectedRoster(state);
  if (connected > 0 && answered > 0 && answered >= connected) {
    return { state: closeQuestion(state), closed: true };
  }
  return { state, closed: false };
}

// --- create -------------------------------------------------------------------------

function handleCreate(event: Extract<GameEvent, { type: "create" }>, now: number): ReduceResult {
  const state: RoomState = {
    code: event.code,
    roomNonce: event.roomNonce,
    hostToken: event.hostToken,
    quizId: event.quiz.id,
    quizTitle: event.quiz.title,
    questions: event.quiz.questions,
    joinUrl: event.joinUrl,
    phase: "lobby",
    questionIndex: -1,
    questionStartedAt: null,
    players: new Map(),
    aborted: false,
    createdAt: now,
  };
  return { state, effects: [] };
}

// --- join (D31-9) -------------------------------------------------------------------

function handleJoin(state: RoomState, event: Extract<GameEvent, { type: "join" }>): ReduceResult {
  const known = event.roomNonce === state.roomNonce && state.players.has(event.playerId);
  if (known) {
    // Re-attach: any phase, name-collision exempt, keeps score. Identity (name,
    // score, streak, answers) is untouched — only `connected` mirrors reality,
    // and that's driven by connect/disconnect, not join.
    return {
      state,
      effects: [{ kind: "broadcast" }],
      result: {
        kind: "joined",
        playerId: event.playerId,
        roomNonce: state.roomNonce,
        reattached: true,
      },
    };
  }
  // First join: lobby-gated, live-name-collision-checked. An unknown playerId
  // (or a nonce mismatch against a recycled code) falls through to here, never errors.
  if (state.phase !== "lobby") {
    return { state, effects: [], result: { kind: "rejected", reason: "lobby-only" } };
  }
  const nameTaken = [...state.players.values()].some((p) => p.name === event.name);
  if (nameTaken) {
    return { state, effects: [], result: { kind: "rejected", reason: "name-taken" } };
  }
  const players = clonePlayers(state.players);
  players.set(event.playerId, {
    id: event.playerId,
    name: event.name,
    score: 0,
    streak: 0,
    totalTime: 0,
    connected: false,
    answers: new Map(),
  });
  return {
    state: { ...state, players },
    effects: [{ kind: "broadcast" }],
    result: {
      kind: "joined",
      playerId: event.playerId,
      roomNonce: state.roomNonce,
      reattached: false,
    },
  };
}

// --- answer (D31-5 scoring) -----------------------------------------------------

function handleAnswer(
  state: RoomState,
  event: Extract<GameEvent, { type: "answer" }>,
  now: number,
): ReduceResult {
  if (state.phase !== "question") {
    return { state, effects: [], result: { kind: "rejected", reason: "not-question-phase" } };
  }
  const player = state.players.get(event.playerId);
  if (!player) {
    return { state, effects: [], result: { kind: "rejected", reason: "unknown-player" } };
  }
  if (player.answers.has(state.questionIndex)) {
    return { state, effects: [], result: { kind: "rejected", reason: "already-answered" } };
  }
  const q = currentQuestion(state);
  if (event.option < 0 || event.option >= q.options.length) {
    return { state, effects: [], result: { kind: "rejected", reason: "invalid-option" } };
  }

  const T = q.time;
  const elapsedSeconds = (now - (state.questionStartedAt ?? now)) / 1000;
  const t = clamp(elapsedSeconds, 0, T);
  const correct = q.options[event.option]?.correct === true;
  const newStreak = correct ? player.streak + 1 : 0;
  let pointsGained = 0;
  if (correct) {
    const base = Math.round(1000 * (1 - t / T / 2));
    const bonus = newStreak >= 2 ? 100 : 0;
    pointsGained = base + bonus;
  }

  const answers = new Map(player.answers);
  answers.set(state.questionIndex, { option: event.option, t, pointsGained });
  const updatedPlayer: PlayerRecord = {
    ...player,
    score: player.score + pointsGained,
    streak: newStreak,
    totalTime: player.totalTime + t,
    answers,
  };
  const players = clonePlayers(state.players);
  players.set(event.playerId, updatedPlayer);
  let next: RoomState = { ...state, players };

  const effects: Effect[] = [{ kind: "broadcast" }];
  const { state: maybeClosed, closed } = maybeEarlyClose(next);
  if (closed) {
    next = maybeClosed;
    effects.unshift({ kind: "cancelTimer" });
  }

  return { state: next, effects, result: { kind: "accepted" } };
}

// --- hostAction (D31-3 absolute actions) -----------------------------------------

function handleHostAction(
  state: RoomState,
  event: Extract<GameEvent, { type: "hostAction" }>,
  now: number,
): ReduceResult {
  // Absolute, not relative: a stale/duplicate action (fromPhase/fromIndex no
  // longer matching reality) is a silent 200 no-op — this is what makes two
  // identical `next` calls advance exactly once.
  if (event.fromPhase !== state.phase || event.fromIndex !== state.questionIndex) {
    return { state, effects: [] };
  }

  switch (event.action) {
    case "start": {
      if (state.phase !== "lobby") return { state, effects: [] };
      return openQuestion(state, 0, now);
    }
    case "next": {
      if (state.phase === "question") {
        // Host escape hatch: force-close, scoring whoever answered.
        const closed = closeQuestion(state);
        return { state: closed, effects: [{ kind: "cancelTimer" }, { kind: "broadcast" }] };
      }
      if (state.phase === "reveal") {
        return { state: { ...state, phase: "scoreboard" }, effects: [{ kind: "broadcast" }] };
      }
      if (state.phase === "scoreboard") {
        const nextIndex = state.questionIndex + 1;
        if (nextIndex < state.questions.length) return openQuestion(state, nextIndex, now);
        return toPodium(state, false, false);
      }
      // lobby / podium: `next` doesn't apply.
      return { state, effects: [] };
    }
    case "end": {
      if (state.phase === "podium") return { state, effects: [] };
      const wasQuestion = state.phase === "question";
      const finalState = wasQuestion ? applyTimeouts(state) : state;
      return toPodium(finalState, true, wasQuestion);
    }
  }
}

// --- timerFired (stale-timer no-op) ----------------------------------------------

function handleTimerFired(
  state: RoomState,
  event: Extract<GameEvent, { type: "timerFired" }>,
): ReduceResult {
  if (event.phase !== state.phase || event.questionIndex !== state.questionIndex) {
    return { state, effects: [] }; // stale — armed for a phase/index we've moved past
  }
  if (state.phase !== "question") return { state, effects: [] }; // defensive; never armed otherwise
  return { state: closeQuestion(state), effects: [{ kind: "broadcast" }] };
}

// --- connect / disconnect (roster connectivity, for the early-close predicate) ---

function setConnected(
  state: RoomState,
  event: Extract<GameEvent, { type: "connect" | "disconnect" }>,
  connected: boolean,
): ReduceResult {
  // Host sinks (playerId undefined) carry no roster-connectivity meaning — the
  // reducer only tracks PLAYER connectivity (rooms.ts owns host sink bookkeeping
  // directly, since it never feeds into any game-state decision).
  if (event.playerId === undefined) return { state, effects: [] };
  const player = state.players.get(event.playerId);
  if (!player || player.connected === connected) return { state, effects: [] };

  const players = clonePlayers(state.players);
  players.set(event.playerId, { ...player, connected });
  let next: RoomState = { ...state, players };

  const effects: Effect[] = [{ kind: "broadcast" }];
  const { state: maybeClosed, closed } = maybeEarlyClose(next);
  if (closed) {
    next = maybeClosed;
    effects.unshift({ kind: "cancelTimer" });
  }
  return { state: next, effects };
}

// --- the reducer --------------------------------------------------------------------

export function reduce(state: RoomState | null, event: GameEvent, now: number): ReduceResult {
  if (event.type === "create") return handleCreate(event, now);
  if (!state) throw new Error(`menhir: reduce() received event "${event.type}" with null state`);

  let result: ReduceResult;
  switch (event.type) {
    case "join":
      result = handleJoin(state, event);
      break;
    case "answer":
      result = handleAnswer(state, event, now);
      break;
    case "hostAction":
      result = handleHostAction(state, event, now);
      break;
    case "timerFired":
      result = handleTimerFired(state, event);
      break;
    case "connect":
      result = setConnected(state, event, true);
      break;
    case "disconnect":
      result = setConnected(state, event, false);
      break;
  }
  return result;
}

// --- projections (spec §4a) -------------------------------------------------------
//
// Pure derivations of RoomState → the wire snapshot, so they're testable with the
// same hand-driven clock as the reducer. `rooms.ts` calls these when executing a
// `broadcast` effect (and once, directly, for a freshly-connected sink).

function commonFields(state: RoomState, now: number) {
  return {
    type: "state" as const,
    code: state.code,
    quizTitle: state.quizTitle,
    questionIndex: state.questionIndex,
    questionCount: state.questions.length,
    serverNow: now,
  };
}

function optionCountForIndex(state: RoomState, questionIndex: number, optionIndex: number): number {
  let n = 0;
  for (const p of state.players.values()) {
    const award = p.answers.get(questionIndex);
    if (award && award.option === optionIndex) n++;
  }
  return n;
}

function topN(state: RoomState, n: number) {
  const ranked = [...state.players.values()].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.totalTime - b.totalTime;
  });
  return ranked.slice(0, n).map((p) => ({
    name: p.name,
    score: p.score,
    delta: p.answers.get(state.questionIndex)?.pointsGained ?? 0,
  }));
}

function standingsOf(state: RoomState) {
  const ranked = [...state.players.values()].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.totalTime - b.totalTime;
  });
  return ranked.map((p) => ({ name: p.name, score: p.score }));
}

export function projectHost(state: RoomState, now: number): import("./schema").HostSnapshot {
  const common = commonFields(state, now);
  switch (state.phase) {
    case "lobby":
      return {
        ...common,
        phase: "lobby",
        players: [...state.players.values()].map((p) => p.name),
        joinUrl: state.joinUrl,
      };
    case "question": {
      const q = currentQuestion(state);
      return {
        ...common,
        phase: "question",
        questionText: q.text,
        options: q.options.map((o, i) => ({ label: o.label, shape: shapeFor(i) })),
        endsAt: (state.questionStartedAt ?? now) + q.time * 1000,
        answeredCount: countAnswered(state),
        connectedCount: countConnectedRoster(state),
      };
    }
    case "reveal": {
      const q = currentQuestion(state);
      return {
        ...common,
        phase: "reveal",
        questionText: q.text,
        options: q.options.map((o, i) => ({
          label: o.label,
          shape: shapeFor(i),
          correct: o.correct,
          count: optionCountForIndex(state, state.questionIndex, i),
        })),
      };
    }
    case "scoreboard":
      return { ...common, phase: "scoreboard", top: topN(state, 5) };
    case "podium":
      return { ...common, phase: "podium", standings: standingsOf(state), aborted: state.aborted };
  }
}

export function projectPlayer(
  state: RoomState,
  playerId: string,
  now: number,
): import("./schema").PlayerSnapshot {
  const common = commonFields(state, now);
  const player = state.players.get(playerId);
  const ranks = computeRanks(state.players);

  switch (state.phase) {
    case "lobby":
      return {
        ...common,
        phase: "lobby",
        you: { name: player?.name ?? "" },
        playerCount: state.players.size,
      };
    case "question": {
      const q = currentQuestion(state);
      return {
        ...common,
        phase: "question",
        optionCount: q.options.length,
        endsAt: (state.questionStartedAt ?? now) + q.time * 1000,
        hasAnswered: player?.answers.has(state.questionIndex) ?? false,
      };
    }
    case "reveal": {
      const award = player?.answers.get(state.questionIndex);
      const q = currentQuestion(state);
      const correct =
        award?.option !== null && award?.option !== undefined
          ? q.options[award.option]?.correct === true
          : false;
      return {
        ...common,
        phase: "reveal",
        correct,
        pointsGained: award?.pointsGained ?? 0,
        score: player?.score ?? 0,
        rank: (player && ranks.get(player.id)) ?? state.players.size + 1,
        streak: player?.streak ?? 0,
      };
    }
    case "scoreboard":
      return {
        ...common,
        phase: "scoreboard",
        score: player?.score ?? 0,
        rank: (player && ranks.get(player.id)) ?? state.players.size + 1,
      };
    case "podium":
      return {
        ...common,
        phase: "podium",
        standings: standingsOf(state),
        aborted: state.aborted,
        you: {
          rank: (player && ranks.get(player.id)) ?? state.players.size + 1,
          score: player?.score ?? 0,
        },
      };
  }
}
