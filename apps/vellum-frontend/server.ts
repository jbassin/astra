// Production SSR entry for the vellum-frontend Compose service (Decision I). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush
// spine lives in the lib; vellum-frontend supplies only what's app-specific — its
// built SSR handler, the client-assets dir, and serviceName/port from config.kdl.
//
// No staticMounts: vellum has no runtime asset volume (the editor is client-only; the
// PNG export goes to the separate vellum-render service same-origin via Caddy, D2).
//
// Runs on Node 24 (R3, 0022 S7 — the runtime-exit recipe). `--import
// .../nodeTsResolve.mjs` is a resolve hook that lets Node walk the workspace's
// extensionless relative imports the same way Vite/Bun already do — see that file.
//
// Run after `bun run build`:  bun run start

import { fileURLToPath } from "node:url";
import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";
import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port } = loadConfig().vellumFrontend;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
});
