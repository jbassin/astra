/**
 * Tracing for the page-data server functions: one `akasha.page_data` span per call and a
 * counter by page kind and outcome. SSR calls arrive inside the `ssr.render` span; client
 * navigations arrive as their own server-function requests, also under `ssr.render`.
 */
import { getTracer, lazyCounter, lazyHistogram } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";

const SERVICE = "astra.akasha-frontend";
const tracer = getTracer(SERVICE);
const requests = lazyCounter(SERVICE, "akasha.page_data.requests", {
  description: "Page-data server-function calls, by page kind and outcome",
});
const duration = lazyHistogram(SERVICE, "akasha.page_data.duration", {
  description: "Page-data server-function time, by page kind",
  unit: "ms",
});

export type PageKind = "wiki" | "home" | "tag" | "tag-index" | "chronicle" | "show" | "episode";

/** Runs one page-data lookup under a span; `null` counts as `not_found`. */
export function tracePageData<T>(kind: PageKind, run: () => T | Promise<T>): Promise<T> {
  return tracer.startActiveSpan(
    "akasha.page_data",
    { attributes: { "akasha.page.kind": kind } },
    async (span) => {
      const start = performance.now();
      try {
        const result = await run();
        const outcome = result === null ? "not_found" : "found";
        span.setAttribute("akasha.page.outcome", outcome);
        requests.add(1, { kind, outcome });
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        requests.add(1, { kind, outcome: "error" });
        throw err;
      } finally {
        duration.record(performance.now() - start, { kind });
        span.end();
      }
    },
  );
}
