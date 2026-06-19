/**
 * Preload entrypoint — `bun --preload @astra/observe/preload your-server.ts`.
 *
 * Bun has no `--require`, so OTel for long-running TS services (orator, weal-bot,
 * weal-overlay, the vellum render service) is installed by preloading this module:
 * it reads `OTEL_SERVICE_NAME` (default `astra.unknown`) + `OTEL_EXPORTER_OTLP_ENDPOINT`
 * and calls {@link initTelemetry} before the app's own code runs.
 */
import { initTelemetry } from "./index";

initTelemetry(process.env.OTEL_SERVICE_NAME ?? "astra.unknown");
