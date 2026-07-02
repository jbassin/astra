import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import { serveFile } from "@astra/site-kit";
import { type Server, serve } from "srvx";
import { RollHub } from "./hub";
import { parseRollEvent } from "./schema";

// Module-scope instruments (no-ops until initTelemetry runs in the entrypoint; safe in
// unit tests). The overlay's only write path is ingest — count it by outcome + trace it.
const log = getLogger("astra.weal-overlay");
const tracer = getTracer("astra.weal-overlay");
const rollsCounter = lazyCounter("astra.weal-overlay", "astra.weal.overlay.rolls_ingested", {
  description: "Roll events POSTed to the overlay ingest, by outcome",
});

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

export interface AppOptions {
  /** Shared secret required as the `x-eerie-token` header on ingest. null = open (dev). */
  token: string | null;
  /** Absolute path to the built overlay (vite `dist/`). */
  distDir: string;
  /** Public browser OTLP endpoint, injected into index.html for client RUM ("" = off). */
  rumEndpoint?: string;
  /** Inject a hub (tests); otherwise a fresh one is created. */
  hub?: RollHub;
}

export interface RunningServer {
  server: Server;
  hub: RollHub;
  stop(): void;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Build the request handler + its hub without binding a port (unit-testable). */
export function createApp(opts: AppOptions): {
  hub: RollHub;
  handle: (req: Request) => Promise<Response>;
} {
  const hub = opts.hub ?? new RollHub();
  const { token, distDir, rumEndpoint = "" } = opts;

  async function ingest(req: Request): Promise<Response> {
    return tracer.startActiveSpan("overlay.ingest", async (span) => {
      try {
        if (token !== null && req.headers.get("x-eerie-token") !== token) {
          rollsCounter.add(1, { outcome: "unauthorized" });
          return new Response("unauthorized\n", { status: 401 });
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          rollsCounter.add(1, { outcome: "invalid_json" });
          return new Response("invalid json\n", { status: 400 });
        }
        const event = parseRollEvent(body);
        if (!event) {
          rollsCounter.add(1, { outcome: "invalid_payload" });
          return new Response("invalid roll payload\n", { status: 400 });
        }
        hub.publish(event);
        rollsCounter.add(1, { outcome: "ok" });
        log.emit({ severityText: "INFO", body: "roll ingested → broadcast to feed" });
        return new Response(null, { status: 204 });
      } finally {
        span.end();
      }
    });
  }

  function feed(): Response {
    let off: (() => void) | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const client = (frame: string) => {
          try {
            controller.enqueue(encoder.encode(frame));
          } catch {
            off?.();
          }
        };
        off = hub.add(client);
        client(": connected\n\n");
      },
      cancel() {
        off?.();
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  /** Serve index.html with the RUM endpoint injected (the SPA's config seam). */
  async function serveIndex(): Promise<Response> {
    let html: string;
    try {
      html = await readFile(resolve(distDir, "index.html"), "utf8");
    } catch {
      return new Response("not found\n", { status: 404 });
    }
    if (rumEndpoint !== "") {
      const inject = `<script>window.__RUM_ENDPOINT__=${JSON.stringify(rumEndpoint)}</script>`;
      html = html.replace("</head>", `${inject}</head>`);
    }
    return new Response(html, {
      headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-cache" },
    });
  }

  // Bun.file(...) → @astra/site-kit's `serveFile` (the `send`-backed Range/206
  // bridge S4 built; R3, 0022 S8). index.html is served separately above (it needs
  // the RUM-endpoint injection), so this only ever hits built hashed assets.
  async function serveStatic(req: Request): Promise<Response> {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    if (pathname === "/" || pathname.endsWith("/")) return serveIndex();

    const target = resolve(distDir, `.${pathname}`);
    // Path-traversal guard: resolved path must stay within distDir.
    if (target !== distDir && !target.startsWith(`${distDir}/`)) {
      return new Response("forbidden\n", { status: 403 });
    }
    if (!(await isFile(target))) return serveIndex(); // SPA fallback
    return serveFile(req, target);
  }

  async function handle(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === "POST" && pathname === "/api/v1/roll") return ingest(req);
    if (req.method === "GET" && pathname === "/feed") return feed();
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req);
    return new Response("method not allowed\n", { status: 405 });
  }

  return { hub, handle };
}

/** Bind the app to a port and start the heartbeat. Returns a stop() for teardown. */
export function startServer(opts: AppOptions & { port: number }): RunningServer {
  const { hub, handle } = createApp(opts);
  // Bun.serve → srvx (R3, 0022 S8 — B3): `server.port` doesn't exist on srvx's
  // Server, callers read `server.url` instead; `.stop(true)` → `.close(true)`.
  const server = serve({ port: opts.port, hostname: "0.0.0.0", fetch: handle });
  const heartbeat = setInterval(() => hub.heartbeat(), 15_000);
  // Don't keep the event loop alive on the heartbeat alone (matters in tests).
  (heartbeat as { unref?: () => void }).unref?.();
  return {
    server,
    hub,
    stop() {
      clearInterval(heartbeat);
      void server.close(true);
    },
  };
}
