// Production SSR entry for an astra TanStack Start frontend (Decision I) — the
// reusable spine lifted from strider's `server.ts`. An app's `server.ts` is now a
// thin caller: read `serviceName`/`port` from config.kdl (config-single-source),
// import its own built SSR handler + client dir (content-pipeline-specific), and
// hand them here.
//
// `vite build` emits a bare Web-fetch handler at dist/server/server.js plus the
// hashed client bundle under dist/client/. This wraps both: static client assets
// are served straight from disk; everything else falls through to the TanStack
// Start SSR handler. Caddy reverse-proxies the whole service (it does not
// static-serve the site — Decision I).
//
// Telemetry is not wired here: the process runs under `node --import
// @astra/observe/register`, which installs the providers, an HTTP server span per
// request and the SIGTERM flush. This adds one `ssr.render` child span per SSR'd
// request and closes the server on shutdown.

import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getTracer, logger, onShutdown } from "@astra/observe";
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

/** A request handler for a URL prefix whose answer depends on more than a fixed dir
 * (e.g. codex's Pagefind index, served per corpus release). */
export interface SsrRoute {
  /** URL prefix to match, with trailing slash (e.g. "/pagefind/"). */
  urlPrefix: string;
  /** Answers every request under the prefix; it never falls through to SSR. */
  handle: (req: Request, url: URL) => Promise<Response> | Response;
}

export interface SsrServerOptions {
  /** The service name (config.kdl): names the `ssr.render` tracer and the log lines. */
  serviceName: string;
  /** Bind port (config.kdl); 0 asks the OS for a free one (read it back from `url`). */
  port: number;
  /** Bind address; default `0.0.0.0`. Test harnesses pass `127.0.0.1`. */
  hostname?: string;
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
  /** Prefix-matched handlers, checked ahead of `staticMounts`, outside the SSR span. */
  routes?: SsrRoute[];
}

/**
 * The app's built SSR handler, `<appRoot>/dist/server/server.js`, loaded by path at startup.
 * server.ts must not `import` it: the server bundle (`dist-server/`, ./serverBundle.ts)
 * would inline vite's whole SSR build a second time. `appRoot` is the app's package dir
 * (`findPackageRoot(import.meta.dirname)` from `@astra/config`).
 */
export async function loadSsrBuild<T extends SsrHandler = SsrHandler>(appRoot: string): Promise<T> {
  const url = pathToFileURL(path.join(appRoot, "dist", "server", "server.js")).href;
  const built = (await import(/* @vite-ignore */ url)) as { default: T };
  return built.default;
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
 * Start the SSR server (srvx — runs on Node; R3, Decision-per-spec 0022):
 * static-serve built client assets (Range/206-capable via `send`, `./sendFile.ts` —
 * THE property the audio mounts depend on, S6), SSR everything else under an
 * `ssr.render` span, and close the server on shutdown. Returns the srvx server handle.
 */
export function createSsrServer(opts: SsrServerOptions): Server {
  const {
    serviceName,
    port,
    hostname = "0.0.0.0",
    ssr,
    clientDir,
    staticMounts = [],
    routes = [],
  } = opts;

  const tracer = getTracer(serviceName);
  const log = logger(serviceName);

  const server = serve({
    port,
    hostname,
    // @astra/observe/register owns SIGTERM/SIGINT (our onShutdown hook, then the
    // telemetry flush); srvx's built-in graceful-shutdown plugin would install a
    // second pair of handlers that race it, so it's off. No srvx `idleTimeout` equivalent exists (B3);
    // the closest analog for the Node runtime is `node.keepAliveTimeout` (srvx
    // spreads `node` straight into `http.createServer()` — ignored on non-Node
    // adapters), which isn't semantically identical to Bun's idle-connection
    // timeout but is the nearest available knob.
    gracefulShutdown: false,
    node: { keepAliveTimeout: 30_000 },
    async fetch(req) {
      const url = new URL(req.url);
      for (const route of routes) {
        if (url.pathname.startsWith(route.urlPrefix)) return route.handle(req, url);
      }
      // Static mounts (e.g. the audio volume at /audio/) win ahead of SSR: a path
      // under a mount prefix is served from disk or 404s — never SSR'd. `send`
      // honours Range requests (206 + Content-Range), so audio seeking works.
      for (const mount of staticMounts) {
        if (!url.pathname.startsWith(mount.urlPrefix)) continue;
        const filePath = staticMountPath(mount, url.pathname);
        if (filePath && (await isFile(filePath))) return serveFile(req, filePath, mount.dir);
        return new Response("Not found", { status: 404 });
      }
      // Serve built client assets (hashed bundles, fonts, favicon) directly. The
      // root path always goes to SSR so "/" renders the document, not a file.
      if (url.pathname !== "/") {
        const filePath = `${clientDir}${url.pathname}`;
        if (filePath.startsWith(clientDir) && (await isFile(filePath))) {
          return serveFile(req, filePath, clientDir);
        }
      }
      // One render span per SSR'd request (assets above short-circuit), a child of the
      // HTTP server span. A fixed name: the raw path is an attribute, never the name
      // (codex has ~44k entity pages).
      return tracer.startActiveSpan(
        "ssr.render",
        { attributes: { "url.path": url.pathname } },
        async (span) => {
          try {
            const res = await ssr.fetch(req);
            span.setAttribute("http.response.status_code", res.status);
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

  // srvx prints its own untagged "Listening on" line from `serve()`; ours is the
  // log record (mirrored to stdout) once the (possibly async, on Node) listen completes.
  void server.ready().then((s) => log.info(`SSR listening on ${s.url}`));
  onShutdown(() => server.close(true));

  return server;
}
