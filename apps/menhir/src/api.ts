/**
 * Fetch wrappers for the §4 API. Every success shape is Zod-validated (KDL at
 * the edges' sibling discipline — never trust an unparsed `Response.json()`),
 * mirroring the schema.ts snapshot union this file's `hostAction` response
 * reuses directly (`HostSnapshotSchema`) so both the SSE feed and the
 * host-action echo project through the exact same contract.
 */
import { z } from "zod";

import { type HostSnapshot, HostSnapshotSchema } from "./schema";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

async function request<T>(
  input: string,
  init: RequestInit | undefined,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, error: "network error — check your connection" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const error =
      isRecord(body) && typeof body.error === "string"
        ? body.error
        : `request failed (${res.status})`;
    return { ok: false, status: res.status, error };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: res.status, error: "malformed server response" };
  }
  return { ok: true, data: parsed.data };
}

function postJSON<T>(url: string, body: unknown, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  return request(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    schema,
  );
}

// --- GET /api/quizzes --------------------------------------------------------

const QuizListSchema = z.array(
  z.object({ id: z.string(), title: z.string(), questionCount: z.number() }).strict(),
);
export type QuizListItem = z.infer<typeof QuizListSchema>[number];

export function listQuizzes(): Promise<ApiResult<QuizListItem[]>> {
  return request("/api/quizzes", undefined, QuizListSchema);
}

// --- POST /api/game ------------------------------------------------------------

const CreateGameSchema = z.object({ code: z.string(), hostToken: z.string() }).strict();
export type CreateGameResult = z.infer<typeof CreateGameSchema>;

export function createGame(quizId: string): Promise<ApiResult<CreateGameResult>> {
  return postJSON("/api/game", { quizId }, CreateGameSchema);
}

// --- POST /api/game/:code/join --------------------------------------------------

const JoinSchema = z.object({ playerId: z.string(), roomNonce: z.string() }).strict();
export type JoinResult = z.infer<typeof JoinSchema>;

export interface JoinBody {
  name: string;
  playerId?: string;
  roomNonce?: string;
}

export function joinGame(code: string, body: JoinBody): Promise<ApiResult<JoinResult>> {
  return postJSON(`/api/game/${encodeURIComponent(code)}/join`, body, JoinSchema);
}

// --- POST /api/game/:code/answer -------------------------------------------------

const AnswerSchema = z.object({}).strict();

export function sendAnswer(
  code: string,
  body: { playerId: string; option: number },
): Promise<ApiResult<Record<string, never>>> {
  return postJSON(`/api/game/${encodeURIComponent(code)}/answer`, body, AnswerSchema);
}

// --- POST /api/game/:code/host ---------------------------------------------------

const HostActionResponseSchema = z.object({ snapshot: HostSnapshotSchema }).strict();

export interface HostActionBody {
  hostToken: string;
  action: "start" | "next" | "end";
  fromPhase: string;
  fromIndex: number;
}

export function hostAction(
  code: string,
  body: HostActionBody,
): Promise<ApiResult<{ snapshot: HostSnapshot }>> {
  return postJSON(`/api/game/${encodeURIComponent(code)}/host`, body, HostActionResponseSchema);
}
