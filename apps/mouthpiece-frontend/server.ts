// Production SSR entry for the mouthpiece-frontend Compose service (Decision I). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush
// spine lives in the lib; mouthpiece-frontend supplies only what's app-specific — its
// built SSR handler, the client-assets dir, and serviceName/port from config.kdl.
//
// Runs on Node 24 (R3, 0022 S6 — the audio-mounts Range/206 pilot). `--import
// .../nodeTsResolve.mjs` is a resolve hook that lets Node walk the workspace's
// extensionless relative imports the same way Vite/Bun already do — see that file.
//
// Run after `pnpm run build`:  pnpm run start

import { fileURLToPath } from "node:url";

import { loadConfig } from "@astra/config";
import { createSsrServer } from "@astra/site-kit";

import ssr from "./dist/server/server.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { serviceName, port, audioDir } = loadConfig().mouthpieceFrontend;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
  // The episode audio volume (D2) — served same-origin at /audio/<id>.mp3. The dir
  // is the runtime mount; the 173 MB never enters the image (Decision I).
  staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }],
});
