#!/usr/bin/env bun
/**
 * Vellum render service (0013, D2) — a warm Bun + Playwright sidecar that turns a
 * posted document into a PNG of its [data-vellum-export] card. Serves the built
 * render assets from dist/ on the same origin so the render page + fonts load
 * locally (and the SEC-3 egress block can allow only same-origin). A SEPARATE
 * Compose unit from vellum-frontend; the editor reaches it same-origin via Caddy
 * (vellum.iridi.cc/render → this service). Lifted ~verbatim from faerrin
 * pkg/vellum scripts/render-server.ts, with config-single-source + telemetry added.
 *
 *   bun run start        # after `bun run build`
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@astra/config";
import { getLogger, getTracer, initTelemetry, lazyCounter, lazyHistogram } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
import { validateRenderRequest } from "./caps";
import { RenderCapError, RenderService } from "./renderService";

const cfg = loadConfig();
const { serviceName, port: PORT } = cfg.vellumRender;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DIST = fileURLToPath(new URL("../dist", import.meta.url));

// Telemetry from day one (principle #1) — OTLP endpoint from config.kdl. Guarded
// so a telemetry misconfig never takes the service down.
let telemetry: { shutdown: () => Promise<void> } | null = null;
try {
  telemetry = initTelemetry(serviceName);
} catch (err) {
  console.warn(
    `[${serviceName}] telemetry init skipped: ${err instanceof Error ? err.message : err}`,
  );
}
const tracer = getTracer(serviceName);
const log = getLogger(serviceName);
// One render = one PNG; outcome distinguishes ok / cap-rejected / rate-limited / error,
// and the histogram makes render latency alertable without parsing spans. Lazy-bound so the
// instruments connect to the real meter even if grabbed before initTelemetry.
const renderCounter = lazyCounter(serviceName, "astra.vellum.render.requests", {
  description: "PNG render requests by outcome",
});
const renderDuration = lazyHistogram(serviceName, "astra.vellum.render.duration_ms", {
  description: "PNG render wall-clock",
  unit: "ms",
});

// SEC-5: coarse per-IP fixed-window rate limit in front of the browser pool.
const RATE = { windowMs: 60_000, max: 60 };
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

// The editor reaches /render same-origin via Caddy in prod; this allow-list only
// matters for direct cross-origin calls (e.g. the dev Vite server's origin). The
// configured public origin is the single source for the deployed host.
const PUBLIC_ORIGIN = cfg.vellumFrontend.publicOrigin;
const ALLOWED_ORIGINS = [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (origin === PUBLIC_ORIGIN || ALLOWED_ORIGINS.some((re) => re.test(origin)));
  return allow
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        vary: "origin",
      }
    : {};
}

async function serveStatic(pathname: string): Promise<Response> {
  const rel = pathname === "/" ? "/index.html" : pathname;
  // Resolve inside DIST only — no path traversal.
  const full = resolve(DIST, `.${rel}`);
  if (!full.startsWith(DIST)) return new Response("forbidden", { status: 403 });
  const file = Bun.file(full);
  if (await file.exists()) return new Response(file);
  return new Response("not found", { status: 404 });
}

const service = new RenderService(BASE_URL);
console.log(`[${serviceName}] warming Chromium…`);
await service.start();

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 30,
  async fetch(req, srv) {
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
      const ip = srv.requestIP(req)?.address ?? "unknown";
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
            log.emit({
              severityText: "ERROR",
              body: `render failed: ${err instanceof Error ? err.message : String(err)}`,
              attributes: { "vellum.mode": mode },
            });
            return new Response("render failed", { status: 500, headers: cors });
          } finally {
            span.end();
          }
        },
      );
    }

    // Same-origin render assets (render.html, /assets/*, /fonts/*).
    return serveStatic(url.pathname);
  },
});

console.log(`[${serviceName}] render service on ${BASE_URL} (ready=${service.isReady()})`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void service
      .close()
      .then(() => telemetry?.shutdown())
      .finally(() => {
        server.stop(true);
        process.exit(0);
      });
  });
}
