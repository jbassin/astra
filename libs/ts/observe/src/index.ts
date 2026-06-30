/**
 * OTel init shim for astra TypeScript apps — traces + metrics + logs → the SigNoz collector.
 *
 * Standing principle (CLAUDE.md): *telemetry from day one*. Every app installs this
 * once at startup, either programmatically (`initTelemetry`) or — preferred for
 * servers/bots — via `bun --preload @astra/observe/preload` (see `./telemetry.ts`).
 * The collector endpoint comes from `config.kdl` (`telemetry.otlpEndpoint`); the
 * preload reads only `OTEL_SERVICE_NAME` (process identity, not config) so a span
 * lands in SigNoz with no per-app wiring.
 *
 * Mirrors `libs/py/observe`: same default endpoint, same `astra.<subsystem>` service
 * naming, same idempotency + explicit `shutdown()` (force-flush before a short-lived
 * process exits, or buffered spans are dropped).
 */

import { loadConfig } from "@astra/config";
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
import { type Logger, logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/** In-cluster SigNoz collector OTLP/HTTP (signoz-net; mirrors the config.kdl default). */
export const DEFAULT_ENDPOINT = "http://signoz-otel-collector:4318";

/** Handle returned by {@link initTelemetry} — call `shutdown()` to force-flush + tear down. */
export interface Telemetry {
  shutdown: () => Promise<void>;
}

let state: { providers: Telemetry } | null = null;

/**
 * Install global tracer + meter + logger providers exporting OTLP/HTTP to the SigNoz
 * collector. Idempotent: a second call returns the first handle. `serviceName` should be
 * `astra.<subsystem>`.
 */
export function initTelemetry(serviceName: string, opts?: { endpoint?: string }): Telemetry {
  if (state) return state.providers;

  // Endpoint comes from config.kdl (telemetry.otlpEndpoint) via @astra/config — no
  // ad-hoc env lookup. `opts.endpoint` overrides for tests / embedding.
  const endpoint = (opts?.endpoint ?? loadConfig().telemetry.otlpEndpoint).replace(/\/$/, "");
  const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName });

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
    ],
  });
  tracerProvider.register();

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs` }))],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const providers: Telemetry = {
    shutdown: async () => {
      await tracerProvider.shutdown();
      await meterProvider.shutdown();
      await loggerProvider.shutdown();
      state = null;
    },
  };
  state = { providers };
  return providers;
}

/** A tracer from the installed provider (a no-op tracer if init wasn't called). */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/** A meter from the installed provider (a no-op meter if init wasn't called). */
export function getMeter(name: string): Meter {
  return metrics.getMeter(name);
}

/** A logger from the installed provider (a no-op logger if init wasn't called). `name`
 * should be `astra.<subsystem>`. Records export to SigNoz once initTelemetry has run. */
export function getLogger(name: string): Logger {
  return logs.getLogger(name);
}

// --- lazy metric instruments -------------------------------------------------------------
//
// LOAD-BEARING: unlike traces (ProxyTracer) and logs (ProxyLogger), the JS metrics API has
// NO deferred proxy provider. A counter/histogram obtained from `getMeter().create*()`
// BEFORE `initTelemetry` installs the real MeterProvider is a PERMANENT no-op — it never
// connects retroactively. Module-scope instruments hit this every time, because ES import
// hoisting runs the imported module's top-level code before the entry's `initTelemetry()`
// call. (This silently no-op'd every TS metric until 2026-06-30.) These helpers defer the
// instrument creation to first use — by which point init has run — mirroring the lazy bind
// in libs/py/llm. Always prefer these over `getMeter().createCounter()` at module scope.

export interface LazyCounter {
  add(value: number, attributes?: Attributes): void;
}

/** A counter that binds to the real meter on first `add()` (after initTelemetry). */
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

/** A histogram that binds to the real meter on first `record()` (after initTelemetry). */
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
