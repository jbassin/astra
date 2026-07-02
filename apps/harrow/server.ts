// Production SSR entry for the harrow Compose service (Decision I). Thin caller over
// @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush spine lives
// in the lib; harrow supplies only what's app-specific — its built SSR handler, the
// client-assets dir, and serviceName/port from config.kdl. No staticMounts: harrow
// has no audio/asset volume (every card glyph is inline SVG).
//
// Runs on Node 24 (R3, 0022 S7 — the runtime-exit recipe). `--import
// .../nodeTsResolve.mjs` is a resolve hook that lets Node walk the workspace's
// extensionless relative imports the same way Vite/Bun already do — see that file.
//
// Run after `pnpm run build`:  pnpm run start

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
