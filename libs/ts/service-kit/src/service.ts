/**
 * `createService()`: the HTTP spine of an astra Node service. One request handler that
 * answers `/healthz`, dispatches a route table (public routes, then authenticated groups),
 * maps errors to JSON, and names the HTTP server span by route template; a srvx server
 * around it; a readiness state; and one ordered shutdown.
 *
 * Telemetry comes from `node --import @astra/observe/register`, which creates the HTTP
 * server span for every request (except `/healthz`) and owns SIGTERM. The kit names that
 * span `METHOD /route/:template` (through the instrumentation's RPC metadata, which also
 * sets `http.route`), and registers one observe shutdown hook that runs the service's
 * shutdown in order before observe flushes telemetry.
 */

import { loadConfig } from "@astra/config";
import { HEALTHZ_PATH, logger, onShutdown as onProcessShutdown } from "@astra/observe";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { getRPCMetadata, RPCType } from "@opentelemetry/core";
import { type Server, type ServerOptions, serve } from "srvx";

import { findRoute, HttpError, json, type Route, type RouteContext } from "./routes";

/** How one request in a group ended, for an app's own request counter. */
export type Outcome = "ok" | "unauthenticated" | "not_found" | "client_error" | "error";

/** Routes under a URL prefix that share authentication and a 404. */
export interface RouteGroup<Auth> {
  /** e.g. `/api/`: every request under it is answered by this group. */
  readonly prefix: string;
  /**
   * The actor of a request, or null to refuse it. Runs before the route is looked up, so an
   * unauthenticated request learns nothing about which paths exist.
   */
  authenticate?(req: Request): Auth | null | Promise<Auth | null>;
  // oxlint-disable-next-line typescript/no-explicit-any -- each route has its own body type
  readonly routes: readonly Route<Auth, any>[];
  /** The error code of a refused request (401). Default `unauthenticated`. */
  readonly unauthenticated?: string;
  /** The error code of a path under the prefix with no route (404). Default `not_found`. */
  readonly notFound?: string;
  /** Called once per request in the group. */
  onOutcome?(outcome: Outcome): void;
}

/** A readiness probe: true (or resolving true) when the dependency it checks is usable. */
export type Probe = () => boolean | Promise<boolean>;

export interface ServiceDefinition {
  /** The service name (config.kdl `service-name`): names the logger. */
  readonly serviceName: string;
  /** Public routes, matched first, by method and template. */
  // oxlint-disable-next-line typescript/no-explicit-any -- each route has its own body type
  readonly routes?: readonly Route<undefined, any>[];
  // oxlint-disable-next-line typescript/no-explicit-any -- each group has its own actor type
  readonly groups?: readonly RouteGroup<any>[];
  /** Everything no route or group answered (static files, an SPA). Default: a 404. */
  fallback?(req: Request, url: URL): Response | Promise<Response>;
  /** Dependency checks `/healthz` runs; any false makes the service unready. */
  readonly probes?: Readonly<Record<string, Probe>>;
  /** The error body of every kit-made error. Default `{ "error": code }`. */
  errorResponse?(status: number, code: string): Response;
  /** The code of a body that is not JSON. Default `invalid_json`. */
  readonly invalidJson?: string;
  /** The code of an unexpected error (500). Default `internal`. */
  readonly internalError?: string;
}

/** Where the service is in its life: `/healthz` answers 200 only when `ready`. */
export type ServiceState = "starting" | "ready" | "draining";

const PROBE_TIMEOUT_MS = 2000;
/** How long shutdown waits for force-closed sockets to report closed. */
const SOCKET_CLOSE_MS = 500;

function defaultErrorResponse(status: number, code: string): Response {
  return json({ error: code }, status);
}

/** The HTTP status an error carries: an {@link HttpError}, or any error with a numeric
 * 4xx/5xx `status` (domain errors such as a playback refusal). */
function errorStatus(err: unknown): number | null {
  if (err instanceof HttpError) return err.status;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600) {
    return status;
  }
  return null;
}

