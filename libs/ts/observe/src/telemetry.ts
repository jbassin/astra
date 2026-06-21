/**
 * Preload entrypoint — `bun --preload @astra/observe/preload your-server.ts`.
 *
 * Bun has no `--require`, so OTel for long-running TS services (orator, weal-bot,
 * weal-overlay, the vellum render service) is installed by preloading this module:
 * it reads `OTEL_SERVICE_NAME` (default `astra.unknown`) — process identity, the one
 * thing config.kdl can't supply since it's shared across services — and calls
 * {@link initTelemetry} (which takes the endpoint from config.kdl) before app code runs.
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
