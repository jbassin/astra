/**
 * Response pins for every portal HTTP route: a fixed request sequence over a real socket,
 * each recorded as its status, the headers clients read and the body. Every credential
 * case is here: no credentials, a malformed header, a wrong key, the player key, the admin
 * key, a valid and a revoked OAuth token. The snapshot was written before the service-kit
 * migration; the migration must leave it unchanged. Ids, codes and tokens are redacted.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { listen } from "./server";

const ADMIN = "pin-admin-key";
const PLAYER = "pin-player-key";
const REDIRECT = "http://127.0.0.1:33333/callback";

test("portal HTTP responses match the pre-migration pins", async () => {
  const moduleDir = mkdtempSync(join(tmpdir(), "portal-pins-module-"));
  writeFileSync(
    join(moduleDir, "module.json"),
    JSON.stringify({ id: "portal", title: "Pin", version: "0.0.0", esmodules: ["dist/main.js"] }),
  );
  mkdirSync(join(moduleDir, "dist"));
  writeFileSync(join(moduleDir, "dist", "main.js"), "export const pinned = 1;\n");
  const handle = await listen({
    port: 0,
    mcpApiKey: ADMIN,
    playerMcpApiKey: PLAYER,
    bridgeApiKey: "pin-bridge-key",
    bridgeTimeoutMs: 250,
    maxCreatesPerRequest: 10,
    publicOrigin: "https://portal.test",
    moduleDir,
    oauthStatePath: join(mkdtempSync(join(tmpdir(), "portal-pins-oauth-")), "state.json"),
  });
  const origin = `http://127.0.0.1:${handle.port}`;
  const secrets: string[] = [];

  function redact(text: string): string {
    let out = text;
    for (const s of secrets) out = out.replaceAll(s, "<secret>");
    out = out.replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
    out = out.replaceAll(/[0-9a-f]{32,}/g, "<hex>");
    out = out.replaceAll(/"client_id_issued_at":\d+/g, '"client_id_issued_at":<t>');
    out = out.replaceAll(/127\.0\.0\.1:\d+/g, "127.0.0.1:<port>");
    return out;
  }

  /** The JSON-RPC payloads of a Streamable-HTTP answer, with a tools/list cut to names. */
  function summarise(contentType: string | null, text: string): unknown {
    if (!contentType?.startsWith("text/event-stream")) return redact(text);
    return text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => {
        const msg = JSON.parse(line.slice(6)) as { result?: { tools?: { name: string }[] } };
        if (msg.result?.tools) return { tools: msg.result.tools.map((t) => t.name) };
        return JSON.parse(redact(JSON.stringify(msg))) as unknown;
      });
  }

  interface PinRequest {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }

  async function pin(label: string, path: string, init: PinRequest = {}): Promise<Response> {
    const res = await fetch(new URL(path, origin), { ...init, redirect: "manual" });
    const clone = res.clone();
    const contentType = res.headers.get("content-type");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const body =
      contentType === "application/zip"
        ? { zipBytes: bytes.length > 0 }
        : summarise(contentType, new TextDecoder().decode(bytes));
    const location = res.headers.get("location");
    expect({
      status: res.status,
      contentType,
      wwwAuthenticate: res.headers.get("www-authenticate"),
      location: location === null ? null : redact(location),
      cacheControl: res.headers.get("cache-control"),
      body,
    }).toMatchSnapshot(label);
    return clone;
  }

  const RPC_HEADERS = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  function rpc(method: string, params: unknown, auth?: string): PinRequest {
    return {
      method: "POST",
      headers: { ...RPC_HEADERS, ...(auth === undefined ? {} : { authorization: auth }) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    };
  }
  const LIST = (auth?: string) => rpc("tools/list", {}, auth);
  const CALL = (name: string, auth?: string) => rpc("tools/call", { name, arguments: {} }, auth);
  const INIT = (auth?: string) =>
    rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "pins", version: "0" },
      },
      auth,
    );

  // --- /mcp: every credential case ---------------------------------------------------
  await pin("mcp no credentials", "/mcp", LIST());
  await pin("mcp GET no credentials", "/mcp");
  await pin("mcp DELETE no credentials", "/mcp", { method: "DELETE" });
  await pin("mcp basic scheme", "/mcp", LIST(`Basic ${ADMIN}`));
  await pin("mcp lower-case scheme", "/mcp", LIST(`bearer ${ADMIN}`));
  await pin("mcp bearer without token", "/mcp", LIST("Bearer "));
  await pin("mcp wrong key", "/mcp", LIST("Bearer not-a-key"));
  await pin("mcp admin key prefix", "/mcp", LIST(`Bearer ${ADMIN.slice(0, -1)}`));
  await pin("mcp admin key plus suffix", "/mcp", LIST(`Bearer ${ADMIN}x`));
  await pin("mcp admin key with trailing part", "/mcp", LIST(`Bearer ${ADMIN} extra`));
  await pin("mcp admin initialize", "/mcp", INIT(`Bearer ${ADMIN}`));
  await pin("mcp admin tools/list", "/mcp", LIST(`Bearer ${ADMIN}`));
  await pin("mcp player tools/list", "/mcp", LIST(`Bearer ${PLAYER}`));
  await pin("mcp admin bridge-status", "/mcp", CALL("bridge-status", `Bearer ${ADMIN}`));
  await pin("mcp player bridge-status", "/mcp", CALL("bridge-status", `Bearer ${PLAYER}`));
  await pin("mcp player admin-only tool", "/mcp", CALL("delete-document", `Bearer ${PLAYER}`));
  await pin("mcp admin GET", "/mcp", { headers: { authorization: `Bearer ${ADMIN}` } });
  await pin("mcp admin bad json", "/mcp", {
    method: "POST",
    headers: { ...RPC_HEADERS, authorization: `Bearer ${ADMIN}` },
    body: "{",
  });
  await pin("mcp trailing path", "/mcp/extra", LIST(`Bearer ${ADMIN}`));
  await pin("mcp prefix path", "/mcpx", LIST());

  // --- OAuth: register, authorize, consent, token, then the token on /mcp ------------
  await pin("prm metadata", "/.well-known/oauth-protected-resource/mcp");
  await pin("as metadata", "/.well-known/oauth-authorization-server");
  await pin("unknown well-known", "/.well-known/nope");
  await pin("register non-claude redirect", "/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: ["https://evil.example/cb"],
      token_endpoint_auth_method: "none",
    }),
  });
  const registered = await pin("register", "/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
  });
  const clientId = ((await registered.json()) as { client_id: string }).client_id;
  secrets.push(clientId);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL("/authorize", origin);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "pin-state",
  }).toString();
  await pin("authorize no params", "/authorize");
  const consentPage = await pin("authorize", authorize.pathname + authorize.search);
  const pendingId = /name="pendingId" value="([a-f0-9]+)"/.exec(await consentPage.text())?.[1];
  if (!pendingId) throw new Error("no pendingId on the consent page");
  const form = (fields: Record<string, string>): PinRequest => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  await pin("consent missing pendingId", "/consent", form({ key: ADMIN }));
  await pin("consent GET", "/consent");
  await pin("consent unknown pendingId", "/consent", form({ pendingId: "ab", key: ADMIN }));
  await pin("consent player key", "/consent", form({ pendingId, key: PLAYER }));
  // A wrong key renews the pending consent under a new id, rendered on the error page.
  const retry = await fetch(new URL(authorize.pathname + authorize.search, origin));
  const retryId = /name="pendingId" value="([a-f0-9]+)"/.exec(await retry.text())?.[1] ?? "";
  const consented = await pin(
    "consent admin key",
    "/consent",
    form({ pendingId: retryId, key: ADMIN }),
  );
  const code = new URL(consented.headers.get("location") ?? "").searchParams.get("code") ?? "";
  secrets.push(code);
  await pin(
    "token wrong verifier",
    "/token",
    form({
      grant_type: "authorization_code",
      code,
      code_verifier: "x".repeat(43),
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  );
  const retry2 = await fetch(new URL(authorize.pathname + authorize.search, origin));
  const retry2Id = /name="pendingId" value="([a-f0-9]+)"/.exec(await retry2.text())?.[1] ?? "";
  const consented2 = await fetch(new URL("/consent", origin), {
    ...form({ pendingId: retry2Id, key: ADMIN }),
    redirect: "manual",
  });
  const code2 = new URL(consented2.headers.get("location") ?? "").searchParams.get("code") ?? "";
  secrets.push(code2);
  const issued = await pin(
    "token",
    "/token",
    form({
      grant_type: "authorization_code",
      code: code2,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  );
  const tokens = (await issued.json()) as { access_token: string; refresh_token: string };
  secrets.push(tokens.access_token, tokens.refresh_token);
  await pin("mcp oauth tools/list", "/mcp", LIST(`Bearer ${tokens.access_token}`));
  await pin("mcp refresh token as bearer", "/mcp", LIST(`Bearer ${tokens.refresh_token}`));
  await pin("revoke", "/revoke", form({ token: tokens.access_token, client_id: clientId }));
  await pin("mcp revoked oauth token", "/mcp", LIST(`Bearer ${tokens.access_token}`));
  await pin("token GET", "/token");

  // --- module package, health, everything else ---------------------------------------
  await pin("module.json", "/module/module.json");
  await pin("module.json POST", "/module/module.json", { method: "POST" });
  await pin("portal.zip", "/module/portal.zip");
  await pin("module unknown", "/module/other");
  await pin("health", "/health");
  await pin("health POST", "/health", { method: "POST" });
  await pin("health HEAD", "/health", { method: "HEAD" });
  await pin("ws as plain GET", "/ws");
  await pin("root", "/");
  await pin("unknown", "/nope");

  await handle.close();
});
