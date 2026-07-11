/**
 * Spec 0025 S1 — the portal OAuth 2.1 authorization server, exercised against a
 * real ephemeral-port `listen()` (the same harness `mcp.test.ts` uses), hermetic
 * (no SOPS/network): discovery metadata, DCR's D-4 allowlist, the full
 * authorize→consent→token PKCE flow, refresh rotation, revocation, expiry, and
 * the D-2 persistence/corruption contract.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MCP_HTTP_PATH } from "./constants";
import type { PortalServerHandle } from "./server";
import { listen } from "./server";

const MCP_API_KEY = "test-mcp-key";
const PLAYER_MCP_API_KEY = "test-player-mcp-key";
const BRIDGE_API_KEY = "test-bridge-key";
const TEST_PUBLIC_ORIGIN = "https://portal.test";
const TEST_MODULE_DIR = "/nonexistent/portal-module-fixture";
const LOOPBACK_REDIRECT_URI = "http://127.0.0.1:33333/callback";
const CLAUDE_AI_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** RFC 7636 S256 PKCE pair — node:crypto only, no new dep. */
function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function newOauthStatePath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "portal-oauth-test-"));
  return { dir, path: join(dir, "state.json") };
}

async function startServer(oauthStatePath: string, accessTokenTtlS?: number) {
  return listen({
    port: 0,
    mcpApiKey: MCP_API_KEY,
    playerMcpApiKey: PLAYER_MCP_API_KEY,
    bridgeApiKey: BRIDGE_API_KEY,
    bridgeTimeoutMs: 250,
    maxCreatesPerRequest: 10,
    publicOrigin: TEST_PUBLIC_ORIGIN,
    moduleDir: TEST_MODULE_DIR,
    oauthStatePath,
    accessTokenTtlS,
  });
}

/** Registers a public (`token_endpoint_auth_method: "none"`) DCR client with the
 * given redirect_uris — mirrors claude.ai's own registration shape (scope doc §1). */
async function registerClient(
  origin: string,
  redirectUris: string[],
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(new URL("/register", origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      client_name: "test client",
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Drives GET /authorize -> extracts the rendered pendingId from the consent HTML. */
async function getAuthorizePendingId(
  origin: string,
  opts: { clientId: string; redirectUri: string; codeChallenge: string; state?: string },
): Promise<{ status: number; html: string; pendingId: string | undefined }> {
  const url = new URL("/authorize", origin);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.state !== undefined) url.searchParams.set("state", opts.state);

  const res = await fetch(url);
  const html = await res.text();
  const match = /name="pendingId" value="([a-f0-9]+)"/.exec(html);
  return { status: res.status, html, pendingId: match?.[1] };
}

async function postConsent(
  origin: string,
  pendingId: string,
  key: string,
): Promise<{ status: number; location: string | null; html: string }> {
  const res = await fetch(new URL("/consent", origin), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ pendingId, key }).toString(),
    redirect: "manual",
  });
  const location = res.headers.get("location");
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, location, html };
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
}

async function postToken(
  origin: string,
  form: Record<string, string>,
): Promise<{ status: number; body: TokenResponse }> {
  const res = await fetch(new URL("/token", origin), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, body: (await res.json()) as TokenResponse };
}

/** Drives the full register -> authorize -> consent -> token flow and returns the
 * issued tokens + the client_id, so most tests can start from "a live token pair"
 * without re-deriving PKCE by hand. */
async function fullFlow(
  origin: string,
  redirectUri = LOOPBACK_REDIRECT_URI,
): Promise<{ clientId: string; accessToken: string; refreshToken: string; state: string }> {
  const { verifier, challenge } = pkcePair();
  const { body: client } = await registerClient(origin, [redirectUri]);
  const clientId = client.client_id as string;
  const state = `state-${randomBytes(4).toString("hex")}`;

  const { pendingId } = await getAuthorizePendingId(origin, {
    clientId,
    redirectUri,
    codeChallenge: challenge,
    state,
  });
  if (!pendingId) throw new Error("test setup: no pendingId extracted from /authorize HTML");

  const consent = await postConsent(origin, pendingId, MCP_API_KEY);
  const location = new URL(consent.location ?? "");
  const code = location.searchParams.get("code");
  if (!code) throw new Error("test setup: no code in /consent redirect");

  const { body: tokens } = await postToken(origin, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: clientId,
    redirect_uri: redirectUri,
  });
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("test setup: /token did not issue a token pair");
  }
  return { clientId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, state };
}

