/**
 * The orator HTTP app, served by `@astra/service-kit`. `createApp()`
 * returns a pure `handle(req)` that can be unit-tested without binding a port,
 * opening a Discord connection, or hitting the network. `startServer()` binds it.
 *
 * Layering: the auth routes (login/callback/logout), the open health check and the
 * RUM config are public kit routes; everything else under `/api/` is one kit route
 * group whose `authenticate` resolves the actor from a **web session** (Discord OAuth
 * → signed cookie) OR a Bearer **API key** (same `uid` either way) and answers 401
 * before any route lookup. The operator allowlist is derived from the ontology
 * and threaded in as `config.allowlist`.
 *
 * astra port: the sync `bun:sqlite` `db` → the async `LibraryStore`; cookie
 * `lark_session`→`orator_session`; logs `[lark]`→`[orator]`. The HMAC OAuth
 * `state` (stateless CSRF) and the "Add to Server" callback branch are preserved
 * verbatim; `idleTimeout:60` has no srvx equivalent — see `startServer()`'s note.
 * Every response is pinned in `pins.test.ts`.
 */
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { isBlankSecret } from "@astra/config";
import { lazyCounter } from "@astra/observe";
import {
  createHandler,
  createService,
  type Route,
  type RouteGroup,
  route,
  type Service,
  type ServiceDefinition,
} from "@astra/service-kit";
import { serveFile } from "@astra/site-kit";
import type { Server } from "srvx";

import type { LibraryStore } from "../db/store";
import { extractApiKey, hashKey } from "./apikeys";
import { buildAuthorizeUrl, exchangeCodeForUser, type OAuthConfig } from "./oauth";
import { type ApiRoute, type ApiServices, json, type Session } from "./router";
import { ingestRoutes } from "./routes/ingest";
import { keyRoutes } from "./routes/keys";
import { libraryRoutes } from "./routes/library";
import { playbackRoutes } from "./routes/playback";
import { clearCookie, parseCookies, sessionCookie, signSession, verifySession } from "./sessions";

const SERVICE_NAME = "astra.orator-backend";

// API observability: the kit names each request's HTTP span after its route template
// (`GET /api/v1/tracks/:id`); this counts API requests by outcome.
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
export const API_ROUTES: ApiRoute[] = [
  ...libraryRoutes,
  ...playbackRoutes,
  ...ingestRoutes,
  ...keyRoutes,
];

/** The full runtime config the app needs (built in the entrypoint from cfg.orator). */
export interface AppConfig {
  port: number;
  /** HMAC key for session cookies + OAuth state. Must be non-blank (createApp throws). */
  sessionSecret: string;
  /** Permitted operator Discord ids. Fail closed: an EMPTY set admits no one. */
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

interface AppDeps {
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

/** The actor of an authenticated API request. */
interface Actor {
  session: Session;
  method: "session" | "apikey";
}

/** The service definition: everything `createApp` and `startServer` serve. */
function defineApp(config: AppConfig, store: LibraryStore, deps: AppDeps): ServiceDefinition {
  // Defence in depth behind the entrypoint's startup guards: HMAC with a
  // blank key would let anyone mint a valid session cookie.
  if (isBlankSecret(config.sessionSecret)) {
    throw new Error("orator createApp: sessionSecret is blank — refusing to sign sessions");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const makeState = deps.makeState ?? (() => randomBytes(16).toString("hex"));
  const services = deps.services ?? {};

  function getSession(req: Request): Session | null {
    const cookies = parseCookies(req.headers.get("cookie"));
    const session = verifySession(cookies[SESSION_COOKIE], config.sessionSecret, now());
    if (!session) return null;
    if (!config.allowlist.has(session.uid)) return null;
    return session;
  }

  /** Resolve the actor from a web session OR a Stream Deck API key. */
  async function authenticate(req: Request): Promise<Actor | null> {
    const session = getSession(req);
    if (session) return { session, method: "session" };

    const raw = extractApiKey(req.headers);
    if (raw) {
      const key = await store.getApiKeyByHash(hashKey(raw));
      if (key && !key.revoked_at && config.allowlist.has(key.user_id)) {
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
    if (!config.allowlist.has(user.id)) return json({ error: "not_allowlisted" }, 403);
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

  /** An orator API route as a kit route: the handler gets the actor, store and services. */
  function apiRouteOf(api: ApiRoute): Route<Actor> {
    return route<unknown, Actor>({
      method: api.method,
      path: api.path,
      body: api.body,
      handler: (ctx) =>
        api.handler({
          req: ctx.req,
          url: ctx.url,
          params: ctx.params,
          body: ctx.body,
          session: ctx.auth.session,
          authMethod: ctx.auth.method,
          store,
          config: { guildId: config.guildId, dataDir: config.dataDir },
          services,
        }),
    });
  }

  // Bun.file(...) → @astra/site-kit's `serveFile` (the `send`-backed Range/206
  // bridge) — same fallback-to-index.html shape as before.
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

  const api: RouteGroup<Actor> = {
    prefix: "/api/",
    // Runs before the route lookup: an unauthenticated caller gets 401 for every
    // /api/ path, real or not.
    authenticate,
    routes: API_ROUTES.map(apiRouteOf),
    onOutcome: (outcome) => apiCounter.add(1, { outcome }),
  };

  return {
    serviceName: SERVICE_NAME,
    routes: [
      route({ method: "GET", path: "/auth/login", handler: () => login() }),
      route({ method: "GET", path: "/auth/callback", handler: (ctx) => callback(ctx.url) }),
      route({ method: "POST", path: "/auth/logout", handler: () => logout() }),
      // The legacy open health check (any method); the compose healthcheck uses /healthz.
      route({ method: "*", path: "/api/v1/health", handler: () => json({ ok: true }) }),
      // Public, unauthenticated: the static operator SPA fetches this at startup to
      // configure browser RUM (it can't read config.kdl itself — see web/observe).
      route({
        method: "*",
        path: "/api/v1/rum-config",
        handler: () => json({ endpoint: config.rumEndpoint }),
      }),
    ],
    groups: [api],
    fallback: (req) => {
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req);
      return json({ error: "method_not_allowed" }, 405);
    },
    // /healthz is ready only while Postgres answers.
    probes: {
      postgres: async () => {
        await store.ping();
        return true;
      },
    },
  };
}

export function createApp(config: AppConfig, store: LibraryStore, deps: AppDeps = {}): App {
  const { handle } = createHandler(defineApp(config, store, deps));
  return { store, config, handle };
}

interface RunningServer {
  server: Server;
  service: Service;
  app: App;
  stop(): Promise<void>;
}

export function startServer(
  config: AppConfig,
  store: LibraryStore,
  deps: AppDeps = {},
): RunningServer {
  const service = createService({
    ...defineApp(config, store, deps),
    port: config.port,
    // Bun.serve → srvx. Bun's `idleTimeout: 60` (seconds) has no
    // srvx option; these are the closest Node analogs — `keepAliveTimeout` (idle time
    // on an already-served keep-alive connection) and `headersTimeout` (which Node
    // requires to exceed it).
    node: { keepAliveTimeout: 60_000, headersTimeout: 61_000 },
  });
  const app: App = { store, config, handle: service.handle };
  return { server: service.server, service, app, stop: () => service.close() };
}
