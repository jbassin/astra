/**
 * In-memory telemetry for tests: assert on spans, metrics and logs without a collector
 * (the TS twin of `astra_observe.testing`).
 *
 * `captureTelemetry()` installs observe's real global providers with in-memory exporters
 * and synchronous processors, so code under test that uses `getTracer`, `logger`,
 * `lazyCounter` and friends is recorded. `close()` tears them down and resets the OTel
 * globals, so the next capture starts clean.
 *
 * Caveat, as in Python: a tracer, `lazyCounter` or `lazyHistogram` that bound to an
 * earlier provider stays bound to it. Code that takes its instruments at call time is
 * always captured; a module-scope lazy instrument only in the first capture that uses it.
 */

import { InMemoryLogRecordExporter, type ReadableLogRecord } from "@opentelemetry/sdk-logs";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  type MetricReader,
  PeriodicExportingMetricReader,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace-base";

import { initTelemetry, type Telemetry } from "./index";
import { installNodeTelemetry } from "./node";

/** What one capture recorded. */
export interface Captured {
  readonly telemetry: Telemetry;
  /** Finished spans, oldest first. */
  spans(): ReadableSpan[];
  /** Emitted log records, oldest first. */
  logs(): ReadableLogRecord[];
  /** The total of counter `name` over points whose attributes include `attributes`. */
  metricSum(name: string, attributes?: Record<string, unknown>): Promise<number>;
  /** Tear down the providers and reset the OTel globals. */
  close(): Promise<void>;
}

export interface CaptureOptions {
  serviceName?: string;
  /** Also install the HTTP and fetch instrumentation (what `@astra/observe/register` does). */
  instrumentHttp?: boolean;
}

/** Record every span, metric and log record until `close()`. */
export function captureTelemetry(opts: CaptureOptions = {}): Captured {
  const serviceName = opts.serviceName ?? "astra.test";
  const spans = new InMemorySpanExporter();
  const logs = new InMemoryLogRecordExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  // A long interval: points are collected on demand (`metricSum` flushes the reader).
  const reader: MetricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 3_600_000,
  });
  const init = {
    exporters: { spans, metrics: reader, logs },
    environment: "test",
    synchronous: true,
    mirror: false,
  };
  const telemetry = opts.instrumentHttp
    ? installNodeTelemetry(serviceName, { ...init, handleSignals: false })
    : initTelemetry(serviceName, init);
  if (telemetry.serviceName !== serviceName) {
    throw new Error(`telemetry already runs as ${telemetry.serviceName}; close() it first`);
  }
  return {
    telemetry,
    spans: () => spans.getFinishedSpans(),
    logs: () => logs.getFinishedLogRecords(),
    async metricSum(name, attributes = {}) {
      await reader.forceFlush();
      const batches: ResourceMetrics[] = metricExporter.getMetrics();
      const latest = batches.at(-1);
      let total = 0;
      for (const scope of latest?.scopeMetrics ?? []) {
        for (const metric of scope.metrics) {
          if (metric.descriptor.name !== name) continue;
          for (const point of metric.dataPoints) {
            const attrs = point.attributes as Record<string, unknown>;
            if (Object.entries(attributes).every(([k, v]) => attrs[k] === v)) {
              total += point.value as number;
            }
          }
        }
      }
      return total;
    },
    close: () => telemetry.shutdown(),
  };
}
