import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// SSR render smoke. We chose a build + ssr.fetch('/') assertion over a full
// Playwright lane: it runs in the existing `test` lane with no new CI infra. Build
// prerequisite: the smoke needs dist/server/server.js, so beforeAll builds once if
// it's absent (CI's test job starts without a build).
const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_BUNDLE = path.join(APP_ROOT, "dist/server/server.js");
const RUNNER = path.join(APP_ROOT, "scripts/ssrSmoke.ts");
// 0022 S11 — off bun: `pnpm run build` for the workspace script, `node --import
// nodeTsResolve.mjs` for the raw-TS runner subprocess (same hook every server.ts
// entry uses).
const NODE_TS_RESOLVE_HOOK = path.join(APP_ROOT, "../../libs/ts/site-kit/src/nodeTsResolve.mjs");

describe("SSR smoke", () => {
  beforeAll(() => {
    if (!existsSync(SERVER_BUNDLE)) {
      execFileSync("pnpm", ["run", "build"], { cwd: APP_ROOT, stdio: "inherit" });
    }
  }, 180_000);

  it("SSRs the landing page (brand + every site + resolved origins)", () => {
    const out = execFileSync("node", ["--import", NODE_TS_RESOLVE_HOOK, RUNNER], {
      cwd: APP_ROOT,
      encoding: "utf8",
    });
    expect(out).toContain("status=200");
    expect(out).toContain("marker=true");
    expect(out).toContain("sites=true");
    expect(out).toContain("origins=true");
  });
});
