import { resolve } from "node:path";
import { loadConfig } from "@astra/config";
import { initTelemetry } from "@astra/observe";
import { startServer } from "./src/server";

// Telemetry first (server-side traces/metrics/logs → SigNoz).
const telemetry = initTelemetry("astra.weal-overlay");

// Entry: serve the built overlay + the v1 ingest + the SSE feed. Config (port, the
// shared ingest token, the browser RUM endpoint) comes from config.kdl via @astra/config.
const cfg = loadConfig();
const port = cfg.wealOverlay.port;
const token = (() => {
  try {
    return cfg.wealOverlay.token?.resolve() || null;
  } catch {
    return null;
  }
})();
const rumEndpoint = cfg.telemetry.rumEndpoint;
const distDir = resolve(import.meta.dir, "dist");

if (!token) {
  console.warn(
    "⚠️  weal-overlay token is unset — POST /api/v1/roll is UNAUTHENTICATED. " +
      "Set the SOPS weal_token before exposing the ingest endpoint.",
  );
}

const { server } = startServer({ port, token, distDir, rumEndpoint });
console.log(`weal-overlay listening on http://localhost:${server.port}`);

// Flush buffered spans/metrics/logs before the container stops (compose SIGTERM).
// Installing our own handler overrides Bun's default terminate, so we exit once flushed.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    void telemetry.shutdown().finally(() => {
      server.stop(true);
      process.exit(0);
    });
  });
}
