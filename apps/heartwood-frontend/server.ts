// Production SSR entry for the heartwood review surface (0020 Phase 4, Decision I).
// Thin caller over @astra/site-kit's createSsrServer: the Bun.serve + OTel +
// signal-flush spine lives in the lib; heartwood supplies only what's app-specific —
// its built SSR handler, the client-assets dir, and serviceName/port from config.kdl.
// No staticMounts: heartwood reads proposals/corpus at request time via server fns
// over narrow bind-mounts (Compose), not from an asset volume mounted here.
//
// Run after `bun run build`:  bun run server.ts

import { fileURLToPath } from "node:url";
import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";
import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port } = loadConfig().heartwood;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
});
