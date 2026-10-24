// Production SSR entry for the akasha-frontend Compose service, behind Caddy. Thin
// caller over @astra/site-kit's createSsrServer: the srvx + static + SSR-span
// spine lives in the lib; akasha-frontend supplies only what's app-specific — its
// built SSR handler, the client-assets dir, and serviceName/port from config.kdl.
//
// `pnpm run build` bundles this file into `dist-server/main.mjs` (tsdown.config.ts), and
// the image runs that bundle. Run after `pnpm run build`:  pnpm run start

import path from "node:path";

import { findPackageRoot, loadConfig } from "@astra/config";
import { createSsrServer, loadSsrBuild } from "@astra/site-kit";

const APP = findPackageRoot(import.meta.dirname);
const { serviceName, port, audioDir } = loadConfig().akashaFrontend;

createSsrServer({
  serviceName,
  port,
  ssr: await loadSsrBuild(APP),
  clientDir: path.join(APP, "dist", "client"),
  // The session-audio volume (~31 GB) — the combined Craig recording each transcript
  // page plays, served same-origin at /audio/<date>.mp3. A runtime mount, so the audio
  // never enters the image. Replaces faerrin's static-audio.iridi.cc.
  staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }],
});
