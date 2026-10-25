import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createHandler,
  createService,
  json,
  route,
  type Service,
  type ServiceDefinition,
} from "@astra/service-kit";
import { serveFile } from "@astra/site-kit";
import { trace } from "@opentelemetry/api";
import type { Server } from "srvx";
import { z } from "zod";

import { must } from "./assert";
import type { Phase } from "./game";
import { createRoomsRuntime, type RoomsRuntime, type RoomsRuntimeOptions } from "./rooms";

const SERVICE_NAME = "astra.menhir";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

interface AppOptions {
  /** Absolute path to the built app (vite `dist/`). */
  distDir: string;
  /** Runtime construction options — a fresh RoomsRuntime is built per createApp
   * call (tests inject a fake clock via `runtime` directly instead — see below). */
  runtimeOptions?: RoomsRuntimeOptions;
  /** Inject an already-built runtime (tests: fake clock, tiny GC interval). Takes
   * precedence over `runtimeOptions`. */
  runtime?: RoomsRuntime;
}

export interface RunningServer {
  server: Server;
  service: Service;
  runtime: RoomsRuntime;
  stop(): Promise<void>;
}

// Request bodies. Each schema's messages are the exact error strings the API has always
// answered with (the response pins in test/pins.test.ts hold them), so a bad body still
// reads `{ "error": "<message>" }`.
const CREATE_REQUIRED = "quizId (string) is required";
const CreateBody = z.object(
  { quizId: z.string({ error: CREATE_REQUIRED }) },
  { error: CREATE_REQUIRED },
);

const JOIN_REQUIRED = "name (non-empty string) is required";
const JoinBody = z.object(
  {
    name: z
      .string({ error: JOIN_REQUIRED })
      .refine((name) => name.trim() !== "", { error: JOIN_REQUIRED }),
    // Optional and lenient: anything but a string means "not given".
    playerId: z.string().optional().catch(undefined),
    roomNonce: z.string().optional().catch(undefined),
  },
  { error: JOIN_REQUIRED },
);

const ANSWER_REQUIRED = "playerId (string) and option (number) are required";
const AnswerBody = z.object(
  {
    playerId: z.string({ error: ANSWER_REQUIRED }),
    option: z.number({ error: ANSWER_REQUIRED }),
  },
  { error: ANSWER_REQUIRED },
);

const HOST_REQUIRED = "hostToken/action/fromPhase/fromIndex are required";
const HostBody = z.object(
  {
    hostToken: z.string({ error: HOST_REQUIRED }),
    action: z.enum(["start", "next", "end"], { error: HOST_REQUIRED }),
    fromPhase: z.string({ error: HOST_REQUIRED }),
    fromIndex: z.number({ error: HOST_REQUIRED }),
  },
  // A JSON array is an object to the old hand check, so it gets the field message.
  { error: (issue) => (Array.isArray(issue.input) ? HOST_REQUIRED : "invalid body") },
);

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Tag the request span with the room it acts on. */
function roomSpan(code: string): void {
  trace.getActiveSpan()?.setAttribute("menhir.room", code);
}

