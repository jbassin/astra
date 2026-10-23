import { defineConfig } from "vitest/config";

// Standalone vitest config, deliberately NOT vite.config.ts: that file imports
// @astra/site-kit, which REQUIRES vite's `--configLoader runner` (package.json
// comment) — vitest's own config loader doesn't apply that flag, so loading
// vite.config.ts here fails to resolve site-kit's subpath exports. Neither test
// file needs site-kit or the render-entry build config, so this app's root
// (this file's own directory) is vitest's root with zero-config discovery.
export default defineConfig({
  test: {
    environment: "node",
  },
});
