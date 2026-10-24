/**
 * orator's auth, end to end through the service kit: every way in that must stay shut
 * (0037 SVC-2). The session-secret floor itself is in `../startup.test.ts`; this file
 * checks what the running app does with each credential.
 */
import { describe, expect, test } from "vitest";

import { FakeStore } from "../db/fake-store";
import { generateKey } from "./apikeys";
import { API_ROUTES, type AppConfig, createApp } from "./app";
import { signSession } from "./sessions";

const SECRET = "auth-test-secret-auth-test-secret-0";
const NOW = Date.UTC(2026, 9, 24);

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    sessionSecret: SECRET,
    allowlist: new Set(["op"]),
    oauth: {
      clientId: "cid",
      clientSecret: "sec",
      redirectUri: "https://orator.test/auth/callback",
    },
    publicOrigin: "https://orator.test",
    secureCookies: true,
    distDir: "/nonexistent-dist",
    dataDir: "/tmp/orator-auth-test",
    guildId: "guild",
    targetLufs: -16,
    rumEndpoint: "https://rum.test",
    ...overrides,
  };
}

async function withKey(store: FakeStore, userId: string): Promise<string> {
  const key = generateKey();
  await store.createApiKey({ userId, name: "deck", keyHash: key.hash, keyPrefix: key.prefix });
  return key.raw;
}

function call(path: string, headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(`https://orator.test${path}`, { method, headers });
}

const cookie = (uid: string, secret = SECRET, ttl?: number, now = NOW) =>
  `orator_session=${signSession(uid, secret, ttl, now)}`;

describe("unauthenticated", () => {
  const app = createApp(config(), new FakeStore(), { now: () => NOW });

  test.each(API_ROUTES.map((r) => [r.method, r.path] as const))(
    "%s %s answers 401 with no credentials",
    async (method, path) => {
      const res = await app.handle(call(path.replaceAll(/:[a-z]+/g, "1"), {}, method));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated" });
    },
  );

  test("an unknown /api/ path answers 401, not 404 (no path discovery)", async () => {
    expect((await app.handle(call("/api/v1/secret-admin"))).status).toBe(401);
  });

  test("the health checks and the RUM config stay open", async () => {
    expect((await app.handle(call("/healthz"))).status).toBe(200);
    expect((await app.handle(call("/api/v1/health"))).status).toBe(200);
    expect((await app.handle(call("/api/v1/rum-config"))).status).toBe(200);
  });
});

describe("wrong credentials", () => {
  test.each([
    [
      "a forged signature",
      "orator_session=op.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
    ["a cookie signed with another secret", cookie("op", "another-secret-another-secret-00000")],
    ["an expired cookie", cookie("op", SECRET, 60, NOW - 120_000)],
    ["a truncated cookie", cookie("op").slice(0, -4)],
    ["a non-allowlisted user's cookie", cookie("intruder")],
  ])("%s is refused", async (_label, header) => {
    const app = createApp(config(), new FakeStore(), { now: () => NOW });
    expect((await app.handle(call("/api/v1/me", { cookie: header }))).status).toBe(401);
  });

  test("a wrong, revoked or non-allowlisted API key is refused; the right one works", async () => {
    const store = new FakeStore();
    const good = await withKey(store, "op");
    const outsider = await withKey(store, "intruder");
    const revoked = await withKey(store, "op");
    const revokedId = store.keys.at(-1)?.id ?? 0;
    await store.revokeApiKey(revokedId, "op");
    const app = createApp(config(), store, { now: () => NOW });
    const me = (headers: Record<string, string>) => app.handle(call("/api/v1/me", headers));

    expect((await me({ authorization: `Bearer ${good}` })).status).toBe(200);
    expect((await me({ "x-orator-key": good })).status).toBe(200);
    expect((await me({ authorization: `Bearer ${good}x` })).status).toBe(401);
    expect((await me({ authorization: "Bearer orator_wrong" })).status).toBe(401);
    expect((await me({ authorization: "Bearer " })).status).toBe(401);
    expect((await me({ authorization: `Basic ${good}` })).status).toBe(401);
    expect((await me({ authorization: `Bearer ${revoked}` })).status).toBe(401);
    expect((await me({ authorization: `Bearer ${outsider}` })).status).toBe(401);
  });

  test("an API key cannot mint or list keys (key management needs a login)", async () => {
    const store = new FakeStore();
    const good = await withKey(store, "op");
    const app = createApp(config(), store, { now: () => NOW });
    const bearer = { authorization: `Bearer ${good}` };
    expect((await app.handle(call("/api/v1/keys", bearer))).status).toBe(403);
    expect((await app.handle(call("/api/v1/keys", bearer, "POST"))).status).toBe(403);
  });
});

describe("the allowlist (fail closed)", () => {
  test("an empty allowlist admits neither a session nor an API key", async () => {
    const store = new FakeStore();
    const key = await withKey(store, "op");
    const app = createApp(config({ allowlist: new Set() }), store, { now: () => NOW });
    expect((await app.handle(call("/api/v1/me", { cookie: cookie("op") }))).status).toBe(401);
    expect((await app.handle(call("/api/v1/me", { authorization: `Bearer ${key}` }))).status).toBe(
      401,
    );
  });

  test("an operator removed from the allowlist loses a live session and their keys", async () => {
    const store = new FakeStore();
    const key = await withKey(store, "op");
    const app = createApp(config({ allowlist: new Set(["someone-else"]) }), store, {
      now: () => NOW,
    });
    expect((await app.handle(call("/api/v1/me", { cookie: cookie("op") }))).status).toBe(401);
    expect((await app.handle(call("/api/v1/me", { authorization: `Bearer ${key}` }))).status).toBe(
      401,
    );
  });

  test("a non-allowlisted Discord login gets 403 and no cookie", async () => {
    const fetchImpl = (input: string) =>
      Promise.resolve(
        input.includes("/token")
          ? Response.json({ access_token: "t", token_type: "Bearer" })
          : Response.json({ id: "intruder", username: "x" }),
      );
    const app = createApp(config(), new FakeStore(), { fetchImpl, now: () => NOW });
    const state = encodeURIComponent(signSession("nonce", SECRET, 600, NOW));
    const res = await app.handle(call(`/auth/callback?code=c&state=${state}`));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("the session secret", () => {
  test.each(["", "   "])("createApp refuses a blank secret %j", (blank) => {
    expect(() => createApp(config({ sessionSecret: blank }), new FakeStore())).toThrow(
      /sessionSecret is blank/,
    );
  });

  test("an OAuth state signed with another secret is refused", async () => {
    const app = createApp(config(), new FakeStore(), { now: () => NOW });
    const state = encodeURIComponent(
      signSession("nonce", "another-secret-another-secret-00", 600, NOW),
    );
    const res = await app.handle(call(`/auth/callback?code=c&state=${state}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_oauth_state" });
  });
});
