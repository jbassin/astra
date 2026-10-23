/**
 * The single S1/S2 wire contract (spec §4a) + the quiz-file shape (D31-4). Zod
 * validates both an untrusted KDL-parsed quiz file and every outbound SSE snapshot
 * frame — `game.ts`'s projections are built to satisfy these types, and `rooms.ts`/
 * `src/server.ts` import only these, never raw KDL nodes (KDL at the edges).
 */
import { z } from "zod";

// --- quiz files (D31-4) ---------------------------------------------------------

export const QuizOptionSchema = z
  .object({
    label: z.string().min(1),
    correct: z.boolean(),
  })
  .strict();

export const QuizQuestionSchema = z
  .object({
    text: z.string().min(1),
    time: z.number().int().min(5).max(120).default(20),
    options: z.array(QuizOptionSchema).min(2).max(4),
  })
  .strict()
  .refine((q) => q.options.filter((o) => o.correct).length === 1, {
    message: "exactly one option must have correct=#true",
    path: ["options"],
  });

export const QuizSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    questions: z.array(QuizQuestionSchema).min(1),
  })
  .strict();

export type QuizOption = z.infer<typeof QuizOptionSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

/** The four Kahoot answer identities (D31-6) — shape+color double encoding, index-mapped. */
export const SHAPES = ["triangle", "diamond", "circle", "square"] as const;
export type Shape = (typeof SHAPES)[number];
export const ShapeSchema = z.enum(SHAPES);

// --- the snapshot union (spec §4a) -----------------------------------------------
//
// Common fields on every non-`gone` frame. `gone` deliberately carries ONLY
// `{phase:"gone"}` (spec, verbatim) — an unknown/GC'd room has no state to
// project, so it skips `type`/`code`/etc. entirely. Both HostSnapshot and
// PlayerSnapshot are discriminated on `phase` (the field every variant, including
// `gone`, actually has — `type` alone wouldn't cover `gone`).

const Common = z.object({
  type: z.literal("state"),
  code: z.string(),
  quizTitle: z.string(),
  questionIndex: z.number(),
  questionCount: z.number(),
  serverNow: z.number(),
});

const HostLobbySchema = Common.extend({
  phase: z.literal("lobby"),
  players: z.array(z.string()),
  joinUrl: z.string(),
}).strict();

const PlayerLobbySchema = Common.extend({
  phase: z.literal("lobby"),
  you: z.object({ name: z.string() }),
  playerCount: z.number(),
}).strict();

const HostQuestionSchema = Common.extend({
  phase: z.literal("question"),
  questionText: z.string(),
  options: z.array(z.object({ label: z.string(), shape: ShapeSchema })),
  endsAt: z.number(),
  answeredCount: z.number(),
  connectedCount: z.number(),
}).strict();

// The player projection carries NO option text and NO correct flag — a full-state
// frame would leak the answer to devtools (review blocker); correctness data
// exists only from `reveal` onward.
const PlayerQuestionSchema = Common.extend({
  phase: z.literal("question"),
  optionCount: z.number(),
  endsAt: z.number(),
  hasAnswered: z.boolean(),
}).strict();

const HostRevealSchema = Common.extend({
  phase: z.literal("reveal"),
  questionText: z.string(),
  options: z.array(
    z.object({ label: z.string(), shape: ShapeSchema, correct: z.boolean(), count: z.number() }),
  ),
}).strict();

const PlayerRevealSchema = Common.extend({
  phase: z.literal("reveal"),
  correct: z.boolean(),
  pointsGained: z.number(),
  score: z.number(),
  rank: z.number(),
  streak: z.number(),
}).strict();

const HostScoreboardSchema = Common.extend({
  phase: z.literal("scoreboard"),
  top: z.array(z.object({ name: z.string(), score: z.number(), delta: z.number() })),
}).strict();

const PlayerScoreboardSchema = Common.extend({
  phase: z.literal("scoreboard"),
  score: z.number(),
  rank: z.number(),
}).strict();

const PodiumBase = Common.extend({
  phase: z.literal("podium"),
  standings: z.array(z.object({ name: z.string(), score: z.number() })),
  aborted: z.boolean(),
});

const HostPodiumSchema = PodiumBase.strict();

const PlayerPodiumSchema = PodiumBase.extend({
  you: z.object({ rank: z.number(), score: z.number() }),
}).strict();

export const GoneSchema = z.object({ phase: z.literal("gone") }).strict();

export const HostSnapshotSchema = z.discriminatedUnion("phase", [
  HostLobbySchema,
  HostQuestionSchema,
  HostRevealSchema,
  HostScoreboardSchema,
  HostPodiumSchema,
  GoneSchema,
]);

export const PlayerSnapshotSchema = z.discriminatedUnion("phase", [
  PlayerLobbySchema,
  PlayerQuestionSchema,
  PlayerRevealSchema,
  PlayerScoreboardSchema,
  PlayerPodiumSchema,
  GoneSchema,
]);

export type HostSnapshot = z.infer<typeof HostSnapshotSchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type GoneSnapshot = z.infer<typeof GoneSchema>;

/** The single terminal frame for an unknown/GC'd room (D31-2) — never a 404. */
export const GONE_SNAPSHOT: GoneSnapshot = { phase: "gone" };

// --- results.jsonl row (D31-10) --------------------------------------------------

export const ResultRowSchema = z
  .object({
    at: z.string(),
    quizId: z.string(),
    quizTitle: z.string(),
    questionCount: z.number(),
    aborted: z.boolean(),
    standings: z.array(z.object({ name: z.string(), score: z.number() })),
  })
  .strict();

export type ResultRow = z.infer<typeof ResultRowSchema>;