/** Name the HTTP server span (made by the observe register) after the route template. */
function nameRequestSpan(template: string): void {
  const rpc = getRPCMetadata(context.active());
  if (rpc?.type === RPCType.HTTP) rpc.route = template;
}

async function runProbe(probe: Probe): Promise<boolean> {
  const { promise: timeout, resolve } = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
  try {
    return await Promise.race([Promise.resolve().then(probe), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The request handler, its readiness state, and the health check. */
export interface Handler {
  handle(req: Request): Promise<Response>;
  state: ServiceState;
}

/**
 * Build the request handler without binding a port (unit tests). Its state starts `ready`;
 * {@link createService} starts it `starting` and marks it ready once the server listens.
 */
export function createHandler(def: ServiceDefinition): Handler {
  const log = logger(def.serviceName);
  const errorResponse = def.errorResponse ?? defaultErrorResponse;
  const invalidJson = def.invalidJson ?? "invalid_json";
  const internalError = def.internalError ?? "internal";
  const routes = def.routes ?? [];
  const groups = def.groups ?? [];
  const probes = Object.entries(def.probes ?? {});

  const handler: Handler = { handle, state: "ready" };

  async function health(): Promise<Response> {
    if (handler.state !== "ready") return json({ status: handler.state }, 503);
    const checks: Record<string, "ok" | "fail"> = {};
    let ok = true;
    for (const [name, probe] of probes) {
      const passed = await runProbe(probe);
      checks[name] = passed ? "ok" : "fail";
      ok &&= passed;
    }
    const body =
      probes.length > 0 ? { status: ok ? "ready" : "unready", checks } : { status: "ready" };
    return json(body, ok ? 200 : 503);
  }

  function context_<Auth, Body>(
    req: Request,
    url: URL,
    // oxlint-disable-next-line typescript/no-explicit-any -- the route's own body type
    r: Route<Auth, any>,
    params: Record<string, string>,
    auth: Auth,
  ): RouteContext<Auth, Body> {
    let parsed: Promise<Body> | undefined;
    async function readBody(): Promise<Body> {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        throw new HttpError(400, invalidJson);
      }
      if (!r.body) return raw as Body;
      const result = await r.body["~standard"].validate(raw);
      if (result.issues) throw new HttpError(400, result.issues[0]?.message ?? invalidJson);
      return result.value as Body;
    }
    return {
      req,
      url,
      params,
      auth,
      body: () => {
        parsed ??= readBody();
        return parsed;
      },
    };
  }

  /** Run a handler; map a thrown error to its response. */
  async function run(
    req: Request,
    url: URL,
    fn: () => Response | Promise<Response>,
    outcome?: (o: Outcome) => void,
  ): Promise<Response> {
    try {
      const res = await fn();
      outcome?.("ok");
      return res;
    } catch (err) {
      const status = errorStatus(err);
      if (status !== null) {
        outcome?.("client_error");
        return errorResponse(status, (err as Error).message || "error");
      }
      outcome?.("error");
      const message = err instanceof Error ? err.message : String(err);
      trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR, message });
      log.error(`api error on ${req.method} ${url.pathname}: ${message}`);
      return errorResponse(500, internalError);
    }
  }

  // oxlint-disable-next-line require-await -- a throw in here becomes a rejected promise
  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === HEALTHZ_PATH && (req.method === "GET" || req.method === "HEAD")) {
      return health();
    }

    const open = findRoute(routes, req.method, pathname);
    if (open) {
      nameRequestSpan(open.route.path);
      return run(req, url, () =>
        open.route.handler(context_(req, url, open.route, open.params, undefined)),
      );
    }

    for (const group of groups) {
      if (!pathname.startsWith(group.prefix)) continue;
      const outcome = (o: Outcome) => group.onOutcome?.(o);
      const matched = findRoute(group.routes, req.method, pathname);
      if (matched) nameRequestSpan(matched.route.path);
      return run(req, url, async () => {
        const auth: unknown = group.authenticate ? await group.authenticate(req) : undefined;
        if (group.authenticate && (auth === null || auth === undefined)) {
          outcome("unauthenticated");
          return errorResponse(401, group.unauthenticated ?? "unauthenticated");
        }
        if (!matched) {
          outcome("not_found");
          return errorResponse(404, group.notFound ?? "not_found");
        }
        return run(
          req,
          url,
          () => matched.route.handler(context_(req, url, matched.route, matched.params, auth)),
          outcome,
        );
      });
    }

    if (def.fallback) {
      const fallback = def.fallback;
      return run(req, url, () => fallback(req, url));
    }
    return errorResponse(404, "not_found");
  }

  return handler;
}

