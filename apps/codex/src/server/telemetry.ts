// P3 S4 (D29-38) — the ONE search RUM event: `codex.search`, `{surface}`.
//
// **Why this is a SERVER counter, not a browser one (a deliberate deviation
// from a literal "client RUM metric" reading of D29-38 — flagged in the
// session report):** every `lazyCounter` call site in the repo today
// (weal-bot, weal-overlay, strider's `writeLayerFn.ts`, vellum-render,
// orator-backend, heartwood-frontend, portal) is SERVER-side, because
// there's no browser `MeterProvider` anywhere in astra — `@astra/observe/web`
// (`initRum`) wires only a `WebTracerProvider` (traces); metrics were never
// stood up client-side. Building one here would mean either new
// `@opentelemetry/sdk-metrics`/`exporter-metrics-otlp-http` dependencies in
// codex's OWN `package.json` (this slice's "no new dependencies" rule) or
// editing `libs/ts/observe`'s `web.ts` (outside this slice's allowed-files
// scope, `apps/codex/**` only) — and it would race the async `getRumConfig`
// server-fn round-trip `rum.ts` already does for traces (a search fired
// before that resolves would permanently bind to a no-op meter, the exact
// module-scope-instrument gotcha `lazyCounter` exists to avoid).
//
// Instead: the browser posts a tiny fire-and-forget serverFn call
// (`telemetryFns.ts`), which increments the counter on the ALREADY-
// initialized server meter — `createSsrServer` (`libs/ts/site-kit/ssrServer.ts`)
// calls `initTelemetry("astra.codex")` at process start, so by the time any
// request reaches this handler the real `MeterProvider` is installed; no
// race. This module is the pure, directly-testable core (same "createServerFn
// wrapper is a thin caller, the real logic lives in a plain sibling module"
// split `corpusFns.ts`/`entityPageData.ts` already established).

import { getTracer, lazyCounter } from "@astra/observe";

const SERVICE_NAME = "astra.codex";

const searchCounter = lazyCounter(SERVICE_NAME, "codex.search", {
  description: "Executed searches (debounced, not keystrokes), by surface",
});

export type SearchSurface = "omnibar" | "page";

/** Records one executed search. A tiny span too (free — every other
 * `lazyCounter` call site in the repo pairs one, and it gives the SigNoz
 * gate a trace to cross-check the metric against). */
export function recordSearchEvent(surface: SearchSurface): void {
  const span = getTracer(SERVICE_NAME).startSpan("codex.search");
  span.setAttribute("codex.search.surface", surface);
  searchCounter.add(1, { surface });
  span.end();
}