/** The service definition: the game API under `/api/` and the SPA for everything else. */
function definition(runtime: RoomsRuntime, distDir: string): ServiceDefinition {
  async function serveIndex(): Promise<Response> {
    let html: string;
    try {
      html = await readFile(resolve(distDir, "index.html"), "utf8");
    } catch {
      return new Response("not found\n", { status: 404 });
    }
    return new Response(html, {
      headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-cache" },
    });
  }

  // Bun.file(...) → @astra/site-kit's `serveFile` (the `send`-backed Range/206
  // bridge). index.html is served separately above; this only ever
  // hits built hashed assets — and the SPA fallback covers /, /host, /host/:code.
  async function serveStatic(req: Request): Promise<Response> {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    if (pathname === "/" || pathname.endsWith("/")) return serveIndex();

    const target = resolve(distDir, `.${pathname}`);
    if (target !== distDir && !target.startsWith(`${distDir}/`)) {
      return new Response("forbidden\n", { status: 403 });
    }
    if (!(await isFile(target))) return serveIndex(); // SPA fallback (/host, /host/:code, ...)
    return serveFile(req, target);
  }

  return {
    serviceName: SERVICE_NAME,
    invalidJson: "invalid json",
    groups: [
      {
        // An unmatched /api/* path answers an explicit JSON 404 before the SPA fallback (a
        // typo'd API path must not 200-HTML as if it were a client route).
        prefix: "/api/",
        notFound: "not found",
        routes: [
          route({
            method: "GET",
            path: "/api/quizzes",
            handler: () => json(runtime.listQuizzes()),
          }),
          route({
            method: "POST",
            path: "/api/game",
            body: CreateBody,
            handler: async (ctx) => {
              const body = await ctx.body();
              const result = runtime.createGame(body.quizId);
              if (!result.ok) return json({ error: result.error }, 404);
              return json({ code: result.code, hostToken: result.hostToken });
            },
          }),
          route({
            method: "POST",
            path: "/api/game/:code/join",
            body: JoinBody,
            handler: async (ctx) => {
              const code = must(ctx.params.code, "the route has a :code");
              roomSpan(code);
              const body = await ctx.body();
              const result = runtime.join(code, body);
              if (!result.ok) return json({ error: result.error }, result.status);
              return json({ playerId: result.playerId, roomNonce: result.roomNonce });
            },
          }),
          route({
            method: "POST",
            path: "/api/game/:code/answer",
            body: AnswerBody,
            handler: async (ctx) => {
              const code = must(ctx.params.code, "the route has a :code");
              roomSpan(code);
              const body = await ctx.body();
              const result = runtime.answer(code, body);
              if (!result.ok) return json({ error: result.error }, result.status);
              return json({});
            },
          }),
          route({
            method: "POST",
            path: "/api/game/:code/host",
            body: HostBody,
            handler: async (ctx) => {
              const code = must(ctx.params.code, "the route has a :code");
              roomSpan(code);
              const body = await ctx.body();
              const result = runtime.hostAction(code, {
                ...body,
                fromPhase: body.fromPhase as Phase,
              });
              if (!result.ok) return json({ error: result.error }, result.status);
              return json({ snapshot: result.snapshot });
            },
          }),
          route({
            method: "GET",
            path: "/api/events/:code",
            handler: (ctx) => {
              const code = must(ctx.params.code, "the route has a :code");
              const role = ctx.url.searchParams.get("role");
              const playerId = ctx.url.searchParams.get("playerId") ?? undefined;
              if (role !== "host" && role !== "player") {
                return json({ error: "role must be 'host' or 'player'" }, 400);
              }
              if (role === "player" && !playerId) {
                return json({ error: "playerId is required for role=player" }, 400);
              }
              const stream = runtime.openStream(code, role, playerId);
              return new Response(stream, { headers: SSE_HEADERS });
            },
          }),
        ],
      },
    ],
    fallback: (req) => {
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req);
      return new Response("method not allowed\n", { status: 405 });
    },
  };
}

function runtimeOf(opts: AppOptions): RoomsRuntime {
  return (
    opts.runtime ??
    createRoomsRuntime(
      must(opts.runtimeOptions, "createApp needs either `runtime` or `runtimeOptions`"),
    )
  );
}

/** Build the request handler + its runtime without binding a port (unit-testable). */
export function createApp(opts: AppOptions): {
  runtime: RoomsRuntime;
  handle: (req: Request) => Promise<Response>;
} {
  const runtime = runtimeOf(opts);
  return { runtime, handle: createHandler(definition(runtime, opts.distDir)).handle };
}

/** Bind the app to a port. On shutdown the server drains, then the runtime stops. */
export function startServer(opts: AppOptions & { port: number }): RunningServer {
  const runtime = runtimeOf(opts);
  const service = createService({ ...definition(runtime, opts.distDir), port: opts.port });
  service.onShutdown(() => runtime.shutdown());
  return { server: service.server, service, runtime, stop: () => service.close() };
}
