import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

// SSR render smoke (the strider template pattern): a build + ssr.fetch('/') assertion
// in the existing `test` lane, no new CI infra. The smoke needs dist/server/server.js,
// so beforeAll builds once if it's absent (CI's test job starts without a build).
//
// IMPORTANT: use ASYNC execFile, not execFileSync. akasha's build is heavy (vite +
// 76 transcript chunks + ~115 MB), and a long *synchronous* child blocks the vitest
// worker thread so it can't answer the runner's heartbeat → "Timeout calling
// onTaskUpdate" (the failure mode on slower CI runners). Awaiting an async child keeps
// the worker's event loop responsive. We build the SSR server with vite only — the
// smoke renders '/' and never needs the Pagefind index, so skip `bun run build`'s
// build-search step (saves the ~115 MB indexing pass).
const execFileAsync = promisify(execFile);
const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_BUNDLE = path.join(APP_ROOT, "dist/server/server.js");
const RUNNER = path.join(APP_ROOT, "scripts/ssrSmoke.ts");

describe("SSR smoke", () => {
  beforeAll(async () => {
    if (!existsSync(SERVER_BUNDLE)) {
      await execFileAsync("bunx", ["vite", "build", "--configLoader", "runner"], { cwd: APP_ROOT });
    }
  }, 300_000);

  it("renders / (200 + title) and exposes ssr.fetch", async () => {
    const { stdout } = await execFileAsync("bun", [RUNNER], { cwd: APP_ROOT, encoding: "utf8" });
    expect(stdout).toContain("status=200");
    expect(stdout).toContain("marker=true");
  });
});
