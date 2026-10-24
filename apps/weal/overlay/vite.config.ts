import { loadSiteConfig } from "@astra/site-kit";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The overlay is a single-route SPA. `vite build` emits dist/, which the Node server
// (server.ts) serves to OBS as a Browser Source. @tailwindcss/vite compiles gothic's
// theme.css (`@import "tailwindcss"` + `@theme` tokens → :root vars); without it the
// gothic stylesheet ships raw and every var(--color-*) is undefined.
//
// The dev proxy targets the overlay server (`dev:server`) on its config.kdl port, the same
// value server.ts binds (config-single-source). Importing @astra/site-kit here needs vite's
// `--configLoader runner` (set in package.json dev/build), as in strider's vite.config.
const { port } = loadSiteConfig(import.meta.dirname).wealOverlay;
const feedTarget = `http://localhost:${port}`;

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/feed": { target: feedTarget, changeOrigin: true },
      "/api": { target: feedTarget, changeOrigin: true },
    },
  },
});
