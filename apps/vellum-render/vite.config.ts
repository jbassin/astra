import { resolve } from "node:path";

import { gothicFontsPlugin } from "@astra/site-kit";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The render-entry page is a plain-Vite client bundle (NOT TanStack/SSR — this is
// the screenshot surface Playwright drives, served static by the Bun server). The
// single input is render.html → dist/render.html. @tailwindcss/vite compiles
// gothic's theme.css (`@import "tailwindcss"` + `@theme` tokens + the `@source "./"`
// that pulls DocumentView's utility classes); gothicFontsPlugin copies gothic's
// fonts into dist/fonts so they load same-origin (the SEC-3 egress block forbids
// network fonts — they MUST be local or glyphs render blank). Importing
// @astra/site-kit here REQUIRES vite's `--configLoader runner` (package.json).
const ROOT = import.meta.dirname;

export default defineConfig({
  build: {
    outDir: resolve(ROOT, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: resolve(ROOT, "render.html") },
  },
  plugins: [gothicFontsPlugin({ clientOutDir: resolve(ROOT, "dist") }), tailwindcss(), viteReact()],
});
