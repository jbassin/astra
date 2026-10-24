/**
 * Telemetry for one Node service process: the providers, HTTP server and fetch
 * auto-instrumentation, and the one shutdown handler. `./register.ts` calls
 * {@link installNodeTelemetry} before the entry module loads; tests call it with in-memory
 * exporters.
 */

import { readFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve } from "node:path";

import { loadConfig } from "@astra/config";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";

import {
  HEALTHZ_PATH,
  type InitOptions,
  initTelemetry,
  inContainer,
  installShutdownHandlers,
  type Telemetry,
} from "./index";

/** The nearest `package.json` at or above `dir`, parsed, with its path. */
function nearestPackage(dir: string): { path: string; json: Record<string, unknown> } {
  for (let at = resolve(dir); ; at = dirname(at)) {
    const path = join(at, "package.json");
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      if (dirname(at) === at) throw new Error(`no package.json at or above ${dir}`);
      continue;
    }
    return { path, json: JSON.parse(text) as Record<string, unknown> };
  }
}

function camel(kebab: string): string {
  return kebab.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The service name of the entry script `entry`: its nearest `package.json` names a
 * config.kdl block in `"astra": { "config": "<namespace>" }`, and that block's
 * `service-name` is the name. Throws a message that says what to fix.
 */
export function serviceNameFor(entry: string, config: object = loadConfig()): string {
  const pkg = nearestPackage(dirname(resolve(entry)));
  const namespace = (pkg.json.astra as { config?: unknown } | undefined)?.config;
  if (typeof namespace !== "string") {
    throw new Error(
      `${pkg.path} has no "astra": { "config": "<namespace>" } field: ` +
        "@astra/observe/register names the service from that config.kdl block",
    );
  }
  const block = (config as Record<string, unknown>)[camel(namespace)] as
    | { serviceName?: unknown }
    | undefined;
  if (typeof block?.serviceName !== "string") {
    throw new Error(
      `config.kdl block ${JSON.stringify(namespace)} (named by ${pkg.path}) has no service-name`,
    );
  }
  return block.serviceName;
}

/** Whether a socket's remote address is this host's loopback (IPv4, IPv6 or mapped). */
export function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false;
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}

/** Whether an inbound request URL (path and query) is the health check. */
export function isHealthCheck(url: string | undefined): boolean {
  return url === HEALTHZ_PATH || url?.startsWith(`${HEALTHZ_PATH}?`) === true;
}

let instrumented = false;

/**
 * Patch `node:http`/`node:https` (inbound server spans and outbound client spans) and
 * subscribe to undici's diagnostics channel (global `fetch` client spans). Once per
 * process; the instrumentations use the global tracer provider.
 *
 * ESM note: no import-in-the-middle loader is needed. The http instrumentation patches the
 * builtin's CommonJS exports object when it is next `require`d, which we do right here,
 * and `syncBuiltinESMExports()` copies the patched functions onto the ESM named exports,
 * so both `import http from "node:http"` and `import { createServer } from "node:http"`
 * in app code (which loads after this) see them.
 */
export function instrumentHttp(): void {
  if (instrumented) return;
  instrumented = true;
  // Stable HTTP semantic conventions (`http.request.method`, `url.path`,
  // `http.response.status_code`) instead of the deprecated `http.method` set.
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= "http";
  // Inside a container only the compose healthcheck (`node -e "fetch(localhost…)"`, run by
  // `docker exec`) connects over loopback; real traffic arrives over a Docker network.
  // Leave those probes untraced, or every service makes a span every 15 s. `/healthz` is
  // never traced, wherever the probe comes from.
  const container = inContainer();
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          isHealthCheck(req.url) || (container && isLoopback(req.socket.remoteAddress)),
      }),
      new UndiciInstrumentation(),
    ],
  });
  const require = createRequire(import.meta.url);
  require("node:http");
  require("node:https");
  syncBuiltinESMExports();
}

export interface NodeTelemetryOptions extends InitOptions {
  /** Install the SIGTERM/SIGINT/beforeExit handler (default true; tests pass false). */
  handleSignals?: boolean;
}

/** Install telemetry, HTTP and fetch instrumentation and the shutdown handler. */
export function installNodeTelemetry(
  serviceName: string,
  opts: NodeTelemetryOptions = {},
): Telemetry {
  const telemetry = initTelemetry(serviceName, opts);
  instrumentHttp();
  if (opts.handleSignals ?? true) installShutdownHandlers();
  return telemetry;
}
