/**
 * OTel for astra TypeScript services: traces, metrics and logs to the SigNoz collector.
 *
 * Standing principle (CLAUDE.md): *telemetry from day one*. A Node service never calls
 * {@link initTelemetry} itself: its entry runs under `node --import @astra/observe/register`
 * (`./register.ts`), which installs the providers, HTTP and fetch instrumentation and the
 * shutdown flush before any app module evaluates. App code takes tracers, meters and
 * loggers from here and registers its own cleanup with {@link onShutdown}.
 *
 * Mirrors `libs/py/observe`:
 *
 * - The process picks the endpoint, never the caller: `ASTRA_RUNTIME=container` (set by
 *   `deploy/node.Dockerfile`) exports to `telemetry.otlp-endpoint`, the in-cluster
 *   collector; unset means the host and `telemetry.host-otlp-endpoint`.
 * - Every signal carries `deployment.environment`: `test` under vitest, `production` in a
 *   container or when the code runs from the deploy checkout (`$ASTRA_DEPLOY_ROOT`, default
 *   `/ruby/data/astra-deploy`), else `development`.
 * - Under vitest {@link initTelemetry} installs nothing, so no test reaches the live
 *   collector. Tests that assert on telemetry use `@astra/observe/testing`.
 * - Every log record is mirrored to stdout as one line, so `docker logs` shows what SigNoz
 *   shows.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { findRepoRoot, loadConfig } from "@astra/config";
import {
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type MetricOptions,
  metrics,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import { type Logger, logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { type Resource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type LogRecordExporter,
  type LogRecordProcessor,
  type SdkLogRecord,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  type MetricReader,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/** Runtime marker: `container` inside an astra image; unset (or `host`) on the host. */
export const RUNTIME_VAR = "ASTRA_RUNTIME";
/** The production checkout on the host (the same variable and default as the justfile). */
export const DEPLOY_ROOT_VAR = "ASTRA_DEPLOY_ROOT";
export const DEFAULT_DEPLOY_ROOT = "/ruby/data/astra-deploy";
/** The resource attribute SigNoz filters environments on. */
export const DEPLOYMENT_ENVIRONMENT = "deployment.environment";

/** The health-check path every service answers (`@astra/service-kit`). The HTTP
 * instrumentation never traces it, so a 15-second compose probe makes no spans. */
export const HEALTHZ_PATH = "/healthz";

/** Whether this process runs inside an astra container (`ASTRA_RUNTIME=container`). */
export function inContainer(): boolean {
  const runtime = process.env[RUNTIME_VAR] ?? "host";
  if (runtime !== "host" && runtime !== "container") {
    throw new Error(`${RUNTIME_VAR}=${JSON.stringify(runtime)}: expected 'container' or unset`);
  }
  return runtime === "container";
}

/** `test` under vitest, `production` in a container or the deploy checkout, else
 * `development`. */
export function deploymentEnvironment(): string {
  if (process.env.VITEST !== undefined) return "test";
  if (inContainer()) return "production";
  const deployRoot = resolve(process.env[DEPLOY_ROOT_VAR] ?? DEFAULT_DEPLOY_ROOT);
  let checkout: string;
  try {
    checkout = realpathSync(findRepoRoot());
  } catch {
    // Installed outside a checkout: not the deploy tree.
    return "development";
  }
  return checkout === deployRoot ? "production" : "development";
}

/** The collector's OTLP/HTTP base URL as this process can reach it (from `config.kdl`). */
export function otlpEndpoint(): string {
  const { telemetry } = loadConfig();
  return inContainer() ? telemetry.otlpEndpoint : telemetry.hostOtlpEndpoint;
}

/** The resource every signal of this process carries: service and deployment environment. */
export function telemetryResource(serviceName: string, environment?: string): Resource {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [DEPLOYMENT_ENVIRONMENT]: environment ?? deploymentEnvironment(),
  });
}

/** Where the three signals go. The default is OTLP/HTTP to {@link otlpEndpoint}; tests pass
 * in-memory exporters (`@astra/observe/testing`). */
export interface TelemetryExporters {
  spans: SpanExporter;
  metrics: MetricReader;
  logs: LogRecordExporter;
}

