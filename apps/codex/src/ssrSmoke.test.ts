import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * SSR render smoke + D29-29 tier 3 route tests, in ONE file sharing ONE
 * `beforeAll` build. (Deliberately not split across two test files: vitest runs
 * files in parallel by default, and two independent "build dist/ if absent"
 * `beforeAll`s racing the SAME `vite build` output directory produced a real,
 * observed corruption — a `dist/server/server.js` that 500'd on cases the exact
 * same build passes cleanly when built serially. One shared build for the
 * whole file sidesteps that class of bug entirely.)
 *
 * We chose a build + `ssr.fetch(...)` assertion over a full Playwright lane: it
 * runs in the existing `test` lane with no new CI infra. Build prerequisite:
 * needs `dist/server/server.js`, so `beforeAll` builds once if it's absent
 * (CI's test job starts without a build) — this ALSO always exercises the
 * fixture-fallback corpus root in CI (D29-23: zero `data/` by construction), the
 * same root every route test below runs against.
 */
const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_BUNDLE = path.join(APP_ROOT, "dist/server/server.js");
const RUNNER = path.join(APP_ROOT, "scripts/ssrSmoke.ts");
// 0022 S11 — off bun: `pnpm run build` for the workspace script, `node --import
// nodeTsResolve.mjs` for the raw-TS runner subprocess (same hook every server.ts
// entry uses).
const NODE_TS_RESOLVE_HOOK = path.join(APP_ROOT, "../../libs/ts/site-kit/src/nodeTsResolve.mjs");

let ssr: { fetch: (req: Request) => Promise<Response> };

beforeAll(async () => {
  if (!existsSync(SERVER_BUNDLE)) {
    execFileSync("pnpm", ["run", "build"], { cwd: APP_ROOT, stdio: "inherit" });
  }
  const mod = (await import(SERVER_BUNDLE)) as {
    default: { fetch: (req: Request) => Promise<Response> };
  };
  ssr = mod.default;
}, 180_000);

describe("SSR smoke", () => {
  it("SSRs an entity page (spell/heal, off the fixture-fallback corpus in CI)", () => {
    const out = execFileSync("node", ["--import", NODE_TS_RESOLVE_HOOK, RUNNER], {
      cwd: APP_ROOT,
      encoding: "utf8",
    });
    expect(out).toContain("status=200");
    expect(out).toContain("marker=true");
    expect(out).toContain("noindex=true");
    expect(out).toContain("noRenderError=true");
  });
});

async function get(pathAndQuery: string): Promise<{ status: number; html: string }> {
  const res = await ssr.fetch(new Request(`http://localhost${pathAndQuery}`));
  return { status: res.status, html: await res.text() };
}

/**
 * D29-29 tier 3 — route tests over the fixture corpus, run as real HTTP-shaped
 * requests against the same built SSR server the smoke above uses.
 * `resolveEntityPageData`'s own unit tests (`corpusFns.test.ts`) already cover
 * the loader's data-shaping in isolation; this proves the actual route wiring —
 * `notFound()`, the `$category/$slug` param decode, and the head/meta noindex
 * tag — end to end.
 */
describe("$category/$slug route (D29-22/-23/-25/-29 tier 3)", () => {
  it("renders a plain entity", async () => {
    const { status, html } = await get("/spell/heal");
    expect(status).toBe(200);
    expect(html).toContain("Heal");
    expect(html).not.toContain("data-render-error");
  });

  it("renders the @legacy pair member, `@` unencoded on the wire", async () => {
    const { status, html } = await get("/spell/heal@legacy");
    expect(status).toBe(200);
    expect(html).toContain("Heal");
    // the edition banner links to the remaster member(s) by id
    expect(html).toContain("spell/heal");
  });

  it("renders the same @legacy pair member via a percent-encoded request path", async () => {
    // Proves the decode direction independently of which literal bytes a client
    // happens to send — some HTTP clients percent-encode `@` even though it's a
    // legal raw pchar.
    const { status, html } = await get("/spell/heal%40legacy");
    expect(status).toBe(200);
    expect(html).toContain("Heal");
  });

  it("renders a real non-ASCII slug", async () => {
    const { status, html } = await get("/creature/ixam%C3%A8");
    expect(status).toBe(200);
    expect(html).toContain("Ixam");
  });

  it("resolves the D29-21 rescued index-slug entities", async () => {
    const ancestry = await get("/ancestry/index");
    expect(ancestry.status).toBe(200);
    const archetype = await get("/archetype/index");
    expect(archetype.status).toBe(200);
  });

  it("noindex meta is present on every entity page's SSR HTML", async () => {
    const { html } = await get("/spell/heal");
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="noindex"');
  });

  it("404s for an unknown category", async () => {
    const { status } = await get("/not-a-real-category/heal");
    expect(status).toBe(404);
  });

  it("404s for an unknown slug in a real category", async () => {
    const { status } = await get("/spell/not-a-real-spell");
    expect(status).toBe(404);
  });

  it("a literal `../`-style traversal attempt never reaches the loader as `..` at all", async () => {
    // `%2e%2e` in a path segment is normalized away by the URL parser itself
    // (RFC 3986 dot-segment removal) BEFORE the request ever reaches our router —
    // `/spell/%2e%2e` collapses to `/`, which harmlessly 200s the index
    // placeholder (proven here so a future refactor can't silently regress that
    // into a 500/leak). The literal `slug === ".."` guard branch itself — for a
    // caller that bypasses normal URL semantics — is exhaustively unit-tested in
    // `corpusFs.test.ts`/`corpusFns.test.ts` against the fixture corpus directly.
    const { status, html } = await get("/spell/%2e%2e");
    expect(status).toBe(200);
    expect(html).not.toContain("data-render-error");
  });

  it("404s (not 500) for a leading-underscore slug", async () => {
    const { status } = await get("/spell/_index");
    expect(status).toBe(404);
  });
});
