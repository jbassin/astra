import path from "node:path";

import { contentWatchPlugin, gothicFontsPlugin, loadSiteConfig } from "@astra/site-kit";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// NB: importing @astra/site-kit (a workspace TS package) from this config REQUIRES
// vite's `--configLoader runner` (set in package.json dev/build). vite's default
// loader bundles the config with esbuild + Node-externalizes workspace packages,
// and the vite bin runs under Node (`#!/usr/bin/env node`) which can't execute a
// package's raw `.ts` source — so the import fails. `runner` loads the config
// through vite's own TS pipeline, which resolves the workspace source. (This is the
// precise shape of the "vite.config can't import @astra/config" gotcha.)
const ROOT = import.meta.dirname;
// Dev port from config.kdl via site-kit's node-safe locator (it walks from a plain
// dir, avoiding @astra/config's Bun-only import.meta.dir). Same source as
// server.ts's runtime read (config-single-source).
const { port } = loadSiteConfig(ROOT).strider;

// SSR — no `prerender` block (Decision I): strider runs as a TanStack Start server,
// deployed as a Compose service behind Caddy, not prerendered to static `dist/`.
export default defineConfig({
  server: { port, host: true },
  resolve: {
    alias: { "@": path.resolve(ROOT, "./src") },
  },
  // contentWatchPlugin runs build-content (content/*.md → src/generated/*.ts) at
  // buildStart and re-runs it on content edits in dev — the template's build-time
  // content pipeline; fs/remark/gray-matter never reach the client bundle.
  // @tailwindcss/vite compiles gothic's theme.css (`@import "tailwindcss"` +
  // `@theme` tokens → :root vars, `@apply` → utilities). Without it the gothic
  // stylesheet ships raw and every var(--color-*) is undefined.
  plugins: [
    contentWatchPlugin({
      root: ROOT,
      script: path.join(ROOT, "scripts", "build-content.ts"),
      contentDir: path.join(ROOT, "content"),
      generatedDir: path.join(ROOT, "src", "generated"),
      invalidate: ["factions.ts", "layers.ts"],
    }),
    gothicFontsPlugin({ clientOutDir: path.join(ROOT, "dist", "client") }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
