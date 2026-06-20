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

initTelemetry(process.env.OTEL_SERVICE_NAME ?? "astra.unknown");
