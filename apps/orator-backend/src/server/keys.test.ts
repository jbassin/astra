import { describe, expect, test } from "bun:test";
import { FakeStore } from "../db/fake-store";
import { generateKey } from "./apikeys";
import { type App, type AppConfig, createApp } from "./app";
import { signSession } from "./sessions";

const SECRET = "test-secret";

function cfg(allow = ["uid"]): AppConfig {
  return {
    port: 0,
    sessionSecret: SECRET,
    allowlist: new Set(allow),
    oauth: { clientId: "c", clientSecret: "s", redirectUri: "x" },
    publicOrigin: "https://orator.test",
    secureCookies: true,
    distDir: "/nope",
    dataDir: "/tmp",
    guildId: "g",
    targetLufs: -16,
    rumEndpoint: "http://localhost:10353",
  };
}

function makeApp(config = cfg()): App {
  return createApp(config, new FakeStore(), {});
}

const cookie = `orator_session=${signSession("uid", SECRET)}`;
const sreq = (m: string, p: string, b?: unknown) =>
  new Request(`https://orator.test${p}`, {
    method: m,
    headers: { cookie, ...(b ? { "content-type": "application/json" } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });

describe("key management (session-only, B26)", () => {
  test("create returns the raw key once; list never exposes it", async () => {
    const app = makeApp();
    const created = await (await app.handle(sreq("POST", "/api/v1/keys", { name: "Deck" }))).json();
    expect(created.key).toMatch(/^orator_/);
    expect(created.name).toBe("Deck");

    const list = await (await app.handle(sreq("GET", "/api/v1/keys"))).json();
    expect(list).toHaveLength(1);
    expect(list[0].key).toBeUndefined();
    expect(list[0].prefix).toBe(created.prefix);
  });

  test("revoke removes a key from use", async () => {
    const app = makeApp();
    const created = await (await app.handle(sreq("POST", "/api/v1/keys", {}))).json();
    const res = await app.handle(sreq("DELETE", `/api/v1/keys/${created.id}`));
    expect(res.status).toBe(204);
    const list = await (await app.handle(sreq("GET", "/api/v1/keys"))).json();
    expect(list[0].revoked).toBe(true);
  });
});

describe("API-key authentication on /api", () => {
  async function withKey(app: App): Promise<{ raw: string }> {
    const gen = generateKey();
    await app.store.createApiKey({
      userId: "uid",
      name: "Deck",
      keyHash: gen.hash,
      keyPrefix: gen.prefix,
    });
    return { raw: gen.raw };
  }
  const keyReq = (raw: string, p: string) =>
    new Request(`https://orator.test${p}`, { headers: { authorization: `Bearer ${raw}` } });

  test("a valid key authorizes a data route", async () => {
    const app = makeApp();
    const { raw } = await withKey(app);
    const res = await app.handle(keyReq(raw, "/api/v1/collections"));
    expect(res.status).toBe(200);
  });

  test("a bad key is rejected", async () => {
    const app = makeApp();
    await withKey(app);
    const res = await app.handle(keyReq("orator_bogus", "/api/v1/collections"));
    expect(res.status).toBe(401);
  });

  test("a revoked key is rejected", async () => {
    const app = makeApp();
    const gen = generateKey();
    const row = await app.store.createApiKey({
      userId: "uid",
      name: "Deck",
      keyHash: gen.hash,
      keyPrefix: gen.prefix,
    });
    await app.store.revokeApiKey(row.id, "uid");
    const res = await app.handle(keyReq(gen.raw, "/api/v1/collections"));
    expect(res.status).toBe(401);
  });

  test("a key whose owner is not allowlisted is rejected", async () => {
    const app = makeApp(cfg(["someone-else"]));
    const gen = generateKey();
    await app.store.createApiKey({
      userId: "uid",
      name: "Deck",
      keyHash: gen.hash,
      keyPrefix: gen.prefix,
    });
    const res = await app.handle(keyReq(gen.raw, "/api/v1/collections"));
    expect(res.status).toBe(401);
  });

  test("an API key cannot mint keys (management needs a session)", async () => {
    const app = makeApp();
    const { raw } = await withKey(app);
    const res = await app.handle(
      new Request("https://orator.test/api/v1/keys", {
        method: "POST",
        headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
  });

  test("key auth updates last_used_at", async () => {
    const app = makeApp();
    const { raw } = await withKey(app);
    await app.handle(keyReq(raw, "/api/v1/collections"));
    const list = await app.store.listApiKeys("uid");
    expect(list[0]?.last_used_at).not.toBeNull();
  });
});
