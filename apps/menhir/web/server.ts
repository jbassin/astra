import { resolve } from "node:path";

import { loadConfig } from "@astra/config";
import { logger, onShutdown } from "@astra/observe";

import { loadQuizzes } from "./src/quizzes";
import { startServer } from "./src/server";

// Entry: serve the built SPA + the game API + the SSE feed. Telemetry (traces, metrics,
// logs, HTTP spans, the SIGTERM flush) is already installed by
// `node --import @astra/observe/register`. Config (service name, port, public origin,
// results path) comes from config.kdl via @astra/config — no ad-hoc env reads.
const cfg = loadConfig();
const log = logger(cfg.menhir.serviceName);

const port = cfg.menhir.port;
const publicOrigin = cfg.menhir.publicOrigin;
const resultsPath = cfg.menhir.resultsPath;

// `import.meta.dirname` (Node 20.11+/24) — the weal-overlay idiom; never cwd, so
// the quizzes dir + dist resolve correctly regardless of the process's launch dir.
const distDir = resolve(import.meta.dirname, "dist");
const quizzesDir = resolve(import.meta.dirname, "quizzes");

const { quizzes, summary } = loadQuizzes(quizzesDir);
log.info(summary);

const { server } = startServer({
  port,
  distDir,
  runtimeOptions: { quizzes, publicOrigin, resultsPath },
});
// srvx's Server has no `.port` (R3, 0022 S8 — B3); `.url` is only populated once
// listening completes (async on the Node runtime), so log from `.ready()`.
void server.ready().then((s) => log.info(`menhir listening on ${s.url}`));
onShutdown(() => server.close(true));
