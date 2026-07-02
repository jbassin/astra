import path from "node:path";

import { gothicFontsPlugin, loadSiteConfig } from "@astra/site-kit";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// NB: importing @astra/site-kit (a workspace TS package) from this config REQUIRES
// vite's `--configLoader runner` (set in package.json dev/build) — vite's default
// loader Node-externalizes workspace packages and the vite bin runs under Node,
// which can't execute their raw `.ts`. (The "vite.config can't import @astra/config"
// gotcha — see strider/README + the migration guide.)
const ROOT = import.meta.dirname;
// Dev port + render-service port from config.kdl via site-kit's node-safe locator
// (same source as server.ts's runtime read — config-single-source).
const siteConfig = loadSiteConfig(ROOT);
const { port } = siteConfig.vellumFrontend;
const renderTarget = `http://localhost:${siteConfig.vellumRender.port}`;

// SSR — no `prerender` block (Decision I): vellum-frontend runs as a TanStack Start
// server, a Compose service behind Caddy, not prerendered to static `dist/`. Unlike
// the read-surfaces (akasha/mouthpiece) there is NO contentWatchPlugin — vellum's
// "content" is authored live in CodeMirror, not a committed markdown corpus.
// @tailwindcss/vite compiles gothic's theme.css (`@theme` tokens + `@apply`); without
// it the gothic stylesheet ships raw and every var(--color-*) is undefined.
export default defineConfig({
  // Dev only: proxy the editor's same-origin PNG export (`POST /render`) + /health to
  // the vellum-render service (D2). The editor's exportClient posts to `/render` with
  // an empty base (same-origin); in prod Caddy routes /render+/health → vellum-render,
  // so this proxy gives dev the same same-origin contract without an env var.
  server: {
    port,
    host: true,
    proxy: {
      "/render": { target: renderTarget, changeOrigin: true },
      "/health": { target: renderTarget, changeOrigin: true },
    },
  },
  resolve: {
    alias: { "@": path.resolve(ROOT, "./src") },
  },
  plugins: [
    gothicFontsPlugin({ clientOutDir: path.join(ROOT, "dist", "client") }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
