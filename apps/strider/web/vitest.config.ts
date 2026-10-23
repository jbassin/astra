import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config (S4): jsdom + the `@` alias, separate from vite.config
// so the TanStack Start server plugin doesn't load under the test runner. ESM —
// `import.meta.dirname`, not `__dirname` (the workspace is `"type": "module"`).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    globalSetup: ["./vitest.global-setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