describe("OAuth discovery metadata (spec 0025 D-9)", () => {
  let handle: PortalServerHandle & { port: number };
  let origin: string;
  let stateDir: string;

  beforeEach(async () => {
    const state = newOauthStatePath();
    stateDir = state.dir;
    handle = await startServer(state.path);
    origin = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("serves AS metadata with S256, offline_access, and a registration_endpoint", async () => {
    const res = await fetch(new URL("/.well-known/oauth-authorization-server", origin));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.scopes_supported).toContain("offline_access");
    expect(body.registration_endpoint).toBeTruthy();
  });

  it("serves protected-resource metadata whose resource + authorization_servers match the issuer", async () => {
    const res = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", origin));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe(`${TEST_PUBLIC_ORIGIN}/mcp`);
    expect(body.authorization_servers).toEqual([new URL(TEST_PUBLIC_ORIGIN).href]);
  });
});

describe("DCR redirect_uri allowlist (spec 0025 D-4)", () => {
  let handle: PortalServerHandle & { port: number };
  let origin: string;
  let stateDir: string;

  beforeEach(async () => {
    const state = newOauthStatePath();
    stateDir = state.dir;
    handle = await startServer(state.path);
    origin = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("registers a claude.ai-shaped client", async () => {
    const { status, body } = await registerClient(origin, [CLAUDE_AI_REDIRECT_URI]);
    expect(status).toBe(201);
    expect(body.client_id).toBeTruthy();
  });

  it("registers a loopback client at ANY port", async () => {
    const { status, body } = await registerClient(origin, ["http://127.0.0.1:54321/cb"]);
    expect(status).toBe(201);
    expect(body.client_id).toBeTruthy();
  });

  it("registers a localhost loopback client too", async () => {
    const { status } = await registerClient(origin, ["http://localhost:9999/cb"]);
    expect(status).toBe(201);
  });

  it("rejects a disallowed redirect_uri with an RFC 7591 error response", async () => {
    const { status, body } = await registerClient(origin, ["https://evil.example/cb"]);
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(body.client_id).toBeUndefined();
  });
});

describe("the full authorize -> consent -> token PKCE flow (spec 0025 D-10)", () => {
  let handle: PortalServerHandle & { port: number };
  let origin: string;
  let stateDir: string;

  beforeEach(async () => {
    const state = newOauthStatePath();
    stateDir = state.dir;
    handle = await startServer(state.path);
    origin = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("renders a 200 HTML consent form showing the redirect host", async () => {
    const { verifier: _verifier, challenge } = pkcePair();
    const { body: client } = await registerClient(origin, [LOOPBACK_REDIRECT_URI]);
    const { status, html, pendingId } = await getAuthorizePendingId(origin, {
      clientId: client.client_id as string,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
    });
    expect(status).toBe(200);
    expect(html).toContain(new URL(LOOPBACK_REDIRECT_URI).host);
    expect(pendingId).toBeTruthy();
  });

  it("consent with the right key 302s back with code + the same state", async () => {
    const { verifier: _verifier, challenge } = pkcePair();
    const { body: client } = await registerClient(origin, [LOOPBACK_REDIRECT_URI]);
    const { pendingId } = await getAuthorizePendingId(origin, {
      clientId: client.client_id as string,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
      state: "my-state-value",
    });
    const consent = await postConsent(origin, pendingId as string, MCP_API_KEY);
    expect(consent.status).toBe(302);
    const location = new URL(consent.location as string);
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(location.searchParams.get("state")).toBe("my-state-value");
  });

  it("consent with the wrong key re-renders 200 with an error and issues NO code", async () => {
    const { challenge } = pkcePair();
    const { body: client } = await registerClient(origin, [LOOPBACK_REDIRECT_URI]);
    const { pendingId } = await getAuthorizePendingId(origin, {
      clientId: client.client_id as string,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
    });
    const consent = await postConsent(origin, pendingId as string, "wrong-key");
    expect(consent.status).toBe(200); // NOT a 302 — no redirect, no code was ever minted
    expect(consent.html.toLowerCase()).toContain("wrong key");
    expect(consent.html).not.toContain(MCP_API_KEY); // never echo the real key back
  });

  it("an unknown/expired pendingId 400s with a human-readable page", async () => {
    const res = await fetch(new URL("/consent", origin), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ pendingId: "deadbeef".repeat(4), key: MCP_API_KEY }).toString(),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("expired");
  });

  it("POST /token with the correct code_verifier issues access + refresh tokens", async () => {
    const { clientId, accessToken, refreshToken } = await fullFlow(origin);
    expect(clientId).toBeTruthy();
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  it("POST /token with the WRONG code_verifier fails invalid_grant", async () => {
    const { challenge } = pkcePair();
    const { body: client } = await registerClient(origin, [LOOPBACK_REDIRECT_URI]);
    const clientId = client.client_id as string;
    const { pendingId } = await getAuthorizePendingId(origin, {
      clientId,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
    });
    const consent = await postConsent(origin, pendingId as string, MCP_API_KEY);
    const code = new URL(consent.location as string).searchParams.get("code") as string;

    const { status, body } = await postToken(origin, {
      grant_type: "authorization_code",
      code,
      code_verifier: "totally-the-wrong-verifier",
      client_id: clientId,
      redirect_uri: LOOPBACK_REDIRECT_URI,
    });
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("reusing an already-burned code fails invalid_grant", async () => {
    const { verifier, challenge } = pkcePair();
    const { body: client } = await registerClient(origin, [LOOPBACK_REDIRECT_URI]);
    const clientId = client.client_id as string;
    const { pendingId } = await getAuthorizePendingId(origin, {
      clientId,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
    });
    const consent = await postConsent(origin, pendingId as string, MCP_API_KEY);
    const code = new URL(consent.location as string).searchParams.get("code") as string;

    const first = await postToken(origin, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: LOOPBACK_REDIRECT_URI,
    });
    expect(first.status).toBe(200);

    const replay = await postToken(origin, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: LOOPBACK_REDIRECT_URI,
    });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
  });
});

describe("refresh rotation (spec 0025 D-7)", () => {
  let handle: PortalServerHandle & { port: number };
  let origin: string;
  let stateDir: string;

  beforeEach(async () => {
    const state = newOauthStatePath();
    stateDir = state.dir;
    handle = await startServer(state.path);
    origin = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("issues a NEW refresh token and kills the old one", async () => {
    const { clientId, refreshToken } = await fullFlow(origin);

    const rotated = await postToken(origin, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).toBeTruthy();
    expect(rotated.body.refresh_token).not.toBe(refreshToken);

    const reuse = await postToken(origin, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe("invalid_grant");
  });
});

describe("revocation + verifyAccessToken (spec 0025)", () => {
  let handle: PortalServerHandle & { port: number };
  let origin: string;
  let stateDir: string;

  beforeEach(async () => {
    const state = newOauthStatePath();
    stateDir = state.dir;
    handle = await startServer(state.path);
    origin = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("verifyAccessToken accepts a freshly issued token with the right clientId", async () => {
    const { clientId, accessToken } = await fullFlow(origin);
    const info = await handle.oauthProvider.verifyAccessToken(accessToken);
    expect(info.clientId).toBe(clientId);
    expect(info.token).toBe(accessToken);
  });

  it("POST /revoke kills an access token — verifyAccessToken then rejects", async () => {
    const { clientId, accessToken } = await fullFlow(origin);

    const revokeRes = await fetch(new URL("/revoke", origin), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: accessToken, client_id: clientId }).toString(),
    });
    expect(revokeRes.status).toBe(200);

    await expect(handle.oauthProvider.verifyAccessToken(accessToken)).rejects.toThrow();
  });
});

describe("access-token expiry (spec 0025 D-7)", () => {
  it("verifyAccessToken rejects an expired token", async () => {
    const state = newOauthStatePath();
    const handle = await startServer(state.path, 1); // 1s TTL
    const origin = `http://127.0.0.1:${handle.port}`;
    try {
      const { accessToken } = await fullFlow(origin);
      await sleep(1200);
      await expect(handle.oauthProvider.verifyAccessToken(accessToken)).rejects.toThrow();
    } finally {
      await handle.close();
      rmSync(state.dir, { recursive: true, force: true });
    }
  });
});

describe("persistence across a restart (spec 0025 D-2)", () => {
  it("a second listen() on the SAME state file still verifies the token and knows the client", async () => {
    const state = newOauthStatePath();
    let handle = await startServer(state.path);
    let origin = `http://127.0.0.1:${handle.port}`;
    const { clientId, accessToken } = await fullFlow(origin);
    await handle.close();

    handle = await startServer(state.path); // fresh process-equivalent listen(), same file
    origin = `http://127.0.0.1:${handle.port}`;
    try {
      const info = await handle.oauthProvider.verifyAccessToken(accessToken);
      expect(info.clientId).toBe(clientId);

      // Drive a second authorize with the same client_id to prove the client
      // itself (not just the token) survived the restart.
      const { challenge } = pkcePair();
      const { status } = await getAuthorizePendingId(origin, {
        clientId,
        redirectUri: LOOPBACK_REDIRECT_URI,
        codeChallenge: challenge,
      });
      expect(status).toBe(200);
    } finally {
      await handle.close();
      rmSync(state.dir, { recursive: true, force: true });
    }
  });

  it("a corrupt state file starts empty and renames itself aside", async () => {
    const state = newOauthStatePath();
    let handle = await startServer(state.path);
    const origin = `http://127.0.0.1:${handle.port}`;
    const { accessToken } = await fullFlow(origin);
    await handle.close();

    writeFileSync(state.path, "this is not valid json {{{");

    handle = await startServer(state.path);
    try {
      await expect(handle.oauthProvider.verifyAccessToken(accessToken)).rejects.toThrow();
      const siblings = readdirSync(state.dir);
      expect(siblings.some((name) => name.startsWith("state.json.corrupt-"))).toBe(true);
    } finally {
      await handle.close();
      rmSync(state.dir, { recursive: true, force: true });
    }
  });
});

describe("token-material log hygiene (spec 0025 Scope-6 hard rule)", () => {
  let handle: PortalServerHandle & { port: number };
  let origin: string;
  let stateDir: string;

  beforeEach(async () => {
    const state = newOauthStatePath();
    stateDir = state.dir;
    handle = await startServer(state.path);
    origin = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("never echoes issued token material back in HTML or thrown error bodies", async () => {
    const { verifier, challenge } = pkcePair();
    const { body: client } = await registerClient(origin, [LOOPBACK_REDIRECT_URI]);
    const clientId = client.client_id as string;
    const { html: authorizeHtml, pendingId } = await getAuthorizePendingId(origin, {
      clientId,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
    });
    const consent = await postConsent(origin, pendingId as string, MCP_API_KEY);
    const code = new URL(consent.location as string).searchParams.get("code") as string;

    const { body: tokens } = await postToken(origin, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: LOOPBACK_REDIRECT_URI,
    });
    const accessToken = tokens.access_token as string;
    const refreshToken = tokens.refresh_token as string;

    expect(authorizeHtml).not.toContain(accessToken);

    // A wrong-key retry render must not leak the token either.
    const { pendingId: pendingId2 } = await getAuthorizePendingId(origin, {
      clientId,
      redirectUri: LOOPBACK_REDIRECT_URI,
      codeChallenge: challenge,
    });
    const wrongKeyConsent = await postConsent(origin, pendingId2 as string, "wrong-key");
    expect(wrongKeyConsent.html).not.toContain(accessToken);
    expect(wrongKeyConsent.html).not.toContain(refreshToken);

    // The burned-code replay's error body must not carry the token either.
    const replay = await postToken(origin, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: LOOPBACK_REDIRECT_URI,
    });
    expect(JSON.stringify(replay.body)).not.toContain(accessToken);
    expect(JSON.stringify(replay.body)).not.toContain(refreshToken);
  });
  // Note: as with mcp.test.ts, `@astra/observe`'s getLogger resolves to a no-op
  // OTel logger unless initTelemetry has installed a real LoggerProvider (never
  // called in these Foundry-free unit tests), so the emitted audit-log BODIES
  // aren't cheaply capturable here. The `oauth.ts` audit log-lines are written by
  // construction to carry only client_id + a fixed literal (grepped by inspection,
  // per the module's hard rule) — this test instead proves the observable surface
  // (HTML + JSON error bodies) never leaks token material.
});

describe("/mcp dual auth — the OAuth side (spec 0025 S2, D-3)", () => {
  it("an OAuth-issued access token calls a real tool through StreamableHTTPClientTransport", async () => {
    const state = newOauthStatePath();
    const handle = await startServer(state.path);
    const origin = `http://127.0.0.1:${handle.port}`;
    try {
      const { accessToken } = await fullFlow(origin);

      const transport = new StreamableHTTPClientTransport(new URL(MCP_HTTP_PATH, origin), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      });
      const client = new Client({ name: "oauth-test-client", version: "0.0.0" });
      await client.connect(transport);

      // bridge-status returning the typed offline result (no Foundry module
      // connected in this hermetic test) proves the request got past dual-auth
      // and reached a real tool call — that's the whole point of this test, not
      // the bridge behavior itself (covered elsewhere in mcp.test.ts).
      const result = await client.callTool({ name: "bridge-status" });
      const [content] = result.content as Array<{ type: "text"; text: string }>;
      if (!content) throw new Error("unreachable — asserted above");
      expect(JSON.parse(content.text)).toEqual({ connected: false });

      await client.close();
    } finally {
      await handle.close();
      rmSync(state.dir, { recursive: true, force: true });
    }
  });

  it("an OAuth-issued access token resolves the full admin tool list, unaffected by player scoping (0028 D28-8)", async () => {
    const state = newOauthStatePath();
    const handle = await startServer(state.path);
    const origin = `http://127.0.0.1:${handle.port}`;
    try {
      const { accessToken } = await fullFlow(origin);

      const transport = new StreamableHTTPClientTransport(new URL(MCP_HTTP_PATH, origin), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      });
      const client = new Client({ name: "oauth-test-client", version: "0.0.0" });
      await client.connect(transport);

      const { tools } = await client.listTools();
      // 18 (0023/0026) + query-party + query-player (0028 S2) = 20.
      expect(tools.length).toBe(20);
      expect(tools.map((t) => t.name)).toContain("search-world"); // an admin-only read tool
      expect(tools.map((t) => t.name)).toContain("query-player");

      await client.close();
    } finally {
      await handle.close();
      rmSync(state.dir, { recursive: true, force: true });
    }
  });

  it("an expired OAuth access token is rejected with 401 + the D-9 WWW-Authenticate header", async () => {
    const state = newOauthStatePath();
    const handle = await startServer(state.path, 1); // 1s TTL
    const origin = `http://127.0.0.1:${handle.port}`;
    try {
      const { accessToken } = await fullFlow(origin);
      await sleep(1200);

      const res = await fetch(new URL(MCP_HTTP_PATH, origin), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toMatch(/^Bearer resource_metadata="/);
    } finally {
      await handle.close();
      rmSync(state.dir, { recursive: true, force: true });
    }
  });
});
