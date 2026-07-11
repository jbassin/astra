/**
 * Spec 0023 S6 — the module-package routes (D11 install-by-Manifest-URL): the
 * rendered `module.json` carries absolute manifest/download URLs, `portal.zip`
 * round-trips (unzip with fflate and assert both entries, including the SAME
 * rendered manifest inside the zip — the installed copy must carry the manifest
 * URL or Foundry's update check breaks), and both routes 503 cleanly when the
 * module hasn't been built (no host crash).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MCP_HTTP_PATH } from "./constants";
import { createPortalServer, type PortalServerHandle, listen } from "./server";

const MCP_API_KEY = "test-mcp-key";
const PLAYER_MCP_API_KEY = "test-player-mcp-key";
const BRIDGE_API_KEY = "test-bridge-key";
const PUBLIC_ORIGIN = "https://portal.test";
const MODULE_JSON_SOURCE = {
  id: "portal",
  title: "Astra Portal Bridge",
  version: "0.0.0",
  compatibility: { minimum: "13", verified: "13" },
  esmodules: ["dist/main.js"],
  socket: true,
};

function writeBuiltModule(dir: string): void {
  writeFileSync(join(dir, "module.json"), JSON.stringify(MODULE_JSON_SOURCE));
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "main.js"), "export const hi = () => 'portal module';\n");
}

describe("module-package routes (spec 0023 S6)", () => {
  let moduleDir: string;
  // These tests don't exercise OAuth at all (that's oauth.test.ts) — a fresh
  // per-test tmp-dir state path is just what `createPortalServer` now requires to
  // construct (spec 0025 S1).
  let oauthDir: string;
  let handle: PortalServerHandle & { port: number };
  let baseUrl: string;

  beforeEach(() => {
    moduleDir = mkdtempSync(join(tmpdir(), "portal-module-"));
    oauthDir = mkdtempSync(join(tmpdir(), "portal-oauth-"));
  });

  afterEach(async () => {
    if (handle) await handle.close();
    rmSync(moduleDir, { recursive: true, force: true });
    rmSync(oauthDir, { recursive: true, force: true });
  });

  async function start(): Promise<void> {
    handle = await listen({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      playerMcpApiKey: PLAYER_MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: 10,
      publicOrigin: PUBLIC_ORIGIN,
      moduleDir,
      oauthStatePath: join(oauthDir, "state.json"),
    });
    baseUrl = `http://127.0.0.1:${handle.port}`;
  }

  it("renders module.json with absolute manifest/download URLs from publicOrigin", async () => {
    writeBuiltModule(moduleDir);
    await start();

    const res = await fetch(`${baseUrl}/module/module.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: "portal",
      manifest: `${PUBLIC_ORIGIN}/module/module.json`,
      download: `${PUBLIC_ORIGIN}/module/portal.zip`,
    });
  });

  it("packages module.json + dist/main.js into a zip that round-trips, carrying the SAME rendered manifest", async () => {
    writeBuiltModule(moduleDir);
    await start();

    const res = await fetch(`${baseUrl}/module/portal.zip`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const bytes = new Uint8Array(await res.arrayBuffer());

    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(["dist/main.js", "module.json"]);

    const zippedManifest = JSON.parse(strFromU8(entries["module.json"] as Uint8Array)) as Record<
      string,
      unknown
    >;
    expect(zippedManifest).toMatchObject({
      manifest: `${PUBLIC_ORIGIN}/module/module.json`,
      download: `${PUBLIC_ORIGIN}/module/portal.zip`,
    });
    expect(strFromU8(entries["dist/main.js"] as Uint8Array)).toContain("portal module");
  });

  it("returns 503 for both routes when the module hasn't been built (no dist/, no module.json)", async () => {
    await start(); // moduleDir stays an empty temp dir — nothing written to it

    const manifestRes = await fetch(`${baseUrl}/module/module.json`);
    expect(manifestRes.status).toBe(503);
    expect(await manifestRes.json()).toEqual({ error: "module_not_built" });

    const zipRes = await fetch(`${baseUrl}/module/portal.zip`);
    expect(zipRes.status).toBe(503);
    expect(await zipRes.json()).toEqual({ error: "module_not_built" });
  });

  it("503s the zip route when module.json exists but dist/ hasn't been built yet", async () => {
    writeFileSync(join(moduleDir, "module.json"), JSON.stringify(MODULE_JSON_SOURCE));
    await start();

    const res = await fetch(`${baseUrl}/module/portal.zip`);
    expect(res.status).toBe(503);
  });

  it("leaves /mcp and /health unaffected by the new routes", async () => {
    writeBuiltModule(moduleDir);
    await start();

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);

    const mcpRejected = await fetch(`${baseUrl}${MCP_HTTP_PATH}`, { method: "POST" });
    expect(mcpRejected.status).toBe(401);
  });

  it("createPortalServer builds without binding, module opts included", () => {
    const unbound = createPortalServer({
      port: 0,
      mcpApiKey: MCP_API_KEY,
      playerMcpApiKey: PLAYER_MCP_API_KEY,
      bridgeApiKey: BRIDGE_API_KEY,
      bridgeTimeoutMs: 250,
      maxCreatesPerRequest: 10,
      publicOrigin: PUBLIC_ORIGIN,
      moduleDir,
      oauthStatePath: join(oauthDir, "state.json"),
    });
    expect(unbound.bridge.getStatus()).toEqual({ connected: false });
    unbound.bridge.close();
  });
});
