import { resolve } from "node:path";

import { loadConfig } from "@astra/config";
import { initTelemetry } from "@astra/observe";

import { loadQuizzes } from "./src/quizzes";
import { startServer } from "./src/server";

// Telemetry first (server-side traces/metrics/logs → SigNoz) — CLAUDE.md's
// standing principle, mirroring weal-overlay/orator-backend's entry shape.
const telemetry = initTelemetry("astra.menhir");

// Entry: serve the built SPA + the game API + the SSE feed. Config (port, public
// origin, results path) comes from config.kdl via @astra/config — no ad-hoc env reads.
const cfg = loadConfig();
const port = cfg.menhir.port;
const publicOrigin = cfg.menhir.publicOrigin;
const resultsPath = cfg.menhir.resultsPath;

// `import.meta.dirname` (Node 20.11+/24) — the weal-overlay idiom; never cwd, so
// the quizzes dir + dist resolve correctly regardless of the process's launch dir.
const distDir = resolve(import.meta.dirname, "dist");
const quizzesDir = resolve(import.meta.dirname, "quizzes");

const { quizzes, summary } = loadQuizzes(quizzesDir);
console.log(summary);

const { server } = startServer({
  port,
  distDir,
  runtimeOptions: { quizzes, publicOrigin, resultsPath },
});
// srvx's Server has no `.port` (R3, 0022 S8 — B3); `.url` is only populated once
// listening completes (async on the Node runtime), so log from `.ready()`.
void server.ready().then((s) => {
  console.log(`menhir listening on ${s.url}`);
});

// Flush buffered spans/metrics/logs before the container stops (compose SIGTERM).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    void telemetry.shutdown().finally(() => {
      void server.close(true);
      process.exit(0);
    });
  });
}
