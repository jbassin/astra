import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config (S2 addition — S1 shipped with no config file at
// all, vitest fell back to vite.config.ts's plugins + the plain "node"
// default). Stays "node" as the default here too — S1's engine/server/quiz
// tests are plain Node (real fs, real HTTP) and must keep passing unchanged —
// only the new S2 component tests need a DOM, and they opt in per-file via a
// `// @vitest-environment jsdom` docblock (the codex precedent, `apps/codex
// /vitest.config.ts`: "only the files that actually need a DOM pay for one").
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
