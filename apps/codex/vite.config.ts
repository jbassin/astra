import path from "node:path";

import { loadSiteConfig } from "@astra/site-kit";
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
// either).
//
// P4.5 S1 (D29-46): gothicFontsPlugin + @tailwindcss/vite are GONE along with the
// gothic dependency itself — both existed solely to serve gothic's theme (the
// plugin copied gothic's /fonts/* binaries; tailwind compiled theme.css's `@theme`
// + `@apply`). codex now self-hosts its parchment-system fonts via @fontsource
// per-weight CSS imports in `__root.tsx` (vite bundles the woff2 files like any
// other imported asset) and styles itself with plain CSS (`src/styles/tokens.css`
// + `globals.css`), no Tailwind.
export default defineConfig({
  server: { port, host: true },
  resolve: {
    alias: { "@": path.resolve(ROOT, "./src") },
  },
  plugins: [tanstackStart(), viteReact()],
});
