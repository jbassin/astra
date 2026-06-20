/**
 * Browser RUM (client OpenTelemetry → SigNoz) — the web counterpart to
 * {@link initTelemetry}. A `WebTracerProvider` exporting OTLP/HTTP traces plus a
 * page-load span. Shared by every SSR frontend (strider is the template; 0011-13
 * follow).
 *
 * The CALLER supplies the endpoint and service name. This module deliberately
 * imports neither `@astra/config` nor the node SDK, so it can never drag config
 * reads or `sdk-trace-node` into a client bundle — the endpoint is resolved
 * server-side (config.kdl, config-single-source) and handed in across the app's
 * server boundary. Idempotent and client-only; safe to call eagerly.
 */

import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export interface RumOptions {
  /** OTel service name, e.g. `astra.strider-rum`. */
  serviceName: string;
  /** Public OTLP/HTTP base URL the browser posts to (no `/v1/traces` suffix). */
  endpoint: string;
}

let started = false;

/** Install the browser tracer provider and emit a one-shot `page-load` span. */
export function initRum({ serviceName, endpoint }: RumOptions): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const url = `${endpoint.replace(/\/$/, "")}/v1/traces`;
    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url }))],
    });
    provider.register();

    const span = trace.getTracer(serviceName).startSpan("page-load", {
      attributes: { "page.path": window.location.pathname },
    });
    const finish = () => span.end();
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
  } catch (err) {
    console.warn("[observe/web] RUM init skipped:", err);
  }
}
