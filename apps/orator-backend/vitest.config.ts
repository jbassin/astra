import { defineConfig } from "vitest/config";

// Standalone vitest config, deliberately NOT vite.config.ts: that file sets
// `root: src/web` for the operator SPA build (M3), which vitest would otherwise
// inherit by default — silently narrowing test discovery to src/web/ only (1 of
// 18 test files). This file's own directory (the app root) is vitest's root.
//
// src/migrate/migrate.ts (one-shot, already-run, unwired `bun:sqlite` migration
// script) was DELETED outright at R3 slice S8 (0022) — the DEFERRED exclusion
// that used to live here for its test is gone with it.
export default defineConfig({
  test: {
    environment: "node",
  },
});
