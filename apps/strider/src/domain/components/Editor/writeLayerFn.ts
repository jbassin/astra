import { getLogger, getMeter, getTracer } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
import { createServerFn } from "@tanstack/react-start";
import { writeLayer } from "../../../../scripts/writeLayer";

// Editor save endpoint as a TanStack Start server function — the idiomatic way to
// run server-only code in this stack (handled in dev and prod alike; the node:fs
// write + validation stay out of the client bundle). The editor UI that calls
// this is gated to the local network at the Caddy edge (the write endpoint's auth
// is a deliberate accepted risk — see memory strider-editor-auth-accepted).
//
// The mutation is traced (span + counter + log to SigNoz) so it's observable and
// doubles as the editor's audit trail — telemetry-from-day-one (principle #1).
const tracer = getTracer("astra.strider");
const logger = getLogger("astra.strider");
const writeCounter = getMeter("astra.strider").createCounter("astra.strider.editor.writes", {
  description: "Editor layer-write attempts by outcome",
});

export const writeLayerFn = createServerFn({ method: "POST" })
  .validator((data: { filename: string; content: string }) => data)
  .handler(({ data }) =>
    tracer.startActiveSpan(
      "writeLayer",
      { attributes: { "editor.filename": data.filename } },
      (span) => {
        try {
          const result = writeLayer(data);
          span.setAttribute("http.status_code", result.status);
          if (!result.body.ok) {
            const error = result.body.error ?? "write failed";
            span.setStatus({ code: SpanStatusCode.ERROR, message: error });
            writeCounter.add(1, { outcome: "error" });
            logger.emit({
              severityText: "WARN",
              body: `editor write rejected: ${error}`,
              attributes: { "editor.filename": data.filename, "http.status_code": result.status },
            });
            throw new Error(error);
          }
          writeCounter.add(1, { outcome: "ok" });
          logger.emit({
            severityText: "INFO",
            body: `editor wrote ${result.body.path}`,
            attributes: { "editor.path": result.body.path ?? "" },
          });
          return result.body;
        } finally {
          span.end();
        }
      },
    ),
  );
