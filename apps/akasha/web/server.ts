// Production SSR entry for the akasha-frontend Compose service (Decision I). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + OTel + signal-flush
// spine lives in the lib; akasha-frontend supplies only what's app-specific — its
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
const { serviceName, port, audioDir } = loadConfig().akashaFrontend;

createSsrServer({
  serviceName,
  port,
  ssr,
  clientDir: `${HERE}dist/client`,
  // The session-audio volume (~31 GB) — the combined Craig recording each transcript
  // page plays, served same-origin at /audio/<date>.mp3. A runtime mount; the audio
  // never enters the image (Decision I). Replaces faerrin's static-audio.iridi.cc.
  staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }],
});
