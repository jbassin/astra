import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config: separate from vite.config so the TanStack Start server
// plugin doesn't load under the test runner. ESM — `import.meta.dirname`, not
// `__dirname` (the workspace is `"type": "module"`).
//
// P2 S2: gains the `@` alias for the new routes/server/observe layer (S1's render
// layer stayed on relative imports and still does — untouched). Still a plain
// "node" environment (renderToStaticMarkup + router.buildLocation()/pure server-fn
// handlers need no DOM); S3 can widen to jsdom if an island test needs it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
