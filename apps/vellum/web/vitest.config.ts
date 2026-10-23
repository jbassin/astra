import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config: jsdom + the `@` alias, separate from vite.config so the
// TanStack Start server plugin doesn't load under the test runner. ESM —
// `import.meta.dirname`, not `__dirname` (the workspace is `"type": "module"`). No
// globalSetup (unlike the read-surfaces) — there's no generated content module to
// build before tests; vellum's editor state is all runtime/localStorage.
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
