import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { gothicFontsPlugin } from "./scripts/gothicFontsPlugin";

// The operator UI is a @tanstack/react-router CLIENT SPA (M3 — not react-start/
// SSR). `vite build` emits `dist/`, which orator-backend's Bun server serves via
// `serveStatic`. @tailwindcss/vite compiles gothic's theme.css (`@import
// "tailwindcss"` + `@theme` tokens); without it the gothic stylesheet ships raw
// and every var(--color-*) is undefined (the strider styling gotcha). In dev,
// /api and /auth proxy to the local Bun server so same-origin cookies + the
// ingest EventSource stream work.
const DIST = resolve(import.meta.dirname, "dist");
const apiTarget = `http://localhost:${process.env.ORATOR_SERVER_PORT ?? "10363"}`;

export default defineConfig({
  root: resolve(import.meta.dirname, "src/web"),
  build: { outDir: DIST, emptyOutDir: true },
  plugins: [tailwindcss(), react(), gothicFontsPlugin(DIST)],
  server: {
    port: 3001,
    host: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/auth": { target: apiTarget, changeOrigin: true },
    },
  },
});
