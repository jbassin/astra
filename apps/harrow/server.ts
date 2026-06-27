// Production SSR entry for the harrow Compose service (Decision I). Thin caller over
// @astra/site-kit's createSsrServer: the Bun.serve + OTel + signal-flush spine lives
// in the lib; harrow supplies only what's app-specific — its built SSR handler, the
// client-assets dir, and serviceName/port from config.kdl. No staticMounts: harrow
// has no audio/asset volume (every card glyph is inline SVG).
//
// Run after `bun run build`:  bun run server.ts

import { fileURLToPath } from "node:url";
import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";
import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port } = loadConfig().harrow;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
});
