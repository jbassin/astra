// Production SSR entry for the ledger Compose service (Decision I). Thin caller over
// @astra/site-kit's createSsrServer: the Bun.serve + OTel + signal-flush spine lives
// in the lib; ledger supplies only what's app-specific — its built SSR handler, the
// client-assets dir, and serviceName/port from config.kdl. No staticMounts: ledger
// has no asset volume (it's a single static landing page).
//
// Run after `bun run build`:  bun run server.ts

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
