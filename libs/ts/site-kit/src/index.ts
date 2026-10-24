// oxlint-disable-next-line typescript/triple-slash-reference -- ssrBuild.d.ts holds a wildcard module declaration, which only a non-module .d.ts can hold and no import can load
/// <reference path="./ssrBuild.d.ts" />
/**
 * @astra/site-kit — the reusable SSR-frontend spine (the strider template, lifted
 * for 0011-0013). Server + build-time pieces live on the root export; the
 * browser-only RUM glue is on the `./web` subpath (so importing the SSR/vite
 * helpers never pulls the OTel web SDK into the client bundle).
 *
 *   // server.ts (Bun runtime)
 *   import { createSsrServer } from "@astra/site-kit";
 *   // vite.config.ts (build-time)
 *   import { contentWatchPlugin, gothicFontsDevPlugin, loadSiteConfig } from "@astra/site-kit";
 *   // __root.tsx (browser, dynamic import)
 *   import { startRum } from "@astra/site-kit/web";
 */
export { loadSiteConfig, siteConfigFile } from "./config";
export { generateRouteTree, staleRouteTreeFiles, type RouteTreeOptions } from "./routeTree";
// `serveFile` is the `send`-backed Range/206 bridge `createSsrServer` uses
// internally; exported too so the repo's other hand-rolled Node servers
// (weal-overlay, orator-backend — R3, 0022 S8) reuse the same tested bridge
// instead of re-implementing the Bun.file → Node static-serving seam.
export { serveFile } from "./sendFile";
export { ssrExternalsPlugin, undeclaredSsrImports } from "./ssrExternals";
export {
  createSsrServer,
  loadSsrBuild,
  type SsrHandler,
  type SsrRoute,
  type SsrServerOptions,
  type StaticMount,
  staticMountPath,
} from "./ssrServer";
export {
  type ContentWatchOptions,
  contentWatchPlugin,
  type GothicFontsOptions,
  gothicFontsPlugin,
} from "./vitePlugins";
