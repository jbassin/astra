import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { contentWatchPlugin } from "./scripts/contentWatchPlugin";

// SSR — no `prerender` block (Decision I): strider runs as a TanStack Start server,
// deployed as a Compose service behind Caddy, not prerendered to static `dist/`.
export default defineConfig({
  server: { port: 10360, host: true },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  // contentWatchPlugin runs build-content (content/*.md → src/generated/*.ts) at
  // buildStart and re-runs it on content edits in dev — the template's build-time
  // content pipeline; fs/remark/gray-matter never reach the client bundle.
  // @tailwindcss/vite compiles gothic's theme.css (`@import "tailwindcss"` +
  // `@theme` tokens → :root vars, `@apply` → utilities). Without it the gothic
  // stylesheet ships raw and every var(--color-*) is undefined.
  plugins: [contentWatchPlugin(), tailwindcss(), tanstackStart(), viteReact()],
});
