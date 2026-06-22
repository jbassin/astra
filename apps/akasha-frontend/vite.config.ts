import path from "node:path";
import { contentWatchPlugin, gothicFontsPlugin, loadSiteConfig } from "@astra/site-kit";
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
// Dev port from config.kdl via site-kit's node-safe locator (walks from a plain dir,
// avoiding @astra/config's Bun-only import.meta.dir). Same source as server.ts's
// runtime read (config-single-source).
const { port } = loadSiteConfig(ROOT).akashaFrontend;

// SSR — no `prerender` block (Decision I): akasha-frontend runs as a TanStack Start
// server, a Compose service behind Caddy, not prerendered to static `dist/`.
export default defineConfig({
  server: { port, host: true },
  resolve: {
    alias: { "@": path.resolve(ROOT, "./src") },
  },
  // contentWatchPlugin runs build-content (the snapshot/transcript pipeline →
  // src/generated/*.ts) at buildStart + re-runs on content edits in dev, so
  // fs/remark/gray-matter never reach the client bundle. @tailwindcss/vite compiles
  // gothic's theme.css (`@theme` tokens + `@apply`); without it the gothic
  // stylesheet ships raw and every var(--color-*) is undefined.
  plugins: [
    contentWatchPlugin({
      root: ROOT,
      script: path.join(ROOT, "scripts", "build-content.ts"),
      contentDir: path.join(ROOT, "content"),
      generatedDir: path.join(ROOT, "src", "generated"),
      invalidate: ["site.ts", "bodies.ts"],
    }),
    gothicFontsPlugin({ clientOutDir: path.join(ROOT, "dist", "client") }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
