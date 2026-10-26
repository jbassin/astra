/**
 * Response pins for the weal-overlay HTTP app: a fixed request sequence, each recorded as
 * its status, the headers clients read and the body. Every ingest credential case is here.
 * The snapshot was written before the service-kit migration; the migration must leave it
 * unchanged. The one later change: the retired `x-eerie-token` header now gets 401.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INGEST_PATH, type RollMessage } from "@astra/weal-wire";
import { expect, test } from "vitest";

import { RollHub } from "../src/hub";
import { createApp } from "../src/server";

const TOKEN = "pin-token";
const ROLL: RollMessage = {
  v: 1,
  user: "Kethra",
  expression: "d20",
  total: 20,
  is_crit: true,
  is_fumble: false,
  display: "20",
};

test("weal-overlay HTTP responses match the pre-migration pins", async () => {
  const dist = mkdtempSync(join(tmpdir(), "weal-overlay-pins-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><head></head><title>pins</title>");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "app.js"), "console.log('pinned')");
  const hub = new RollHub();
  const frames: string[] = [];
  hub.add((frame) => frames.push(frame));
  const app = createApp({ token: TOKEN, distDir: dist, rumEndpoint: "https://rum.test", hub });

  async function pin(
    label: string,
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<void> {
    const res = await app.handle(
      new Request(`https://weal-overlay.test${path}`, { method, headers, body }),
    );
    let text: string;
    if (res.headers.get("content-type") === "text/event-stream") {
      const reader = must(res.body).getReader();
      text = new TextDecoder().decode((await reader.read()).value);
      await reader.cancel();
    } else {
      text = await res.text();
    }
    expect({
      status: res.status,
      contentType: res.headers.get("content-type"),
      cacheControl: res.headers.get("cache-control"),
      body: text,
      broadcast: frames.splice(0).map((f) => f.replace(/"ts":"[^"]+"/, '"ts":"<ts>"')),
    }).toMatchSnapshot(label);
  }

  const json = { "content-type": "application/json" };
  const roll = JSON.stringify(ROLL);
  await pin("ingest no token", "POST", INGEST_PATH, json, roll);
  await pin("ingest empty token", "POST", INGEST_PATH, { ...json, "x-weal-token": "" }, roll);
  await pin("ingest wrong token", "POST", INGEST_PATH, { ...json, "x-weal-token": "nope" }, roll);
  await pin(
    "ingest token prefix",
    "POST",
    INGEST_PATH,
    { ...json, "x-weal-token": "pin-toke" },
    roll,
  );
  await pin(
    "ingest token plus suffix",
    "POST",
    INGEST_PATH,
    { ...json, "x-weal-token": `${TOKEN}x` },
    roll,
  );
  await pin(
    "ingest wrong new header, right old header",
    "POST",
    INGEST_PATH,
    { ...json, "x-weal-token": "nope", "x-eerie-token": TOKEN },
    roll,
  );
  await pin(
    "ingest token as bearer",
    "POST",
    INGEST_PATH,
    { ...json, authorization: `Bearer ${TOKEN}` },
    roll,
  );
  await pin("ingest wrong token, bad json", "POST", INGEST_PATH, { "x-weal-token": "x" }, "{");
  await pin("ingest right token", "POST", INGEST_PATH, { ...json, "x-weal-token": TOKEN }, roll);
  await pin("ingest old header", "POST", INGEST_PATH, { ...json, "x-eerie-token": TOKEN }, roll);
  await pin("ingest bad json", "POST", INGEST_PATH, { "x-weal-token": TOKEN }, "{");
  await pin("ingest bad payload", "POST", INGEST_PATH, { "x-weal-token": TOKEN }, "{}");
  await pin("ingest GET", "GET", INGEST_PATH);
  await pin("ingest PUT", "PUT", INGEST_PATH, { "x-weal-token": TOKEN }, roll);
  await pin("feed", "GET", "/feed");
  await pin("feed POST", "POST", "/feed");
  await pin("feed HEAD", "HEAD", "/feed");
  await pin("root", "GET", "/");
  await pin("root HEAD", "HEAD", "/");
  await pin("asset", "GET", "/assets/app.js");
  await pin("missing asset", "GET", "/assets/nope.js");
  await pin("directory", "GET", "/assets/");
  await pin("traversal", "GET", "/..%2f..%2fetc%2fpasswd");
  await pin("delete elsewhere", "DELETE", "/somewhere");
});

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
