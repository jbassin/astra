// Client RUM (S1): browser OpenTelemetry → SigNoz. Emits a page-load span from
// the browser to the public OTLP endpoint. The endpoint comes from config.kdl
// (config-single-source) via the `getRumEndpoint` server function — the browser
// can't read config, so it RPCs the server for the value. Strictly client-only —
// imported behind a mount guard so it never runs during SSR.

import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { getRumEndpoint } from "./rumConfig";

let started = false;

export async function initRum(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const raw = await getRumEndpoint();
    if (!raw) return; // no endpoint configured → RUM disabled
    const endpoint = raw.replace(/\/$/, "");
    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "astra.strider-rum" }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
      ],
    });
    provider.register();

    const span = trace.getTracer("astra.strider-rum").startSpan("page-load", {
      attributes: { "page.path": window.location.pathname },
    });
    const finish = () => span.end();
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
  } catch (err) {
    console.warn("[strider] RUM init skipped:", err);
  }
}
