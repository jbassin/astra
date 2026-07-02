/**
 * The orator HTTP app (lark §7). `createApp()` returns a pure `handle(req)` that
 * can be unit-tested without binding a port, opening a Discord connection, or
 * hitting the network. `startServer()` binds it on srvx (R3, 0022 S8 — off
 * `Bun.serve`).
 *
 * Layering: auth routes (login/callback/logout) + an open health check are
 * special-cased; everything under `/api/` is dispatched through the router, which
 * resolves the actor from a **web session** (Discord OAuth → signed cookie) OR a
 * Bearer **API key** (same `uid` either way). The operator allowlist is derived
 * from the ontology (M1) and threaded in as `config.allowlist`.
 *
 * astra port: the sync `bun:sqlite` `db` → the async `LibraryStore`; cookie
 * `lark_session`→`orator_session`; logs `[lark]`→`[orator]`. The HMAC OAuth
 * `state` (stateless CSRF) and the "Add to Server" callback branch are preserved
 * verbatim; `idleTimeout:60` has no srvx equivalent — see `startServer()`'s note.
 */
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import type * as NodeHttp from "node:http";
import { resolve } from "node:path";

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import { serveFile } from "@astra/site-kit";
import { SpanStatusCode } from "@opentelemetry/api";
import { type Server, serve } from "srvx";

import type { LibraryStore } from "../db/store";
import { extractApiKey, hashKey } from "./apikeys";
import { buildAuthorizeUrl, exchangeCodeForUser, type OAuthConfig } from "./oauth";
import {
  type ApiRoute,
  type ApiServices,
  HttpError,
  json,
  matchRoute,
  type Session,
} from "./router";
import { ingestRoutes } from "./routes/ingest";
import { keyRoutes } from "./routes/keys";
import { libraryRoutes } from "./routes/library";
import { playbackRoutes } from "./routes/playback";
import { clearCookie, parseCookies, sessionCookie, signSession, verifySession } from "./sessions";

// API observability: one span per authenticated API call + a request counter by outcome.
const tracer = getTracer("astra.orator-backend");
const log = getLogger("astra.orator-backend");
const apiCounter = lazyCounter("astra.orator-backend", "astra.orator.api.requests", {
  description: "Authenticated API requests, by outcome",
});

const SESSION_COOKIE = "orator_session";

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** API routes that require a valid session or API key. Extended per slice. */
const API_ROUTES: ApiRoute[] = [...libraryRoutes, ...playbackRoutes, ...ingestRoutes, ...keyRoutes];

/** The full runtime config the app needs (built in the entrypoint from cfg.orator). */
export interface AppConfig {
  port: number;
  sessionSecret: string;
  allowlist: Set<string>;
  oauth: OAuthConfig;
  publicOrigin: string;
  /** `Secure` cookies whenever the public origin is https (i.e. in prod). */
  secureCookies: boolean;
  distDir: string;
  dataDir: string;
  guildId: string;
  targetLufs: number;
  /** Public browser-RUM OTLP endpoint (config.kdl `telemetry.rumEndpoint`), handed
   * to the static SPA via `/api/v1/rum-config` (the client can't read config). */
  rumEndpoint: string;
}

export interface AppDeps {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  makeState?: () => string;
  /** Runtime service handles (playback engine, ingest…). */
  services?: ApiServices;
}

export interface App {
  readonly store: LibraryStore;
  readonly config: AppConfig;
  handle(req: Request): Promise<Response>;
}