function otlpExporters(endpoint: string): TelemetryExporters {
  const base = endpoint.replace(/\/$/, "");
  return {
    spans: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    metrics: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
    }),
    logs: new OTLPLogExporter({ url: `${base}/v1/logs` }),
  };
}

export interface InitOptions {
  /** Replace the OTLP exporters (tests). Telemetry is installed even under vitest then. */
  exporters?: TelemetryExporters;
  /** Override `deployment.environment` (tests). */
  environment?: string;
  /** Export each span and log record as it ends instead of batching (tests). */
  synchronous?: boolean;
  /** Mirror log records to stdout (default true). */
  mirror?: boolean;
}

/** Handle returned by {@link initTelemetry}. */
export interface Telemetry {
  readonly serviceName: string;
  /** Export everything buffered, keeping the providers installed. */
  forceFlush: () => Promise<void>;
  /** Flush and tear down the providers; a later {@link initTelemetry} starts fresh. */
  shutdown: () => Promise<void>;
}

let state: Telemetry | null = null;

const NOOP: Omit<Telemetry, "serviceName"> = {
  forceFlush: async () => {},
  shutdown: async () => {},
};

/** The installed telemetry, or `null` before init (and always under vitest without
 * exporters). */
export function currentTelemetry(): Telemetry | null {
  return state;
}

/**
 * Install global tracer, meter and logger providers. `serviceName` is `astra.<subsystem>`.
 *
 * Services don't call this: `@astra/observe/register` does. Idempotent: a second call
 * returns the first handle, and warns when it names a different service. Under vitest it
 * installs nothing unless `opts.exporters` is given.
 */
export function initTelemetry(serviceName: string, opts: InitOptions = {}): Telemetry {
  if (state) {
    if (state.serviceName !== serviceName) {
      // oxlint-disable-next-line no-console -- observe's own warning stays local
      console.warn(
        `initTelemetry(${JSON.stringify(serviceName)}) ignored: telemetry already runs as ${JSON.stringify(
          state.serviceName,
        )}`,
      );
    }
    return state;
  }
  const environment = opts.environment ?? deploymentEnvironment();
  if (environment === "test" && !opts.exporters) return { serviceName, ...NOOP };

  const exporters = opts.exporters ?? otlpExporters(otlpEndpoint());
  const resource = telemetryResource(serviceName, environment);

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      opts.synchronous
        ? new SimpleSpanProcessor(exporters.spans)
        : new BatchSpanProcessor(exporters.spans),
    ],
  });
  tracerProvider.register();

  const meterProvider = new MeterProvider({ resource, readers: [exporters.metrics] });
  metrics.setGlobalMeterProvider(meterProvider);

  const logProcessors: LogRecordProcessor[] = [];
  // First, so the severity number it fills in is exported too.
  logProcessors.push(new SeverityProcessor(opts.mirror ?? true));
  logProcessors.push(
    opts.synchronous
      ? new SimpleLogRecordProcessor(exporters.logs)
      : new BatchLogRecordProcessor(exporters.logs),
  );
  const loggerProvider = new LoggerProvider({ resource, processors: logProcessors });
  logs.setGlobalLoggerProvider(loggerProvider);

  const handle: Telemetry = {
    serviceName,
    forceFlush: async () => {
      await Promise.all([
        tracerProvider.forceFlush(),
        meterProvider.forceFlush(),
        loggerProvider.forceFlush(),
      ]);
    },
    shutdown: async () => {
      if (state === handle) state = null;
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
      trace.disable();
      metrics.disable();
      logs.disable();
    },
  };
  state = handle;
  return handle;
}

/** A tracer from the installed provider (a no-op tracer if nothing is installed). */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/** A meter from the installed provider. Under `@astra/observe/register` the provider is
 * installed before app modules run, so module-scope instruments work there; in code that
 * also runs elsewhere (scripts, tests) prefer {@link lazyCounter}/{@link lazyHistogram}. */
export function getMeter(name: string): Meter {
  return metrics.getMeter(name);
}

/** A raw OTel logger. Prefer {@link logger}, which sets the severity for you. */
export function getLogger(name: string): Logger {
  return logs.getLogger(name);
}

