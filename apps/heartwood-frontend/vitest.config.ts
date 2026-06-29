import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config: jsdom + the `@` alias, separate from vite.config so the
// TanStack Start server plugin doesn't load under the test runner. ESM —
// `import.meta.dirname`, not `__dirname` (the bun lane is `"type": "module"`). No
// globalSetup: heartwood has no build-time generated modules (content is runtime).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
