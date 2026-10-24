import { resolve } from "node:path";

import { findPackageRoot, loadConfig } from "@astra/config";
import { exitAfterFlush, logger } from "@astra/observe";

import { startServer } from "./src/server";
import { requireIngestToken } from "./src/startup";

// Entry: serve the built overlay + the v1 ingest + the SSE feed. Telemetry (traces,
// metrics, logs, HTTP spans, the SIGTERM flush) is already installed by
// `node --import @astra/observe/register`. Config (port, the shared ingest token, the
// browser RUM endpoint) comes from config.kdl via @astra/config.
const cfg = loadConfig();
const log = logger(cfg.wealOverlay.serviceName);
const port = cfg.wealOverlay.port;
// Fail closed (0037 SEC-12): no token = refuse to start, never an open public ingest.
let token = "";
try {
  token = requireIngestToken(cfg.wealOverlay.token);
} catch (err) {
  // FATAL is mirrored to stdout; the flush gets it to SigNoz (and Class A paging).
  log.fatal(`weal-overlay failed to start: ${err instanceof Error ? err.message : err}`);
  await exitAfterFlush(1); // never returns
}
const rumEndpoint = cfg.telemetry.rumEndpoint;
// From the package root, not `import.meta.dirname`: the same code runs from the app dir
// and from the dist-server/ bundle.
const distDir = resolve(findPackageRoot(import.meta.dirname), "dist");

// The kit logs the listening URL and owns the SIGTERM order: stop accepting, drain,
// close the SSE feeds, stop the heartbeat, then observe flushes.
startServer({ port, token, distDir, rumEndpoint, handleShutdown: true });