// --- logs ---------------------------------------------------------------------------------

const SEVERITY_BY_TEXT: Record<string, SeverityNumber> = {
  TRACE: SeverityNumber.TRACE,
  DEBUG: SeverityNumber.DEBUG,
  INFO: SeverityNumber.INFO,
  WARN: SeverityNumber.WARN,
  WARNING: SeverityNumber.WARN,
  ERROR: SeverityNumber.ERROR,
  FATAL: SeverityNumber.FATAL,
};

/**
 * Fills in the severity number from the severity text (older `emit({ severityText })` calls
 * set only the text) and mirrors every INFO-or-above record to stdout as one line:
 * `<iso time> <LEVEL> <logger> <body> <attributes as JSON>`.
 */
class SeverityProcessor implements LogRecordProcessor {
  private readonly mirror: boolean;

  constructor(mirror: boolean) {
    this.mirror = mirror;
  }

  onEmit(record: SdkLogRecord): void {
    let severity = record.severityNumber;
    if (severity === undefined && record.severityText !== undefined) {
      severity = SEVERITY_BY_TEXT[record.severityText.toUpperCase()];
      if (severity !== undefined) record.setSeverityNumber(severity);
    }
    if (!this.mirror || (severity !== undefined && severity < SeverityNumber.INFO)) return;
    process.stdout.write(`${formatRecord(record)}\n`);
  }

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

function formatRecord(record: SdkLogRecord): string {
  const [seconds, nanos] = record.hrTime;
  const time = new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
  const level = (record.severityText ?? "INFO").toUpperCase();
  const body = typeof record.body === "string" ? record.body : JSON.stringify(record.body);
  const attrs =
    Object.keys(record.attributes).length > 0 ? ` ${JSON.stringify(record.attributes)}` : "";
  return `${time} ${level} ${record.instrumentationScope.name} ${body}${attrs}`;
}

/** Attributes on one log record. */
export type LogAttributes = Attributes;

/** A logger that sets severity text and number; records export to SigNoz and print to
 * stdout. `name` is `astra.<subsystem>`. */
export interface AstraLogger {
  debug(message: string, attributes?: LogAttributes): void;
  info(message: string, attributes?: LogAttributes): void;
  warn(message: string, attributes?: LogAttributes): void;
  error(message: string, attributes?: LogAttributes): void;
  fatal(message: string, attributes?: LogAttributes): void;
}

/** The {@link AstraLogger} called `name`. Safe at module scope. */
export function logger(name: string): AstraLogger {
  const at =
    (severityNumber: SeverityNumber, severityText: string) =>
    (body: string, attributes?: LogAttributes) => {
      logs.getLogger(name).emit({ severityNumber, severityText, body, attributes });
    };
  return {
    debug: at(SeverityNumber.DEBUG, "DEBUG"),
    info: at(SeverityNumber.INFO, "INFO"),
    warn: at(SeverityNumber.WARN, "WARN"),
    error: at(SeverityNumber.ERROR, "ERROR"),
    fatal: at(SeverityNumber.FATAL, "FATAL"),
  };
}

// --- deliberately ignored errors ----------------------------------------------------------

/** The counter {@link reportIgnored} adds to, by `site` (the same name in Python). */
export const IGNORED_ERRORS_METRIC = "astra.errors.ignored";
const OBSERVE_SCOPE = "astra.observe";

/**
 * Record an error the code deliberately ignores, instead of a bare `catch {}`: one
 * `astra.errors.ignored{site}` count and a DEBUG log record. `site` is a short, stable
 * name for the catch (`weal-overlay.sse-write`), never a value with unbounded cardinality.
 */
export function reportIgnored(site: string, err: unknown): void {
  // Taken at call time, so the count lands in whichever provider is installed now.
  metrics
    .getMeter(OBSERVE_SCOPE)
    .createCounter(IGNORED_ERRORS_METRIC, {
      description: "Errors the code caught and deliberately ignored, by site",
    })
    .add(1, { site });
  const type = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  logs.getLogger(OBSERVE_SCOPE).emit({
    severityNumber: SeverityNumber.DEBUG,
    severityText: "DEBUG",
    body: `ignored error at ${site}: ${message}`,
    attributes: { site, "exception.type": type, "exception.message": message },
  });
}

// --- shutdown -------------------------------------------------------------------------------

type ShutdownHook = () => unknown;
const shutdownHooks: ShutdownHook[] = [];
let shuttingDown: Promise<never> | null = null;
/** The whole shutdown's budget, `telemetry.shutdown-timeout-ms` (read once). */
let shutdownBudgetMs: number | undefined;

function shutdownBudget(): number {
  shutdownBudgetMs ??= loadConfig().telemetry.shutdownTimeoutMs;
  return shutdownBudgetMs;
}

/**
 * Run `hook` when the process shuts down (SIGTERM, SIGINT or {@link exitAfterFlush}),
 * before telemetry flushes: close servers, browsers and sockets here. Hooks run in reverse
 * registration order, concurrently awaited and bounded, and a failing hook is reported, not
 * fatal.
 */
export function onShutdown(hook: ShutdownHook): void {
  shutdownHooks.push(hook);
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  const { promise: timeout, resolve: done } = Promise.withResolvers<undefined>();
  const timer = setTimeout(() => done(undefined), Math.max(ms, 0));
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Shut the process down: run the {@link onShutdown} hooks, flush telemetry, then exit with
 * `code`. Bounded by `telemetry.shutdown-timeout-ms` (the hooks get 60% of it, the flush the
 * rest), so a hung hook or an unreachable collector cannot outlive Docker's stop grace. Use
 * it on a fatal startup error, so the FATAL record reaches SigNoz. A second call joins the
 * first.
 */
export function exitAfterFlush(code: number): Promise<never> {
  if (shuttingDown) return shuttingDown;
  shuttingDown = (async () => {
    const budget = shutdownBudget();
    const started = Date.now();
    const hooks = shutdownHooks.toReversed().map(async (hook) => {
      try {
        await hook();
      } catch (err) {
        reportIgnored("observe.shutdown-hook", err);
      }
    });
    await within(Promise.all(hooks), budget * 0.6);
    const telemetry = state;
    if (telemetry) {
      await within(telemetry.shutdown(), budget - (Date.now() - started));
    }
    process.exit(code);
  })();
  return shuttingDown;
}

let handlersInstalled = false;

/** Install the process's one SIGTERM/SIGINT handler ({@link exitAfterFlush} with 0) and a
 * flush when the event loop drains (`beforeExit`). Register calls it; idempotent. */
export function installShutdownHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const budget = shutdownBudget();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => void exitAfterFlush(0));
  }
  let drained = false;
  process.on("beforeExit", () => {
    // A natural end of the program: flush once (the flush itself re-fills the loop).
    if (drained || shuttingDown || !state) return;
    drained = true;
    void within(state.shutdown(), budget);
  });
}