export function createApp(config: AppConfig, store: LibraryStore, deps: AppDeps = {}): App {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const makeState = deps.makeState ?? (() => randomBytes(16).toString("hex"));
  const services = deps.services ?? {};

  function getSession(req: Request): Session | null {
    const cookies = parseCookies(req.headers.get("cookie"));
    const session = verifySession(cookies[SESSION_COOKIE], config.sessionSecret, now());
    if (!session) return null;
    if (config.allowlist.size > 0 && !config.allowlist.has(session.uid)) return null;
    return session;
  }

  /** Resolve the actor from a web session OR a Stream Deck API key (B26/D4). */
  async function authenticate(
    req: Request,
  ): Promise<{ session: Session; method: "session" | "apikey" } | null> {
    const session = getSession(req);
    if (session) return { session, method: "session" };

    const raw = extractApiKey(req.headers);
    if (raw) {
      const key = await store.getApiKeyByHash(hashKey(raw));
      if (
        key &&
        !key.revoked_at &&
        (config.allowlist.size === 0 || config.allowlist.has(key.user_id))
      ) {
        await store.touchApiKey(key.id);
        return {
          session: { uid: key.user_id, exp: Math.floor(now() / 1000) + 60 },
          method: "apikey",
        };
      }
    }
    return null;
  }

  function login(): Response {
    // Stateless CSRF: the `state` is an HMAC-signed, self-expiring token (10 min)
    // rather than a value we must round-trip in a cookie. This avoids the whole
    // class of SameSite/Secure/lost-cookie failures (invalid_oauth_state).
    const state = signSession(makeState(), config.sessionSecret, 600, now());
    return new Response(null, {
      status: 302,
      headers: { location: buildAuthorizeUrl(config.oauth, state) },
    });
  }

  async function callback(url: URL): Promise<Response> {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    // The "Add to Server" (bot install) flow redirects here with guild_id/
    // permissions and no login `state` — a different OAuth flow. Guide the user
    // instead of returning a confusing invalid_oauth_state.
    if (url.searchParams.has("guild_id") || url.searchParams.has("permissions")) {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>orator</title>` +
          `<body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem;background:#0e0f13;color:#e7e9ee">` +
          `<h1>orator</h1><p>✅ orator is added to your server. To control playback, ` +
          `<a style="color:#c8a24a" href="/">open the app</a> and click <b>Sign in with Discord</b>.</p></body>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (!code || !verifySession(state ?? undefined, config.sessionSecret, now())) {
      return json({ error: "invalid_oauth_state" }, 400);
    }
    let user: Awaited<ReturnType<typeof exchangeCodeForUser>>;
    try {
      user = await exchangeCodeForUser(config.oauth, code, fetchImpl);
    } catch {
      return json({ error: "oauth_exchange_failed" }, 502);
    }
    if (config.allowlist.size > 0 && !config.allowlist.has(user.id))
      return json({ error: "not_allowlisted" }, 403);
    const token = signSession(user.id, config.sessionSecret, undefined, now());
    return new Response(null, {
      status: 302,
      headers: {
        location: "/",
        "set-cookie": sessionCookie(SESSION_COOKIE, token, { secure: config.secureCookies }),
      },
    });
  }

  function logout(): Response {
    return new Response(null, {
      status: 302,
      headers: { location: "/", "set-cookie": clearCookie(SESSION_COOKIE) },
    });
  }

  async function dispatchApi(req: Request, url: URL): Promise<Response> {
    return tracer.startActiveSpan(
      "orator.api",
      { attributes: { "http.method": req.method, "url.path": url.pathname } },
      async (span) => {
        try {
          const auth = await authenticate(req);
          if (!auth) {
            apiCounter.add(1, { outcome: "unauthenticated" });
            return json({ error: "unauthenticated" }, 401);
          }
          const matched = matchRoute(API_ROUTES, req.method, url.pathname);
          if (!matched) {
            apiCounter.add(1, { outcome: "not_found" });
            return json({ error: "not_found" }, 404);
          }
          try {
            const res = await matched.route.handler({
              req,
              url,
              params: matched.params,
              session: auth.session,
              authMethod: auth.method,
              store,
              config: { guildId: config.guildId, dataDir: config.dataDir },
              services,
            });
            span.setAttribute("http.status_code", res.status);
            apiCounter.add(1, { outcome: "ok" });
            return res;
          } catch (err) {
            if (err instanceof HttpError) {
              apiCounter.add(1, { outcome: "client_error" });
              return json({ error: err.message }, err.status);
            }
            // PlaybackError and similar carry a numeric `status`.
            const status = (err as { status?: unknown }).status;
            if (typeof status === "number") {
              apiCounter.add(1, { outcome: "client_error" });
              return json({ error: (err as Error).message ?? "error" }, status);
            }
            apiCounter.add(1, { outcome: "error" });
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            log.emit({
              severityText: "ERROR",
              body: `api error on ${req.method} ${url.pathname}: ${err instanceof Error ? err.message : String(err)}`,
            });
            return json({ error: "internal" }, 500);
          }
        } finally {
          span.end();
        }
      },
    );
  }

  // Bun.file(...) → @astra/site-kit's `serveFile` (the `send`-backed Range/206
  // bridge S4 built; R3, 0022 S8) — same fallback-to-index.html shape as before.
  async function serveStatic(req: Request): Promise<Response> {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    const target = resolve(config.distDir, `.${pathname}`);
    if (target !== config.distDir && !target.startsWith(`${config.distDir}/`)) {
      return new Response("forbidden\n", { status: 403 });
    }
    const candidate =
      pathname === "/" || pathname.endsWith("/") ? resolve(target, "index.html") : target;
    if (await isFile(candidate)) return serveFile(req, candidate);
    const indexPath = resolve(config.distDir, "index.html");
    if (await isFile(indexPath)) return serveFile(req, indexPath);
    return new Response("not found\n", { status: 404 });
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/auth/login") return login();
    if (req.method === "GET" && pathname === "/auth/callback") return callback(url);
    if (req.method === "POST" && pathname === "/auth/logout") return logout();

    if (pathname === "/api/v1/health") return json({ ok: true });
    // Public, unauthenticated: the static operator SPA fetches this at startup to
    // configure browser RUM (it can't read config.kdl itself — see web/observe).
    if (pathname === "/api/v1/rum-config") return json({ endpoint: config.rumEndpoint });
    if (pathname.startsWith("/api/")) return dispatchApi(req, url);

    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req);
    return json({ error: "method_not_allowed" }, 405);
  }

  return { store, config, handle };
}

export interface RunningServer {
  server: Server;
  app: App;
  stop(): void;
}

export function startServer(
  config: AppConfig,
  store: LibraryStore,
  deps: AppDeps = {},
): RunningServer {
  const app = createApp(config, store, deps);
  // Bun.serve → srvx (R3, 0022 S8 — B3). Voice join can take a few seconds; Bun's
  // `idleTimeout: 60` (seconds) would cut a /playback/play request off mid-join at
  // the default 10s — srvx has NO idleTimeout option, so this is not dropped
  // silently: once the server is listening, reach the underlying Node
  // `http.Server` via the `.node.server` escape hatch and set the closest Node
  // analogs — `keepAliveTimeout` (idle time on an already-served keep-alive
  // connection) and `headersTimeout` (which Node requires to exceed it).
  const server = serve({ port: config.port, hostname: "0.0.0.0", fetch: app.handle });
  void server.ready().then((s) => {
    const nodeServer = s.node?.server as NodeHttp.Server | undefined;
    if (nodeServer) {
      nodeServer.keepAliveTimeout = 60_000; // the idleTimeout: 60 mapping
      nodeServer.headersTimeout = 61_000; // must exceed keepAliveTimeout (Node requirement)
    }
  });
  return {
    server,
    app,
    stop: () => {
      void server.close(true);
    },
  };
}
