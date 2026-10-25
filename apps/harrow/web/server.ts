// Production SSR entry for the harrow Compose service. Thin caller over
// @astra/site-kit's createSsrServer: the srvx + static + SSR-span spine lives
// in the lib; harrow supplies only what's app-specific — its built SSR handler, the
// client-assets dir, and serviceName/port from config.kdl. No staticMounts: harrow
// has no audio/asset volume (every card glyph is inline SVG).
//
// `pnpm run build` bundles this file into `dist-server/main.mjs` (tsdown.config.ts), and
// the image runs that bundle. Run after `pnpm run build`:  pnpm run start

import path from "node:path";

import { findPackageRoot, loadConfig } from "@astra/config";
import { createSsrServer, loadSsrBuild } from "@astra/site-kit";

const APP = findPackageRoot(import.meta.dirname);
const { serviceName, port } = loadConfig().harrow;

createSsrServer({
  serviceName,
  port,
  ssr: await loadSsrBuild(APP),
  clientDir: path.join(APP, "dist", "client"),
});