// --- lazy metric instruments -------------------------------------------------------------
//
// The JS metrics API has no deferred proxy provider: an instrument created before a
// MeterProvider is installed stays a no-op forever. Under `@astra/observe/register` the
// provider is installed before app modules evaluate, so module-scope instruments are fine
// in services; these wrappers bind on first use, which also keeps a module safe in scripts
// and tests that import it before (or without) telemetry. Use them for app metrics.

export interface LazyCounter {
  add(value: number, attributes?: Attributes): void;
}

/** A counter that binds to the installed meter on first `add()`. */
export function lazyCounter(meterName: string, name: string, options?: MetricOptions): LazyCounter {
  let inst: Counter | undefined;
  return {
    add(value, attributes) {
      if (!inst) inst = metrics.getMeter(meterName).createCounter(name, options);
      inst.add(value, attributes);
    },
  };
}

export interface LazyHistogram {
  record(value: number, attributes?: Attributes): void;
}

/** A histogram that binds to the installed meter on first `record()`. */
export function lazyHistogram(
  meterName: string,
  name: string,
  options?: MetricOptions,
): LazyHistogram {
  let inst: Histogram | undefined;
  return {
    record(value, attributes) {
      if (!inst) inst = metrics.getMeter(meterName).createHistogram(name, options);
      inst.record(value, attributes);
    },
  };
}
