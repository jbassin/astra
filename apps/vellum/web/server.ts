// Production SSR entry for the vellum-frontend Compose service (Decision I). Thin
// caller over @astra/site-kit's createSsrServer: the srvx + static + SSR-span
// spine lives in the lib; vellum-frontend supplies only what's app-specific — its
// built SSR handler, the client-assets dir, and serviceName/port from config.kdl.
//
// No staticMounts: vellum has no runtime asset volume (the editor is client-only; the
// PNG export goes to the separate vellum-render service same-origin via Caddy, D2).
//
// `pnpm run build` bundles this file into `dist-server/main.mjs` (tsdown.config.ts), and
// the image runs that bundle. Run after `pnpm run build`:  pnpm run start

import path from "node:path";

import { findPackageRoot, loadConfig } from "@astra/config";
import { createSsrServer, loadSsrBuild } from "@astra/site-kit";

const APP = findPackageRoot(import.meta.dirname);
const { serviceName, port } = loadConfig().vellumFrontend;

createSsrServer({
  serviceName,
  port,
  ssr: await loadSsrBuild(APP),
  clientDir: path.join(APP, "dist", "client"),
});
