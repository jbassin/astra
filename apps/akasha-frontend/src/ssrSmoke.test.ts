import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// SSR render smoke (the strider template pattern): a build + ssr.fetch('/') assertion
// in the existing `test` lane, no new CI infra. The smoke needs dist/server/server.js,
// so beforeAll builds once if it's absent (CI's test job starts without a build).
const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_BUNDLE = path.join(APP_ROOT, "dist/server/server.js");
const RUNNER = path.join(APP_ROOT, "scripts/ssrSmoke.ts");

describe("SSR smoke", () => {
  beforeAll(() => {
    if (!existsSync(SERVER_BUNDLE)) {
      execFileSync("bun", ["run", "build"], { cwd: APP_ROOT, stdio: "inherit" });
    }
  }, 180_000);

  it("renders / (200 + title) and exposes ssr.fetch", () => {
    const out = execFileSync("bun", [RUNNER], { cwd: APP_ROOT, encoding: "utf8" });
    expect(out).toContain("status=200");
    expect(out).toContain("marker=true");
  });
});
