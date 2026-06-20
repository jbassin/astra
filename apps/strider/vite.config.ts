import path from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SSR — no `prerender` block (Decision I): strider runs as a TanStack Start server,
// deployed as a Compose service behind Caddy, not prerendered to static `dist/`.
export default defineConfig({
  server: { port: 10360, host: true },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  plugins: [tanstackStart(), viteReact()],
});
