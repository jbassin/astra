/**
 * Vellum render service (0013, D2) — a warm Node + Playwright sidecar that turns a
 * posted document into a PNG of its [data-vellum-export] card. Serves the built
 * render assets from dist/ on the same origin so the render page + fonts load
 * locally (and the SEC-3 egress block can allow only same-origin). A SEPARATE
 * Compose unit from vellum-frontend; the editor reaches it same-origin via Caddy
 * (vellum.iridi.cc/render → this service). The service definition is `app.ts`.
 *
 * Telemetry (traces, metrics, logs, HTTP spans, the SIGTERM flush) is installed by
 * `node --import @astra/observe/register` before this module loads.
 *
 *   pnpm run start   # after `pnpm run build`
 */
import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";
import { logger } from "@astra/observe";
import { createService } from "@astra/service-kit";

import { createRenderApp } from "./app";
import { RenderService } from "./renderService";

const cfg = loadConfig();
const { serviceName, port: PORT } = cfg.vellumRender;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DIST = fileURLToPath(new URL("../dist", import.meta.url));

const log = logger(serviceName);

const renderer = new RenderService(BASE_URL);
log.info("warming Chromium…");
await renderer.start();

const { definition } = createRenderApp({
  serviceName,
  publicOrigin: cfg.vellumFrontend.publicOrigin,
  distDir: DIST,
  renderer,
});

const service = createService({
  ...definition,
  port: PORT,
  // No srvx `idleTimeout` equivalent (R3, 0022 S8 — B3); the closest analog for
  // the Node runtime is `node.keepAliveTimeout` (mirrors ssrServer.ts / weal-overlay).
  node: { keepAliveTimeout: 30_000 },
});
// On SIGTERM the kit stops accepting and drains in-flight renders; then Chromium closes
// and observe flushes telemetry.
service.onShutdown(() => renderer.close());
