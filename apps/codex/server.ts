// Production SSR entry for the codex Compose service (Decision I, P5 deploy — this
// slice only runs it via `pnpm run dev`/`pnpm run start` for the S2 gate). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush
// spine lives in the lib; codex supplies only what's app-specific — its built SSR
// handler, the client-assets dir, and serviceName/port from config.kdl. No
// staticMounts: the corpus is read at request time via server fns (D29-23), not
// served as static files.
//
// Runs on Node 24 (R3, 0022 S4 — the pilot). `--import .../nodeTsResolve.mjs` is a
// resolve hook that lets Node walk the workspace's extensionless relative imports
// (`from "./config"`) the same way Vite/Bun already do — see that file for why.
//
// Run after `pnpm run build`:  pnpm run start

import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";

import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port } = loadConfig().codex;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
});
