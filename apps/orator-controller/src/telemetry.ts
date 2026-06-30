/**
 * Minimal best-effort OTLP/HTTP (JSON) span emitter for the Stream Deck plugin.
 *
 * The plugin runs on the OPERATOR'S DESKTOP, not in the cluster, so it can't use
 * `@astra/observe` — that reads `config.kdl` and targets the in-cluster collector
 * (`signoz-otel-collector:4318`), unreachable from a desktop. Instead it posts spans
 * straight to the PUBLIC OTLP endpoint — the same `otel.iridi.cc` the browser RUM uses
 * (config.kdl `telemetry.rum-endpoint`). That URL is hardcoded here because `config.kdl`
 * isn't shipped inside the `.streamDeckPlugin` bundle, so config-single-source can't reach
 * this process; this is the one telemetry seam that lives outside the cluster.
 *
 * Fire-and-forget by design: telemetry must NEVER break the plugin, so every failure
 * (offline, DNS, a bad response) is swallowed. The full OTel SDK is deliberately avoided —
 * bundling it into a Rollup'd Stream Deck plugin is heavy and brittle; one hand-built OTLP
 * JSON POST per request is enough to see latency + errors in SigNoz.
 */
import { randomBytes } from "node:crypto";

const ENDPOINT = "https://otel.iridi.cc/v1/traces";
const SERVICE_NAME = "astra.orator-controller";

export interface SpanRecord {
  /** Span name, e.g. `orator GET`. */
  name: string;
  /** `Date.now()` at start / end (ms). */
  startMs: number;
  endMs: number;
  /** Flat attributes (all serialized as OTLP stringValue — robust across int64-JSON quirks). */
  attributes?: Record<string, string | number>;
  /** Present => the span is marked ERROR with this message. */
  error?: string;
}

const toAttrs = (obj: Record<string, string | number>) =>
  Object.entries(obj).map(([key, v]) => ({ key, value: { stringValue: String(v) } }));

/** Post one span to the public OTLP endpoint. Never throws, never awaits. */
export function emitSpan(span: SpanRecord): void {
  try {
    const payload = {
      resourceSpans: [
        {
          resource: { attributes: toAttrs({ "service.name": SERVICE_NAME }) },
          scopeSpans: [
            {
              scope: { name: SERVICE_NAME },
              spans: [
                {
                  traceId: randomBytes(16).toString("hex"),
                  spanId: randomBytes(8).toString("hex"),
                  name: span.name,
                  kind: 3, // SPAN_KIND_CLIENT — an outbound HTTP call to orator-backend.
                  startTimeUnixNano: `${Math.round(span.startMs * 1e6)}`,
                  endTimeUnixNano: `${Math.round(span.endMs * 1e6)}`,
                  attributes: toAttrs(span.attributes ?? {}),
                  status: span.error ? { code: 2, message: span.error } : { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* best-effort: telemetry must never break the plugin */
    });
  } catch {
    /* best-effort: never let span construction throw into the caller */
  }
}
