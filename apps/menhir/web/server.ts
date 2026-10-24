import { resolve } from "node:path";

import { loadConfig } from "@astra/config";
import { logger } from "@astra/observe";

import { loadQuizzes } from "./src/quizzes";
import { startServer } from "./src/server";

// Entry: serve the built SPA + the game API + the SSE feed through @astra/service-kit
// (/healthz, route-named spans, the ordered shutdown). Telemetry (traces, metrics, logs,
// HTTP spans, the SIGTERM flush) is already installed by
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

// The kit logs "listening" once bound, and on SIGTERM drains the server, then stops the
// rooms runtime, before observe flushes.
startServer({ port, distDir, runtimeOptions: { quizzes, publicOrigin, resultsPath } });
