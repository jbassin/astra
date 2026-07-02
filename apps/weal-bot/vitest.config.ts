import { configDefaults, defineConfig } from "vitest/config";

// src/migrate/migrate.ts is a one-shot, already-run, unwired migration script
// that imports `bun:sqlite` (no Node/vitest-worker equivalent — vitest's worker
// pool has no `Bun` global even under `bun run vitest`). It rides with R3 slice
// S5, which deletes the file outright. DEFERRED (0022 S3), not fixed here.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "src/migrate/migrate.test.ts"],
  },
});
