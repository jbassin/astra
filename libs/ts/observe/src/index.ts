/**
 * OTel init shim for astra TypeScript apps — traces + metrics → the SigNoz collector.
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
import { type Meter, metrics, type Tracer, trace } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/** The local collector's OTLP/HTTP receiver (deploy/ remaps it into the astra range). */
export const DEFAULT_ENDPOINT = "http://localhost:10353";

/** Handle returned by {@link initTelemetry} — call `shutdown()` to force-flush + tear down. */
export interface Telemetry {
  shutdown: () => Promise<void>;
}

let state: { providers: Telemetry } | null = null;

/**
 * Install global tracer + meter providers exporting OTLP/HTTP to the SigNoz collector.
 * Idempotent: a second call returns the first handle. `serviceName` should be
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

  const providers: Telemetry = {
    shutdown: async () => {
      await tracerProvider.shutdown();
      await meterProvider.shutdown();
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
