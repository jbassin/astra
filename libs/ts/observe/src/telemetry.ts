/**
 * Preload entrypoint — historically `bun --preload @astra/observe/preload
 * your-server.ts` (Bun had no `--require`). Superseded since the R3 Node runtime
 * exit (0022 S5+): every long-running TS service now calls {@link initTelemetry}
 * directly at the top of its own entry file instead (see e.g. weal-bot/src/index.ts)
 * — `node --import` would be the equivalent hook if this preload path is ever
 * revived. Kept as a re-export for `OTEL_SERVICE_NAME`-only callers; reads it
 * (default `astra.unknown`) — process identity, the one thing config.kdl can't
 * supply since it's shared across services — and calls {@link initTelemetry} (which
 * takes the endpoint from config.kdl) before app code runs.
 */
import { initTelemetry } from "./index";

const telemetry = initTelemetry(process.env.OTEL_SERVICE_NAME ?? "astra.unknown");

// Force-flush buffered spans/metrics/logs before the process exits, or the
// BatchSpanProcessor drops whatever it's holding when the container stops.
// (Adding a signal listener overrides Bun's default terminate, so we must exit
// ourselves once the flush settles.) `once` keeps it idempotent.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    void telemetry.shutdown().finally(() => process.exit(0));
  });
}
