/**
 * Response pins for the vellum-render HTTP app: a fixed request sequence against a fake
 * renderer, each recorded as its status, the headers clients read and the body. The
 * snapshot was written before the service-kit migration; the migration must leave it
 * unchanged.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { createRenderApp, type Renderer } from "./app";
import type { RenderRequest } from "./caps";
import { RenderCapError } from "./renderService";

test("vellum-render HTTP responses match the pre-migration pins", async () => {
  const dist = mkdtempSync(join(tmpdir(), "vellum-render-pins-"));
  writeFileSync(join(dist, "render.html"), "<!doctype html><title>render</title>");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "entry.js"), "window.vellumRender = () => {};");
  const calls: RenderRequest[] = [];
  const renderer: Renderer = {
    queued: 0,
    isReady: () => true,
    render(req) {
      calls.push(req);
      if (req.source === "cap") return Promise.reject(new RenderCapError("too big", 422));
      if (req.source === "boom") return Promise.reject(new Error("chromium died"));
      return Promise.resolve(Buffer.from("PNG-BYTES"));
    },
  };
  const app = createRenderApp({
    serviceName: "astra.vellum-render",
    publicOrigin: "https://vellum.test",
    distDir: dist,
    renderer,
  });

  async function pin(
    label: string,
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<Response> {
    const res = await app.fetch(
      new Request(`http://render.test${path}`, { method, headers, body }),
    );
    const clone = res.clone();
    const record: Record<string, unknown> = {
      status: res.status,
      contentType: res.headers.get("content-type"),
      allowOrigin: res.headers.get("access-control-allow-origin"),
      allowMethods: res.headers.get("access-control-allow-methods"),
      vary: res.headers.get("vary"),
      body: await res.text(),
      rendered: calls.splice(0),
    };
    expect(record).toMatchSnapshot(label);
    return clone;
  }

  const editor = { origin: "https://vellum.test" };
  const json = { "content-type": "application/json" };
  const doc = (source: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ source, ...extra });

  await pin("preflight from the editor", "OPTIONS", "/render", editor);
  await pin("preflight from localhost", "OPTIONS", "/render", { origin: "http://localhost:3000" });
  await pin("preflight from elsewhere", "OPTIONS", "/render", { origin: "https://evil.test" });
  await pin("preflight anywhere", "OPTIONS", "/anything", editor);
  await pin("health", "GET", "/health");
  await pin("health from the editor", "GET", "/health", editor);
  await pin("health POST", "POST", "/health");
  await pin("render", "POST", "/render", { ...json, ...editor }, doc("# Hi"));
  await pin(
    "render diegetic scale 3",
    "POST",
    "/render",
    json,
    doc("x", { mode: "diegetic", scale: 3 }),
  );
  await pin("render bad json", "POST", "/render", json, "{");
  await pin("render array", "POST", "/render", json, "[]");
  await pin("render no source", "POST", "/render", json, "{}");
  await pin("render bad mode", "POST", "/render", json, doc("x", { mode: "loud" }));
  await pin("render bad scale", "POST", "/render", json, doc("x", { scale: "2" }));
  await pin("render scale too big", "POST", "/render", json, doc("x", { scale: 5 }));
  await pin("render source too big", "POST", "/render", json, doc("x".repeat(64 * 1024 + 1)));
  await pin("render capped", "POST", "/render", { ...json, ...editor }, doc("cap"));
  await pin("render fails", "POST", "/render", { ...json, ...editor }, doc("boom"));
  await pin("render GET", "GET", "/render");
  await pin("render page", "GET", "/render.html");
  await pin("asset", "GET", "/assets/entry.js");
  await pin("root", "GET", "/");
  await pin("missing", "GET", "/nope.js");
  await pin("traversal", "GET", "/..%2f..%2fetc%2fpasswd");
  // The rate limit: 60 renders a minute per peer, then 429. 11 went through above.
  for (let i = 0; i < 49; i++) {
    await app.fetch(new Request("http://render.test/render", { method: "POST", body: "{" }));
  }
  await pin("render rate limited", "POST", "/render", { ...json, ...editor }, doc("# Hi"));
});
