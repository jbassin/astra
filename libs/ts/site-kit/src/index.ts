// oxlint-disable-next-line typescript/triple-slash-reference -- ssrBuild.d.ts holds a wildcard module declaration, which only a non-module .d.ts can hold and no import can load
/// <reference path="./ssrBuild.d.ts" />
/**
 * @astra/site-kit — the reusable SSR-frontend spine (the strider template, lifted
 * for the later frontends). Server + build-time pieces live on the root export; the
 * browser-only RUM glue is on the `./web` subpath (so importing the SSR/vite
 * helpers never pulls the OTel web SDK into the client bundle). package.json
 * `exports` lists the other subpaths (`./vite`, `./document`, `./theme`, ...).
 *
 *   // server.ts (Node runtime; tsdown bundles it into dist-server/main.mjs)
 *   import { createSsrServer, loadSsrBuild } from "@astra/site-kit";
 *   // vite.config.ts (build-time; the preset adds contentWatchPlugin + gothicFontsPlugin)
 *   import { defineSiteConfig } from "@astra/site-kit/vite";
 *   // __root.tsx (SiteDocument dynamic-imports `./web` and calls startRum in the browser)
 *   import { SiteDocument, siteHead } from "@astra/site-kit/document";
 */
export { loadSiteConfig, siteConfigFile } from "./config";
export { generateRouteTree, staleRouteTreeFiles, type RouteTreeOptions } from "./routeTree";
// `serveFile` is the `send`-backed Range/206 bridge `createSsrServer` uses
// internally; exported too so the repo's other hand-rolled Node servers
// (weal-overlay, orator-backend) reuse the same tested bridge
// instead of re-implementing Node static serving.
export { type ServeFileOptions, serveFile } from "./sendFile";
export { ssrExternalsPlugin, undeclaredSsrImports } from "./ssrExternals";
export {
  createSsrServer,
  isHashedAssetPath,
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
