/** Static-file caching for vellum-render: hashed vite assets are immutable, the page is not. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { createRenderApp, type Renderer } from "./app";

test("hashed /assets/ files are cached as immutable; the document is not", async () => {
  const dist = mkdtempSync(join(tmpdir(), "vellum-render-static-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>index</title>");
  writeFileSync(join(dist, "render.html"), "<!doctype html><title>render</title>");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "entry-Bx3f9a1c.js"), "window.vellumRender = () => {};");
  const renderer: Renderer = {
    queued: 0,
    isReady: () => true,
    render: () => Promise.resolve(Buffer.from("PNG-BYTES")),
  };
  const app = createRenderApp({
    serviceName: "astra.vellum-render",
    publicOrigin: "https://vellum.test",
    distDir: dist,
    renderer,
  });
  const get = (path: string) => app.fetch(new Request(`http://render.test${path}`));

  const asset = await get("/assets/entry-Bx3f9a1c.js");
  expect(asset.status).toBe(200);
  expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  const page = await get("/render.html");
  expect(page.headers.get("cache-control")).toBe("public, max-age=0");
  const doc = await get("/");
  expect(doc.headers.get("cache-control") ?? "").not.toContain("immutable");
});