export interface ServiceOptions extends ServiceDefinition {
  /** Bind port (config.kdl); 0 asks the OS for a free one (read it back from `url`). */
  readonly port: number;
  /** Bind address; default `0.0.0.0`. */
  readonly hostname?: string;
  /** Options handed to Node's `http.createServer` (e.g. `keepAliveTimeout`). */
  readonly node?: ServerOptions["node"];
  /**
   * How long shutdown waits for in-flight requests before closing every connection.
   * Default: a quarter of `telemetry.shutdown-timeout-ms`.
   */
  readonly drainMs?: number;
  /** Register the ordered shutdown with observe's process shutdown (default true). */
  readonly handleShutdown?: boolean;
}

/** A running service. */
export interface Service {
  readonly server: Server;
  handle(req: Request): Promise<Response>;
  readonly state: ServiceState;
  /** Resolves once the server listens (the state is then `ready`), with its URL. */
  ready(): Promise<string>;
  /**
   * Run `hook` during shutdown, after the server has stopped and drained and before
   * telemetry flushes. Hooks run one at a time, last registered first.
   */
  onShutdown(hook: () => unknown): void;
  /** The ordered shutdown; idempotent. */
  close(): Promise<void>;
}

function drainBudget(): number {
  return Math.floor(loadConfig().telemetry.shutdownTimeoutMs / 4);
}

function within(promise: Promise<unknown>, ms: number): Promise<void> {
  const { promise: timeout, resolve } = Promise.withResolvers<void>();
  const timer = setTimeout(resolve, Math.max(ms, 0));
  const settled = promise.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Start the service: bind the handler on srvx, mark it ready once it listens, and register
 * the ordered shutdown: (1) `/healthz` turns 503 and the server stops accepting connections,
 * (2) in-flight requests drain for up to `drainMs`, then every connection still open (SSE
 * streams) is closed, (3) the service's `onShutdown` hooks run one at a time, last first,
 * (4) observe flushes telemetry and exits.
 */
export function createService(opts: ServiceOptions): Service {
  const log = logger(opts.serviceName);
  const handler = createHandler(opts);
  handler.state = "starting";
  const hooks: (() => unknown)[] = [];

  const server = serve({
    port: opts.port,
    hostname: opts.hostname ?? "0.0.0.0",
    // observe owns SIGTERM/SIGINT; srvx's own graceful-shutdown handlers would race it.
    gracefulShutdown: false,
    silent: true,
    node: opts.node,
    fetch: handler.handle,
  });

  const listening = server.ready().then((s) => {
    if (handler.state === "starting") handler.state = "ready";
    const url = s.url ?? "";
    log.info(`${opts.serviceName} listening on ${url}`);
    return url;
  });

  let closing: Promise<void> | undefined;
  async function shutdown(): Promise<void> {
    handler.state = "draining";
    // close() stops accepting and resolves once every connection has ended.
    const drained = server.close(false);
    await within(drained, opts.drainMs ?? drainBudget());
    // Whatever is still open (SSE streams, a hung request) is closed, and we wait for
    // those sockets to finish closing, so the hooks below never race a live request.
    await server.close(true);
    await within(drained, SOCKET_CLOSE_MS);
    for (const hook of hooks.toReversed()) {
      try {
        await hook();
      } catch (err) {
        log.warn(`shutdown hook failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  function close(): Promise<void> {
    closing ??= shutdown();
    return closing;
  }
  if (opts.handleShutdown ?? true) onProcessShutdown(close);

  return {
    server,
    handle: handler.handle,
    get state() {
      return handler.state;
    },
    ready: () => listening,
    onShutdown: (hook) => {
      hooks.push(hook);
    },
    close,
  };
}
