// Production SSR entry for an astra TanStack Start frontend (Decision I) — the
// reusable spine lifted from strider's `server.ts`. An app's `server.ts` is now a
// thin caller: read `serviceName`/`port` from config.kdl (config-single-source),
// import its own built SSR handler + client dir (content-pipeline-specific), and
// hand them here.
//
// `vite build` emits a bare Web-fetch handler at dist/server/server.js plus the
// hashed client bundle under dist/client/. This wraps both: static client assets
// are served straight from disk; everything else falls through to the TanStack
// Start SSR handler (one span per rendered request). Caddy reverse-proxies the
// whole service (it does not static-serve the site — Decision I).

import { stat } from "node:fs/promises";
import { getTracer, initTelemetry } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
import { type Server, serve } from "srvx";
import { serveFile } from "./sendFile";

/** The shape of the built `dist/server/server.js` default export (asserted by the SSR smoke). */
export interface SsrHandler {
  fetch: (req: Request) => Promise<Response> | Response;
}

/** An extra static dir served under a URL prefix (e.g. a mounted media volume). */
export interface StaticMount {
  /** URL prefix to match, with trailing slash (e.g. "/audio/"). */
  urlPrefix: string;
  /** Absolute dir the files live in (e.g. the mounted audio volume). */
  dir: string;
}

export interface SsrServerOptions {
  /** OTel service name (config.kdl) — names the SSR spans + resource. */
  serviceName: string;
  /** Bind port (config.kdl). */
  port: number;
  /** The app's built SSR handler (`import ssr from "./dist/server/server.js"`). */
  ssr: SsrHandler;
  /** Absolute path to the built client assets dir (`<app>/dist/client`). */
  clientDir: string;
  /**
   * Extra static dirs served under a URL prefix, ahead of SSR — e.g. mouthpiece's
   * audio volume at "/audio/" (Decision I keeps large media out of the image: it's
   * a runtime volume, served same-origin here). A path matching a prefix is served
   * from the dir or 404s; it never falls through to SSR.
   */
  staticMounts?: StaticMount[];
}

/**
 * Resolve a request path to a file under a static mount, or null if it doesn't
 * match the prefix / is unsafe. Pure — path-traversal-guarded (no `..`, NUL, or
 * absolute escape) so a crafted URL can't read outside `mount.dir`.
 */
export function staticMountPath(mount: StaticMount, pathname: string): string | null {
  if (!pathname.startsWith(mount.urlPrefix)) return null;
  const rel = pathname.slice(mount.urlPrefix.length);
  if (rel === "" || rel.includes("..") || rel.includes("\0") || rel.startsWith("/")) return null;
  return `${mount.dir}/${rel}`;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Start the SSR server (srvx — runs on Node; R3, Decision-per-spec 0022): wire
 * server-side OTel into the runtime (principle #1; the OTLP endpoint comes from
 * config.kdl via @astra/config — no env reads), static-serve built client assets
 * (Range/206-capable via `send`, `./sendFile.ts` — THE property the audio mounts
 * depend on, S6), SSR everything else under one span per request, and force-flush
 * buffered spans on SIGTERM/SIGINT. Returns the srvx server handle.
 */
export function createSsrServer(opts: SsrServerOptions): Server {
  const { serviceName, port, ssr, clientDir, staticMounts = [] } = opts;

  // Guarded so a telemetry misconfig never takes the site down.
  let telemetry: { shutdown: () => Promise<void> } | null = null;
  try {
    telemetry = initTelemetry(serviceName);
  } catch (err) {
    console.warn(
      `[${serviceName}] telemetry init skipped: ${err instanceof Error ? err.message : err}`,
    );
  }
  const tracer = getTracer(serviceName);

  const server = serve({
    port,
    hostname: "0.0.0.0",
    // We own SIGTERM/SIGINT ourselves below (telemetry flush before exit); srvx's
    // built-in graceful-shutdown plugin would install a second pair of handlers
    // that race ours (its own stderr progress log + polling close loop) for no
    // benefit here, so it's off. No srvx `idleTimeout` equivalent exists (B3);
    // the closest analog for the Node runtime is `node.keepAliveTimeout` (srvx
    // spreads `node` straight into `http.createServer()` — ignored on non-Node
    // adapters), which isn't semantically identical to Bun's idle-connection
    // timeout but is the nearest available knob.
    gracefulShutdown: false,
    node: { keepAliveTimeout: 30_000 },
    async fetch(req) {
      const url = new URL(req.url);
      // Static mounts (e.g. the audio volume at /audio/) win ahead of SSR: a path
      // under a mount prefix is served from disk or 404s — never SSR'd. `send`
      // honours Range requests (206 + Content-Range), so audio seeking works.
      for (const mount of staticMounts) {
        if (!url.pathname.startsWith(mount.urlPrefix)) continue;
        const filePath = staticMountPath(mount, url.pathname);
        if (filePath && (await isFile(filePath))) return serveFile(req, filePath);
        return new Response("Not found", { status: 404 });
      }
      // Serve built client assets (hashed bundles, fonts, favicon) directly. The
      // root path always goes to SSR so "/" renders the document, not a file.
      if (url.pathname !== "/") {
        const filePath = `${clientDir}${url.pathname}`;
        if (filePath.startsWith(clientDir) && (await isFile(filePath))) {
          return serveFile(req, filePath);
        }
      }
      // One SSR span per rendered request (assets above short-circuit).
      return tracer.startActiveSpan(
        `SSR ${req.method} ${url.pathname}`,
        { attributes: { "http.method": req.method, "http.route": url.pathname } },
        async (span) => {
          try {
            const res = await ssr.fetch(req);
            span.setAttribute("http.status_code", res.status);
            if (res.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
            return res;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            throw err;
          } finally {
            span.end();
          }
        },
      );
    },
  });

  // srvx prints its own untagged "Listening on" line from `serve()`; ours adds
  // the serviceName tag once the (possibly async, on Node) listen completes.
  void server.ready().then((s) => {
    console.log(`[${serviceName}] SSR listening on ${s.url}`);
  });

  // Force-flush buffered spans before the container stops (BatchSpanProcessor).
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      void telemetry?.shutdown().finally(() => process.exit(0));
    });
  }

  return server;
}
