// Real-HTTP integration test for createSsrServer's srvx + send server.
// Runs a live server on an ephemeral port against temp-dir static mounts and a fake
// SSR handler, then drives it with plain `fetch()` — the same code path production
// traffic takes. THE load-bearing assertion is the Range/206 case: the audio mounts
// depend on `send` producing byte-exact partial responses through this server.
//
// Note: vitest's worker always runs Node (no `Bun` global — see
// apps/weal/overlay/vitest.config.ts), so this
// exercises the real Node srvx adapter, not a Bun stand-in.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createSsrServer, type SsrHandler } from "./ssrServer";

const CLIENT_ASSET = "html,body{margin:0}/* client asset */";
const AUDIO_CLIP = Buffer.from(Array.from({ length: 64 }, (_, i) => i)); // 0x00..0x3f
const SSR_MARKER = "astra-ssr-ok";
const SECRET = "top-secret-should-never-leak";

let server: Awaited<ReturnType<typeof createSsrServer>>;
let base: string;

beforeAll(async () => {
  // Both dirs sit under a dot-folder, like a checkout in `.claude/worktrees/`: `send`
  // refuses dot-segments, and must check only the path below each served root.
  const root = join(mkdtempSync(join(tmpdir(), "site-kit-")), ".worktree");
  const clientDir = join(root, "client");
  mkdirSync(clientDir, { recursive: true });
  writeFileSync(join(clientDir, "app.css"), CLIENT_ASSET);
  mkdirSync(join(clientDir, "assets"));
  writeFileSync(join(clientDir, "assets", "index-Bx3f9a1c.js"), "console.log(1)");

  const audioDir = join(root, "audio");
  mkdirSync(audioDir);
  writeFileSync(join(audioDir, "clip.bin"), AUDIO_CLIP);
  writeFileSync(join(audioDir, ".hidden.bin"), AUDIO_CLIP);
  // Sibling of audioDir, outside the mount — proves a traversal attempt can't reach it.
  writeFileSync(join(audioDir, "..", "secret.txt"), SECRET);

  const ssr: SsrHandler = {
    fetch(req) {
      const url = new URL(req.url);
      return new Response(`<html data-marker="${SSR_MARKER}">${url.pathname}</html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  };

  server = createSsrServer({
    serviceName: "site-kit-ssrServer-test",
    port: 0,
    ssr,
    clientDir,
    staticMounts: [{ urlPrefix: "/audio/", dir: audioDir }],
    routes: [
      {
        urlPrefix: "/audio/routed/",
        handle: (_req, url) =>
          url.pathname.endsWith("/missing")
            ? new Response("Not found", { status: 404 })
            : new Response(`route ${url.pathname} ${url.search}`, { status: 299 }),
      },
    ],
  });
  await server.ready();
  // srvx's `.url` includes a trailing slash (e.g. "http://0.0.0.0:1234/") — strip it
  // so `${base}/audio/...` doesn't produce a double-slash path.
  base = (server.url ?? "").replace(/\/$/, "");
  expect(base).not.toBe("");
});

afterAll(async () => {
  await server.close(true);
});

describe("SSR fallback (also the compose healthcheck's path: GET / must be 200)", () => {
  test("root falls through to the SSR handler", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(SSR_MARKER);
  });

  test("an unknown, non-mounted path also falls through to SSR (never a bare 404)", async () => {
    const res = await fetch(`${base}/some/app/route`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(SSR_MARKER);
  });
});

describe("built client assets (served ahead of SSR)", () => {
  test("200 + exact body for a real asset", async () => {
    const res = await fetch(`${base}/app.css`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CLIENT_ASSET);
  });

  test("a hashed file under /assets/ is cached for a year as immutable", async () => {
    const res = await fetch(`${base}/assets/index-Bx3f9a1c.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("an unhashed file outside /assets/ still revalidates", async () => {
    const res = await fetch(`${base}/app.css`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0");
  });

  test("the SSR'd document is never cached as immutable", async () => {
    const res = await fetch(`${base}/`);
    expect(res.headers.get("cache-control") ?? "").not.toContain("immutable");
  });
});

describe("static mount (send-backed: Range/206, conditional-GET, 404)", () => {
  test("200 streams the whole file", async () => {
    const res = await fetch(`${base}/audio/clip.bin`);
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(body)).toEqual(AUDIO_CLIP);
  });

  test("404 for a file that doesn't exist under the mount (never falls through to SSR)", async () => {
    const res = await fetch(`${base}/audio/does-not-exist.bin`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(SSR_MARKER);
  });

  test("a dotfile inside the mount is still refused", async () => {
    const res = await fetch(`${base}/audio/.hidden.bin`);
    expect(res.status).toBe(404);
  });

  test("path traversal never leaks a file outside the mount", async () => {
    const res = await fetch(`${base}/audio/../secret.txt`);
    expect(await res.text()).not.toContain(SECRET);
  });

  test("Range: bytes=10-19 returns 206 + the exact 10-byte slice + Content-Range", async () => {
    const res = await fetch(`${base}/audio/clip.bin`, { headers: { Range: "bytes=10-19" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 10-19/${AUDIO_CLIP.length}`);
    expect(res.headers.get("content-length")).toBe("10");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(body)).toEqual(AUDIO_CLIP.subarray(10, 20));
  });

  test("an unsatisfiable range (beyond EOF) returns 416", async () => {
    const res = await fetch(`${base}/audio/clip.bin`, {
      headers: { Range: `bytes=${AUDIO_CLIP.length + 100}-${AUDIO_CLIP.length + 200}` },
    });
    expect(res.status).toBe(416);
  });
});

describe("routes (prefix handlers ahead of static mounts and SSR)", () => {
  test("a route answers under its prefix, even where a static mount also matches", async () => {
    const res = await fetch(`${base}/audio/routed/clip.bin?x=1`);
    expect(res.status).toBe(299);
    expect(await res.text()).toBe("route /audio/routed/clip.bin ?x=1");
  });

  test("a route's own 404 never falls through to SSR", async () => {
    const res = await fetch(`${base}/audio/routed/missing`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(SSR_MARKER);
  });
});
