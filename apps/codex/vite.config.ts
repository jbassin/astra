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
const { port } = loadSiteConfig(ROOT).codex;

// SSR — no `prerender` block (Decision I): codex runs as a TanStack Start server, a
// Compose service behind Caddy, not prerendered to static `dist/`.
//
// D29-31 divergence from ledger/strider: NO `contentWatchPlugin` here. Every other
// frontend bakes its "content" into `src/generated/*.ts` at build time; codex's
// content is the ~625 MB corpus (D29-23) — routes read it from disk at REQUEST time
// via `src/server/corpusFs.ts`/`corpusFns.ts` (the heartwood-frontend precedent: its
// review surface is the other codex-shaped app with no build-time content step
// either). @tailwindcss/vite compiles gothic's theme.css (`@theme` tokens +
// `@apply`); without it the gothic stylesheet ships raw and every var(--color-*) is
// undefined.
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
