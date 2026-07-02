import { configDefaults, defineConfig } from "vitest/config";

// src/server.ts is a hand-rolled Bun.serve()+Bun.file() HTTP+SSE server. Vitest's
// worker pool has no `Bun` global (it runs Node, not Bun, even under `bun run
// vitest`), so test/server.test.ts — the live-server integration suite that calls
// startServer() — can't run here (ReferenceError: Bun is not defined). It rides
// with R3 slice S8 (Bun.serve/Bun.file → srvx + send), which converts
// src/server.ts off the Bun runtime API. DEFERRED, not deleted (0022 S3).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/server.test.ts"],
  },
});
