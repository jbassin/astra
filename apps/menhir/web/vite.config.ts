import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// menhir is a single-route (path-routed) SPA. `vite build` emits dist/, which the
// Node server (server.ts) serves alongside the API + SSE. Plain CSS (D31-6 — no
// tailwind, unlike weal-overlay/strider's gothic-consuming copies).
//
// vite.config is ESM and cannot import @astra/config (the frontend gotcha, see
// weal-overlay), so the dev proxy target falls back to an env var — dev tooling only.
const serverTarget = process.env.MENHIR_SERVER_PORT
  ? `http://localhost:${process.env.MENHIR_SERVER_PORT}`
  : "http://localhost:10375";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": { target: serverTarget, changeOrigin: true },
    },
  },
});
