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
// Dev port from config.kdl via site-kit's node-safe locator (same source as
// server.ts's runtime read — config-single-source).
const { port } = loadSiteConfig(ROOT).heartwood;

// SSR — no `prerender` block (Decision I): heartwood runs as a TanStack Start server,
// a Compose service behind Caddy. No contentWatchPlugin / build-content: unlike the
// other frontends, heartwood reads its content (the staged proposals + the akasha
// corpus) at RUNTIME via server fns over bind-mounts — nothing is baked at build time.
// @tailwindcss/vite compiles gothic's theme.css (`@theme` tokens + `@apply`); without
// it the gothic stylesheet ships raw and every var(--color-*) is undefined.
export default defineConfig({
  server: { port, host: true },
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
