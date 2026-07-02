import { configDefaults, defineConfig } from "vitest/config";

// Standalone vitest config, deliberately NOT vite.config.ts: that file sets
// `root: src/web` for the operator SPA build (M3), which vitest would otherwise
// inherit by default — silently narrowing test discovery to src/web/ only (1 of
// 18 test files). This file's own directory (the app root) is vitest's root.
export default defineConfig({
  test: {
    environment: "node",
    // src/migrate/migrate.ts is a one-shot, already-run, unwired migration
    // script that imports `bun:sqlite` (no Node/vitest-worker equivalent). It
    // rides with R3 slice S8, which deletes the file outright. DEFERRED (0022
    // S3), not fixed here.
    exclude: [...configDefaults.exclude, "src/migrate/migrate.test.ts"],
  },
});
