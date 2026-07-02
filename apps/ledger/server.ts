// Production SSR entry for the ledger Compose service (Decision I). Thin caller over
// @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush spine lives
// in the lib; ledger supplies only what's app-specific — its built SSR handler, the
// client-assets dir, and serviceName/port from config.kdl. No staticMounts: ledger
// has no asset volume (it's a single static landing page).
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
const { serviceName, port } = loadConfig().ledger;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
});
