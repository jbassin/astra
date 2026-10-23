import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The overlay is a single-route SPA. `vite build` emits dist/, which the Bun server
// (server.ts) serves to OBS as a Browser Source. @tailwindcss/vite compiles gothic's
// theme.css (`@import "tailwindcss"` + `@theme` tokens → :root vars); without it the
// gothic stylesheet ships raw and every var(--color-*) is undefined.
//
// vite.config is ESM and cannot import @astra/config (the frontend gotcha), so the dev
// proxy target falls back to an env var — dev tooling only.
const feedTarget = process.env.WEAL_OVERLAY_SERVER_PORT
  ? `http://localhost:${process.env.WEAL_OVERLAY_SERVER_PORT}`
  : "http://localhost:10360";

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
