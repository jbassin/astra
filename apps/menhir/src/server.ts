import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { getTracer } from "@astra/observe";
import { serveFile } from "@astra/site-kit";
import { type Server, serve } from "srvx";

import { must } from "./assert";
import type { Phase } from "./game";
import { createRoomsRuntime, type RoomsRuntime, type RoomsRuntimeOptions } from "./rooms";

const tracer = getTracer("astra.menhir");

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

export interface AppOptions {
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
  runtime: RoomsRuntime;
  stop(): void;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Build the request handler + its runtime without binding a port (unit-testable). */
export function createApp(opts: AppOptions): {
  runtime: RoomsRuntime;
  handle: (req: Request) => Promise<Response>;
} {
  const runtime =
    opts.runtime ??
    createRoomsRuntime(
      must(opts.runtimeOptions, "createApp needs either `runtime` or `runtimeOptions`"),
    );
  const { distDir } = opts;

  function handleQuizzes(): Response {
    return json(200, runtime.listQuizzes());
  }

  async function handleCreateGame(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid json" });
    }
    if (!isRecord(body) || typeof body.quizId !== "string") {
      return json(400, { error: "quizId (string) is required" });
    }
    const result = runtime.createGame(body.quizId);
    if (!result.ok) return json(404, { error: result.error });
    return json(200, { code: result.code, hostToken: result.hostToken });
  }

  async function handleJoin(req: Request, code: string): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid json" });
    }
    if (!isRecord(body) || typeof body.name !== "string" || body.name.trim() === "") {
      return json(400, { error: "name (non-empty string) is required" });
    }
    const playerId = typeof body.playerId === "string" ? body.playerId : undefined;
    const roomNonce = typeof body.roomNonce === "string" ? body.roomNonce : undefined;
    const result = runtime.join(code, { name: body.name, playerId, roomNonce });
    if (!result.ok) return json(result.status, { error: result.error });
    return json(200, { playerId: result.playerId, roomNonce: result.roomNonce });
  }

  async function handleAnswer(req: Request, code: string): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid json" });
    }
    if (!isRecord(body) || typeof body.playerId !== "string" || typeof body.option !== "number") {
      return json(400, { error: "playerId (string) and option (number) are required" });
    }
    const result = runtime.answer(code, { playerId: body.playerId, option: body.option });
    if (!result.ok) return json(result.status, { error: result.error });
    return json(200, {});
  }

  async function handleHostAction(req: Request, code: string): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid json" });
    }
    if (!isRecord(body)) return json(400, { error: "invalid body" });
    const { hostToken, action, fromPhase, fromIndex } = body;
    if (
      typeof hostToken !== "string" ||
      (action !== "start" && action !== "next" && action !== "end") ||
      typeof fromPhase !== "string" ||
      typeof fromIndex !== "number"
    ) {
      return json(400, { error: "hostToken/action/fromPhase/fromIndex are required" });
    }
    const result = runtime.hostAction(code, {
      hostToken,
      action,
      fromPhase: fromPhase as Phase,
      fromIndex,
    });
    if (!result.ok) return json(result.status, { error: result.error });
    return json(200, { snapshot: result.snapshot });
  }

  function handleEvents(req: Request, code: string): Response {
    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const playerId = url.searchParams.get("playerId") ?? undefined;
    if (role !== "host" && role !== "player") {
      return json(400, { error: "role must be 'host' or 'player'" });
    }
    if (role === "player" && !playerId) {
      return json(400, { error: "playerId is required for role=player" });
    }
    const stream = runtime.openStream(code, role, playerId);
    return new Response(stream, { headers: SSE_HEADERS });
  }

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
  // bridge, R3 0022 S8). index.html is served separately above; this only ever
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

  /** Manual span per mutating API call (the weal-overlay `overlay.ingest` idiom —
   * @astra/observe registers no HTTP auto-instrumentation, so unwrapped routes
   * emit no traces at all). Static/SSE paths stay unspanned (long-lived streams
   * make useless spans). */
  function traced(name: string, code: string, fn: () => Promise<Response>): Promise<Response> {
    return tracer.startActiveSpan(name, async (span) => {
      span.setAttribute("menhir.room", code);
      try {
        const res = await fn();
        span.setAttribute("http.status_code", res.status);
        return res;
      } finally {
        span.end();
      }
    });
  }

  async function handle(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    const method = req.method;

    if (method === "GET" && pathname === "/api/quizzes") return handleQuizzes();
    if (method === "POST" && pathname === "/api/game") {
      return traced("menhir.create", "", () => handleCreateGame(req));
    }

    const gameMatch = /^\/api\/game\/([^/]+)\/(join|answer|host)$/.exec(pathname);
    if (method === "POST" && gameMatch) {
      const code = must(gameMatch[1], "gameMatch[1] (the route regex has 2 capture groups)");
      const action = must(gameMatch[2], "gameMatch[2] (the route regex has 2 capture groups)");
      if (action === "join") return traced("menhir.join", code, () => handleJoin(req, code));
      if (action === "answer") return traced("menhir.answer", code, () => handleAnswer(req, code));
      return traced("menhir.host_action", code, () => handleHostAction(req, code));
    }

    const eventsMatch = /^\/api\/events\/([^/]+)$/.exec(pathname);
    if (method === "GET" && eventsMatch) {
      return handleEvents(
        req,
        must(eventsMatch[1], "eventsMatch[1] (the route regex has 1 capture group)"),
      );
    }

    // Explicit 404 for any other /api/* path BEFORE the static/SPA fallback (a
    // typo'd API path must not 200-HTML as if it were a client route).
    if (pathname.startsWith("/api/")) return json(404, { error: "not found" });

    if (method === "GET" || method === "HEAD") return serveStatic(req);
    return new Response("method not allowed\n", { status: 405 });
  }

  return { runtime, handle };
}

/** Bind the app to a port. Returns a stop() for teardown. */
export function startServer(opts: AppOptions & { port: number }): RunningServer {
  const { runtime, handle } = createApp(opts);
  const server = serve({ port: opts.port, hostname: "0.0.0.0", fetch: handle });
  return {
    server,
    runtime,
    stop() {
      runtime.shutdown();
      void server.close(true);
    },
  };
}
