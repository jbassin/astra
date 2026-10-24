import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pagefindRoute } from "./pagefindRoute";

const ID = "0123456789abcdef";

let releasesDir: string;
let route: ReturnType<typeof pagefindRoute>;
let served: string | null;

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const url = new URL(path, "http://codex.test");
  return Promise.resolve(route(new Request(url, { headers }), url));
}

beforeEach(() => {
  releasesDir = mkdtempSync(join(tmpdir(), "codex-pagefind-route-"));
  const search = join(releasesDir, ID, "search", "pagefind");
  mkdirSync(join(search, "fragment"), { recursive: true });
  writeFileSync(join(search, "pagefind.js"), "export const ok = 1;\n");
  writeFileSync(join(search, "fragment", "en_1.pf_fragment"), "frag");
  writeFileSync(join(releasesDir, ID, "release.json"), "{}");
  served = null;
  route = pagefindRoute(releasesDir, () => served);
});
afterEach(() => {
  rmSync(releasesDir, { recursive: true, force: true });
});

describe("pagefindRoute", () => {
  it("404s an unkeyed path while the server serves no release", async () => {
    symlinkSync(ID, join(releasesDir, "current"));
    expect((await get("/pagefind/pagefind.js")).status).toBe(404);
  });

  it("redirects an unkeyed path to the release the server serves, not current", async () => {
    symlinkSync("fedcba9876543210", join(releasesDir, "current"));
    served = ID;
    const res = await get("/pagefind/pagefind.js?v=1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/pagefind/r/${ID}/pagefind.js?v=1`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves a release-keyed file as immutable, from that release even after a switch", async () => {
    served = "fedcba9876543210";
    const res = await get(`/pagefind/r/${ID}/fragment/en_1.pf_fragment`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("frag");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("refuses bad ids, traversal and files outside the index", async () => {
    for (const path of [
      "/pagefind/r/current/pagefind.js",
      "/pagefind/r/0123/pagefind.js",
      `/pagefind/r/${ID}/`,
      `/pagefind/r/${ID}/../../release.json`,
      `/pagefind/r/${ID}/%2e%2e/%2e%2e/release.json`,
      `/pagefind/r/${ID}/missing.js`,
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
