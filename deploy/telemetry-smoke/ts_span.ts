/**
 * Phase 0 telemetry smoke (TypeScript) — emit one OTel span to the SigNoz collector.
 *
 * Not a CI lane: run it manually against a live stack to prove the OTLP loop
 * end-to-end (this de-risks Phase 1's libs/ts/observe). Deps are ephemeral, so
 * nothing leaks into the workspace lockfile:
 *
 *   mkdir -p /tmp/astra-ts-span && cd /tmp/astra-ts-span && bun init -y >/dev/null
 *   bun add @opentelemetry/api @opentelemetry/sdk-trace-base \
 *           @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources \
 *           @opentelemetry/semantic-conventions
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:10353 \
 *     bun /ruby/data/experiments/astra/deploy/telemetry-smoke/ts_span.ts
 */
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:10353";

const provider = new BasicTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "astra-smoke-ts" }),
  spanProcessors: [
    new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
  ],
});
trace.setGlobalTracerProvider(provider);

const span = trace.getTracer("astra-smoke-ts").startSpan("phase0-smoke-span");
span.setAttribute("astra.phase", 0);
span.setAttribute("astra.lane", "ts");
span.end();

await provider.forceFlush();
await provider.shutdown();
console.log(`ts span emitted to ${endpoint}`);
