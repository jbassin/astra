// Production SSR entry for the mouthpiece-frontend Compose service (Decision I). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + static + SSR-span
// spine lives in the lib; mouthpiece-frontend supplies only what's app-specific — its
// built SSR handler, the client-assets dir, and serviceName/port from config.kdl.
//
// `pnpm run build` bundles this file into `dist-server/main.mjs` (tsdown.config.ts), and
// the image runs that bundle. Run after `pnpm run build`:  pnpm run start

import path from "node:path";

import { findPackageRoot, loadConfig } from "@astra/config";
import { createSsrServer, loadSsrBuild } from "@astra/site-kit";

const APP = findPackageRoot(import.meta.dirname);
const { serviceName, port, audioDir } = loadConfig().mouthpieceFrontend;

createSsrServer({
  serviceName,
  port,
  ssr: await loadSsrBuild(APP),
  clientDir: path.join(APP, "dist", "client"),
  // The episode audio volume (D2) — served same-origin at /audio/<id>.mp3. The dir
  // is the runtime mount; the 173 MB never enters the image (Decision I).
  staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }],
});
