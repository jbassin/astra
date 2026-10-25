import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { isBlankSecret } from "@astra/config";
import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import {
  createHandler,
  createService,
  route,
  safeEqual,
  type Service,
  type ServiceDefinition,
} from "@astra/service-kit";
import { serveFile } from "@astra/site-kit";
import { INGEST_PATH, requestToken } from "@astra/weal-wire";
import type { Server } from "srvx";

import { RollHub } from "./hub";
import { parseRollEvent } from "./schema";

// config.kdl `weal-overlay.service-name`.
const SERVICE_NAME = "astra.weal-overlay";

// Module-scope instruments (live under @astra/observe/register, no-ops in
// unit tests). The overlay's only write path is ingest — count it by outcome + trace it.
const log = getLogger(SERVICE_NAME);
const tracer = getTracer(SERVICE_NAME);
const rollsCounter = lazyCounter(SERVICE_NAME, "astra.weal.overlay.rolls_ingested", {
  description: "Roll events POSTed to the overlay ingest, by outcome",
});

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

interface AppOptions {
  /** Shared secret required in the `@astra/weal-wire` token header on ingest. Must be non-blank:
   * there is no open mode (fail closed) — createApp throws on a blank token. */
  token: string;
  /** Absolute path to the built overlay (vite `dist/`). */
  distDir: string;
  /** Public browser OTLP endpoint, injected into index.html for client RUM ("" = off). */
  rumEndpoint?: string;
  /** Inject a hub (tests); otherwise a fresh one is created. */
  hub?: RollHub;
}

export interface RunningServer {
  server: Server;
  service: Service;
  hub: RollHub;
  /** The kit's ordered shutdown: stop accepting, drain, close the feeds, stop the heartbeat. */
  stop(): Promise<void>;
}

/** Constant-time token comparison: neither the matching prefix nor the length leaks. */
function tokenMatches(given: string | null, want: string): boolean {
  return given !== null && safeEqual(given, want);
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Build the service definition + its hub without binding a port. */
function createDefinition(opts: AppOptions): {
  hub: RollHub;
  definition: ServiceDefinition;
} {
  const hub = opts.hub ?? new RollHub();
  const { token, distDir, rumEndpoint = "" } = opts;
  if (isBlankSecret(token)) {
    throw new Error("weal-overlay createApp: ingest token is blank — refusing an open ingest");
  }

  // oxlint-disable-next-line require-await -- an async request handler: a throw becomes a rejected response promise
  async function ingest(req: Request): Promise<Response> {
    return tracer.startActiveSpan("overlay.ingest", async (span) => {
      try {
        if (!tokenMatches(requestToken(req.headers), token)) {
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

  // Static files go through @astra/site-kit's `serveFile` (`send`-backed, with
  // Range/206 support). index.html is served separately above (it needs
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

  const definition: ServiceDefinition = {
    serviceName: SERVICE_NAME,
    routes: [
      route({ method: "POST", path: INGEST_PATH, handler: (ctx) => ingest(ctx.req) }),
      route({ method: "GET", path: "/feed", handler: () => feed() }),
    ],
    fallback: (req) =>
      req.method === "GET" || req.method === "HEAD"
        ? serveStatic(req)
        : new Response("method not allowed\n", { status: 405 }),
  };

  return { hub, definition };
}

/** Build the request handler + its hub without binding a port (unit tests). */
export function createApp(opts: AppOptions): {
  hub: RollHub;
  handle: (req: Request) => Promise<Response>;
} {
  const { hub, definition } = createDefinition(opts);
  return { hub, handle: createHandler(definition).handle };
}

/** Bind the app to a port and start the heartbeat. Returns a stop() for teardown. */
export function startServer(
  opts: AppOptions & { port: number; handleShutdown?: boolean },
): RunningServer {
  const { hub, definition } = createDefinition(opts);
  const service = createService({
    ...definition,
    port: opts.port,
    handleShutdown: opts.handleShutdown ?? false,
  });
  const heartbeat = setInterval(() => hub.heartbeat(), 15_000);
  // Don't keep the event loop alive on the heartbeat alone (matters in tests).
  (heartbeat as { unref?: () => void }).unref?.();
  service.onShutdown(() => clearInterval(heartbeat));
  return {
    server: service.server,
    service,
    hub,
    stop: () => service.close(),
  };
}
