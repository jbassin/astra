/**
 * The vellum-render request handler, built without binding a port so tests can drive it
 * with a fake renderer. `server.ts` warms Chromium and serves it.
 */
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { getTracer, lazyCounter, lazyHistogram, logger } from "@astra/observe";
import { serveFile } from "@astra/site-kit";
import { SpanStatusCode } from "@opentelemetry/api";

import { type RenderRequest, validateRenderRequest } from "./caps";
import { RenderCapError } from "./renderService";

/** What the handler needs from the warm-browser `RenderService`. */
export interface Renderer {
  readonly queued: number;
  isReady(): boolean;
  render(req: RenderRequest): Promise<Buffer>;
}

export interface RenderAppOptions {
  /** config.kdl `vellum-render.service-name`. */
  serviceName: string;
  /** config.kdl `vellum-frontend.public-origin`: the deployed editor's origin. */
  publicOrigin: string;
  /** The built render assets (`dist/`). */
  distDir: string;
  renderer: Renderer;
}

// SEC-5: coarse per-IP fixed-window rate limit in front of the browser pool.
const RATE = { windowMs: 60_000, max: 60 };

// The editor reaches /render same-origin via Caddy in prod; this allow-list only
// matters for direct cross-origin calls (e.g. the dev Vite server's origin). The
// configured public origin is the single source for the deployed host.
const ALLOWED_ORIGINS = [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

export function createRenderApp(opts: RenderAppOptions): {
  fetch(req: Request): Promise<Response>;
} {
  const { serviceName, publicOrigin, renderer: service, distDir: DIST } = opts;
  const tracer = getTracer(serviceName);
  const log = logger(serviceName);
  // One render = one PNG; outcome distinguishes ok / cap-rejected / rate-limited / error,
  // and the histogram makes render latency alertable without parsing spans.
  const renderCounter = lazyCounter(serviceName, "astra.vellum.render.requests", {
    description: "PNG render requests by outcome",
  });
  const renderDuration = lazyHistogram(serviceName, "astra.vellum.render.duration_ms", {
    description: "PNG render wall-clock",
    unit: "ms",
  });

  const hits = new Map<string, { count: number; start: number }>();
  function rateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now - entry.start > RATE.windowMs) {
      hits.set(ip, { count: 1, start: now });
      return false;
    }
    entry.count += 1;
    return entry.count > RATE.max;
  }

  function corsHeaders(origin: string | null): Record<string, string> {
    const allow =
      origin && (origin === publicOrigin || ALLOWED_ORIGINS.some((re) => re.test(origin)));
    return allow
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "POST, GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          vary: "origin",
        }
      : {};
  }

  // The old Bun static-file call is now @astra/site-kit's `serveFile` (the
  // `send`-backed Range/206 bridge S4 built; R3, 0022 S9) — reuse the same tested
  // static-serving seam the SSR frontends and weal-overlay already use, instead of
  // a fresh node:fs path.
  async function serveStatic(req: Request, pathname: string): Promise<Response> {
    const rel = pathname === "/" ? "/index.html" : pathname;
    // Resolve inside DIST only — no path traversal.
    const full = resolve(DIST, `.${rel}`);
    if (!full.startsWith(DIST)) return new Response("forbidden", { status: 403 });
    if (!(await isFile(full))) return new Response("not found", { status: 404 });
    return serveFile(req, full);
  }

  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, ready: service.isReady(), queued: service.queued },
        { headers: cors },
      );
    }

    if (url.pathname === "/render" && req.method === "POST") {
      // srvx's request carries the peer address; a plain Request (tests) has none.
      const ip = (req as { ip?: string }).ip ?? "unknown";
      if (rateLimited(ip)) {
        renderCounter.add(1, { outcome: "rate_limited" });
        return new Response("rate limited", { status: 429, headers: cors });
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return new Response("invalid JSON", { status: 400, headers: cors });
      }
      const validation = validateRenderRequest(body);
      if (!validation.ok) {
        return new Response(validation.error, { status: validation.status, headers: cors });
      }
      // One span per render — the useful unit of work for this service.
      return tracer.startActiveSpan(
        "render",
        {
          attributes: {
            "vellum.mode": validation.value.mode,
            "vellum.scale": validation.value.scale,
            "vellum.source_bytes": new TextEncoder().encode(validation.value.source).length,
            "vellum.queued": service.queued,
          },
        },
        async (span) => {
          const startedAt = Date.now();
          const mode = validation.value.mode;
          try {
            const png = await service.render(validation.value);
            span.setAttribute("vellum.png_bytes", png.length);
            renderCounter.add(1, { outcome: "ok", mode });
            renderDuration.record(Date.now() - startedAt, { outcome: "ok", mode });
            return new Response(new Uint8Array(png), {
              headers: { ...cors, "content-type": "image/png" },
            });
          } catch (err) {
            const outcome = err instanceof RenderCapError ? "capped" : "error";
            renderCounter.add(1, { outcome, mode });
            renderDuration.record(Date.now() - startedAt, { outcome, mode });
            if (err instanceof RenderCapError) {
              span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
              return new Response(err.message, { status: err.status, headers: cors });
            }
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            log.error(`render failed: ${err instanceof Error ? err.message : String(err)}`, {
              "vellum.mode": mode,
            });
            return new Response("render failed", { status: 500, headers: cors });
          } finally {
            span.end();
          }
        },
      );
    }

    // Same-origin render assets (render.html, /assets/*, /fonts/*).
    return serveStatic(req, url.pathname);
  }

  return { fetch };
}
