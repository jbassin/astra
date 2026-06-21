// Production SSR entry for the strider Compose service (Decision I). Thin caller
// over @astra/site-kit's createSsrServer: the Bun.serve + OTel + signal-flush spine
// lives in the lib; strider supplies only what's app-specific — its built SSR
// handler, the client-assets dir, and serviceName/port from config.kdl.
//
// Run after `bun run build`:  bun run server.ts

import { fileURLToPath } from "node:url";
import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";
import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port } = loadConfig().strider;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
});
