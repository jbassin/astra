/**
 * Response pins for the orator HTTP app: a fixed sequence of requests, each recorded as its
 * status, the headers clients read, the body, and the store calls it made (so a change in
 * how a body is parsed shows up as a changed store argument). The snapshot file was written
 * before the service-kit migration; the migration must leave it unchanged.
 *
 * Random values (API keys, their hashes) are redacted; the clock and the OAuth state nonce
 * are fixed, so session cookies are deterministic.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import type { NowPlaying, PlaybackEngine } from "../bot/playback";
import { PlaybackError } from "../bot/playback";
import { FakeStore } from "../db/fake-store";
import type { LibraryStore, Playlist, Tag } from "../db/store";
import { type AppConfig, createApp } from "./app";
import type { IngestService } from "./ingest";
import { JobHub } from "./jobhub";
import { signSession } from "./sessions";

const SECRET = "pin-secret-pin-secret-pin-secret-0123";
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const TS = "2026-01-01T00:00:00";

type Call = [string, ...unknown[]];

/** FakeStore plus deterministic tags and playlists (FakeStore leaves them unimplemented). */
class PinStore extends FakeStore {
  readonly tagRows: Tag[] = [];
  readonly playlistRows: Playlist[] = [];
  readonly playlistItems = new Map<number, number[]>();

  override upsertTag(name: string, category: string | null = null): Promise<Tag> {
    const found = this.tagRows.find((t) => t.name === name);
    if (found) return Promise.resolve(found);
    const tag: Tag = { id: 900 + this.tagRows.length, name, category, color: null, created_at: TS };
    this.tagRows.push(tag);
    return Promise.resolve(tag);
  }
  override listTags(): Promise<(Tag & { track_count: number })[]> {
    return Promise.resolve(this.tagRows.map((t) => ({ ...t, track_count: 0 })));
  }
  override tagsForTrack(): Promise<Tag[]> {
    return Promise.resolve([]);
  }
  override addTagsToTracks(trackIds: number[], tagIds: number[]): Promise<number> {
    return Promise.resolve(trackIds.length * tagIds.length);
  }
  override removeTagsFromTracks(trackIds: number[], tagIds: number[]): Promise<number> {
    return Promise.resolve(trackIds.length * tagIds.length);
  }
  override updateTag(id: number, patch: { name?: string; color?: string | null }) {
    const tag = this.tagRows.find((t) => t.id === id);
    if (!tag) return Promise.resolve(null);
    if (patch.name !== undefined) tag.name = patch.name;
    if (patch.color !== undefined) tag.color = patch.color;
    return Promise.resolve(tag);
  }
  override deleteTag(id: number): Promise<boolean> {
    return Promise.resolve(this.tagRows.some((t) => t.id === id));
  }
  override createPlaylist(name: string): Promise<Playlist> {
    const row: Playlist = {
      id: 700 + this.playlistRows.length,
      name,
      loop_mode: "none",
      shuffle: 0,
      created_at: TS,
      updated_at: TS,
    };
    this.playlistRows.push(row);
    return Promise.resolve(row);
  }
  override getPlaylist(id: number): Promise<Playlist | null> {
    return Promise.resolve(this.playlistRows.find((p) => p.id === id) ?? null);
  }
  override listPlaylists(): Promise<Playlist[]> {
    return Promise.resolve([...this.playlistRows]);
  }
  override updatePlaylist(id: number): Promise<boolean> {
    return Promise.resolve(this.playlistRows.some((p) => p.id === id));
  }
  override deletePlaylist(id: number): Promise<boolean> {
    return Promise.resolve(this.playlistRows.some((p) => p.id === id));
  }
  override setPlaylistItems(id: number, trackIds: number[]): Promise<void> {
    this.playlistItems.set(id, trackIds);
    return Promise.resolve();
  }
  override playlistTrackIds(id: number): Promise<number[]> {
    return Promise.resolve(this.playlistItems.get(id) ?? []);
  }
  override renameCollection(id: number, name: string): Promise<boolean> {
    const c = this.collections.find((x) => x.id === id);
    if (c) c.name = name;
    return Promise.resolve(Boolean(c));
  }
  override deleteCollection(id: number): Promise<boolean> {
    return Promise.resolve(this.collections.some((c) => c.id === id));
  }
  override updateTrackTitle(id: number, title: string): Promise<boolean> {
    const t = this.tracks.find((x) => x.id === id);
    if (t) t.title = title;
    return Promise.resolve(Boolean(t));
  }
  override bulkUpdateTitles(updates: { id: number; title: string }[]): Promise<number> {
    return Promise.resolve(updates.length);
  }
  override setTrackCollection(id: number, collectionId: number | null): Promise<boolean> {
    const t = this.tracks.find((x) => x.id === id);
    if (t) t.collection_id = collectionId;
    return Promise.resolve(Boolean(t));
  }
  override deleteTrack(id: number): Promise<{ filePath: string | null } | null> {
    return Promise.resolve(this.tracks.some((t) => t.id === id) ? { filePath: null } : null);
  }
}

/** Record every store call (name and arguments) made while a request runs. */
function recording(store: LibraryStore, calls: Call[]): LibraryStore {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

const NOW_PLAYING: NowPlaying = {
  connected: true,
  channelId: "chan-1",
  status: "playing",
  loopMode: "none",
  current: { trackId: 1, title: "pinned", positionMs: 0, durationMs: 1000 },
  queueLength: 1,
  queueIndex: 0,
};

/** A playback engine stub that records what the routes ask of it. */
function stubEngine(calls: Call[]): PlaybackEngine {
  const answer =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([`engine.${name}`, ...args]);
      return Promise.resolve(NOW_PLAYING);
    };
  return {
    nowPlaying: () => NOW_PLAYING,
    play: answer("play"),
    stop: answer("stop"),
    pause: answer("pause"),
    resume: answer("resume"),
    next: answer("next"),
    prev: () => Promise.reject(new PlaybackError(409, "nothing_before")),
    setLoop: answer("setLoop"),
    leave: answer("leave"),
    join: (...args: unknown[]) => {
      calls.push(["engine.join", ...args]);
      return Promise.resolve();
    },
    whereIsOperator: () => Promise.resolve("chan-1"),
  } as unknown as PlaybackEngine;
}

function stubIngest(calls: Call[]): IngestService {
  return {
    start: (url: string, collectionId?: number) => {
      calls.push(["ingest.start", url, collectionId]);
      return Promise.resolve({
        job: { id: 55, status: "queued", source_url: url },
        done: Promise.resolve(),
      });
    },
  } as unknown as IngestService;
}

function redact(text: string): string {
  return text
    .replaceAll(/orator_[A-Za-z0-9_-]+/g, "orator_<key>")
    .replaceAll(/[0-9a-f]{64}/g, "<hash>");
}

const HEADERS = ["content-type", "location", "set-cookie", "cache-control"];

test("orator HTTP responses match the pre-migration pins", async () => {
  const dist = mkdtempSync(join(tmpdir(), "orator-pins-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>orator pins</title>");
  writeFileSync(join(dist, "app.js"), "console.log('pinned')");
  const calls: Call[] = [];
  const base = new PinStore();
  const store = recording(base, calls);
  const config: AppConfig = {
    port: 0,
    sessionSecret: SECRET,
    allowlist: new Set(["op-1", "op-2"]),
    oauth: {
      clientId: "cid",
      clientSecret: "csec",
      redirectUri: "https://orator.test/auth/callback",
    },
    publicOrigin: "https://orator.test",
    secureCookies: true,
    distDir: dist,
    dataDir: mkdtempSync(join(tmpdir(), "orator-pins-data-")),
    guildId: "guild-1",
    targetLufs: -16,
    rumEndpoint: "https://rum.test",
  };
  const discordUser = { id: "op-1", username: "op" };
  const fetchImpl = (input: string): Promise<Response> => {
    if (input.includes("/token")) {
      return Promise.resolve(
        Response.json({ access_token: "tok", token_type: "Bearer" }, { status: 200 }),
      );
    }
    return Promise.resolve(Response.json(discordUser));
  };
  const services = { playback: stubEngine(calls), ingest: stubIngest(calls), hub: new JobHub() };
  const app = createApp(config, store, {
    fetchImpl,
    now: () => NOW,
    makeState: () => "state-nonce",
    services,
  });
  const bare = createApp(config, recording(new PinStore(), calls), { now: () => NOW });

  const cookie = `orator_session=${signSession("op-1", SECRET, undefined, NOW)}`;
  const state = encodeURIComponent(signSession("nonce", SECRET, 600, NOW));

  async function pin(
    label: string,
    method: string,
    path: string,
    opts: {
      cookie?: string;
      headers?: Record<string, string>;
      body?: unknown;
      raw?: BodyInit;
    } = {},
    target = app,
  ) {
    calls.length = 0;
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.cookie) headers.cookie = opts.cookie;
    let body: BodyInit | undefined = opts.raw;
    if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers["content-type"] = "application/json";
    }
    const res = await target.handle(
      new Request(`https://orator.test${path}`, { method, headers, body }),
    );
    const seen: Record<string, string> = {};
    for (const h of HEADERS) {
      const v = res.headers.get(h);
      if (v !== null) seen[h] = v;
    }
    const sse = res.headers.get("content-type") === "text/event-stream";
    let text: string;
    if (sse) {
      const reader = must(res.body).getReader();
      const first = await reader.read();
      text = new TextDecoder().decode(first.value);
      await reader.cancel();
    } else {
      text = await res.text();
    }
    const record = { status: res.status, headers: seen, body: redact(text), calls: [...calls] };
    expect(JSON.parse(redact(JSON.stringify(record)))).toMatchSnapshot(label);
    return text;
  }

  // --- open routes ---
  await pin("health", "GET", "/api/v1/health");
  await pin("health POST", "POST", "/api/v1/health");
  await pin("rum-config", "GET", "/api/v1/rum-config");

  // --- OAuth ---
  await pin("login", "GET", "/auth/login");
  await pin("callback ok", "GET", `/auth/callback?code=c&state=${state}`);
  await pin("callback forged state", "GET", "/auth/callback?code=c&state=garbage");
  await pin("callback no code", "GET", `/auth/callback?state=${state}`);
  await pin("callback bot install", "GET", "/auth/callback?guild_id=1&permissions=8");
  discordUser.id = "intruder";
  await pin("callback not allowlisted", "GET", `/auth/callback?code=c&state=${state}`);
  discordUser.id = "op-1";
  await pin("logout", "POST", "/auth/logout");
  await pin("logout GET falls to the SPA", "GET", "/auth/logout");

  // --- the auth gate ---
  await pin("me unauthenticated", "GET", "/api/v1/me");
  await pin("unknown api path unauthenticated", "GET", "/api/v1/nope");
  await pin("me forged cookie", "GET", "/api/v1/me", {
    cookie: "orator_session=op-1.9999999999.AAAA",
  });
  await pin("me expired cookie", "GET", "/api/v1/me", {
    cookie: `orator_session=${signSession("op-1", SECRET, 10, NOW - 60_000)}`,
  });
  await pin("me other secret", "GET", "/api/v1/me", {
    cookie: `orator_session=${signSession("op-1", "another-secret-another-secret-0000", undefined, NOW)}`,
  });
  await pin("me not allowlisted", "GET", "/api/v1/me", {
    cookie: `orator_session=${signSession("intruder", SECRET, undefined, NOW)}`,
  });
  await pin("me", "GET", "/api/v1/me", { cookie });
  await pin("unknown api path", "GET", "/api/v1/nope", { cookie });
  await pin("wrong method", "PUT", "/api/v1/me", { cookie });

  // --- API keys ---
  await pin("keys list empty", "GET", "/api/v1/keys", { cookie });
  const created = JSON.parse(
    await pin("keys create", "POST", "/api/v1/keys", { cookie, body: { name: "  Deck  " } }),
  ) as { key: string; id: number };
  await pin("keys create default name", "POST", "/api/v1/keys", { cookie, body: {} });
  await pin("keys create bad json", "POST", "/api/v1/keys", { cookie, raw: "{nope" });
  await pin("keys list", "GET", "/api/v1/keys", { cookie });
  const bearer = { authorization: `Bearer ${created.key}` };
  await pin("me by api key", "GET", "/api/v1/me", { headers: bearer });
  await pin("me by x-orator-key", "GET", "/api/v1/me", {
    headers: { "x-orator-key": created.key },
  });
  await pin("me wrong api key", "GET", "/api/v1/me", {
    headers: { authorization: "Bearer orator_wrong" },
  });
  await pin("me empty bearer", "GET", "/api/v1/me", { headers: { authorization: "Bearer " } });
  await pin("keys list by api key", "GET", "/api/v1/keys", { headers: bearer });
  await pin("keys create by api key", "POST", "/api/v1/keys", { headers: bearer, body: {} });
  await pin("keys revoke bad id", "DELETE", "/api/v1/keys/abc", { cookie });
  await pin("keys revoke missing", "DELETE", "/api/v1/keys/9999", { cookie });
  await pin("keys revoke", "DELETE", `/api/v1/keys/${created.id}`, { cookie });
  await pin("me revoked api key", "GET", "/api/v1/me", { headers: bearer });

  // --- collections ---
  await pin("collections create", "POST", "/api/v1/collections", {
    cookie,
    body: { name: "  Boss Fights ", ipOrGame: "PF2e" },
  });
  await pin("collections create blank", "POST", "/api/v1/collections", {
    cookie,
    body: { name: "  " },
  });
  await pin("collections create missing", "POST", "/api/v1/collections", { cookie, body: {} });
  await pin("collections list", "GET", "/api/v1/collections", { cookie });
  const collectionId = base.collections[0]?.id;
  await pin("collections rename", "PATCH", `/api/v1/collections/${collectionId}`, {
    cookie,
    body: { name: " Bosses " },
  });
  await pin("collections rename blank", "PATCH", `/api/v1/collections/${collectionId}`, {
    cookie,
    body: { name: "" },
  });
  await pin("collections rename missing", "PATCH", "/api/v1/collections/9999", {
    cookie,
    body: { name: "x" },
  });
  await pin("collections rename bad id", "PATCH", "/api/v1/collections/0", {
    cookie,
    body: { name: "x" },
  });
  await pin("collections delete missing", "DELETE", "/api/v1/collections/9999", { cookie });
  await pin("collections delete", "DELETE", `/api/v1/collections/${collectionId}`, { cookie });

  // --- tracks ---
  const t1 = await base.createTrack({ title: "Alpha", sourceType: "upload" });
  const t2 = await base.createTrack({
    title: "Beta",
    sourceType: "youtube",
    collectionId: collectionId ?? null,
  });
  await pin("tracks list", "GET", "/api/v1/tracks", { cookie });
  await pin(
    "tracks list filtered",
    "GET",
    `/api/v1/tracks?collection=${collectionId}&q=bet&page=1&limit=10`,
    {
      cookie,
    },
  );
  await pin("tracks get", "GET", `/api/v1/tracks/${t1.id}`, { cookie });
  await pin("tracks get missing", "GET", "/api/v1/tracks/9999", { cookie });
  await pin("tracks get bad id", "GET", "/api/v1/tracks/x", { cookie });
  await pin("tracks patch", "PATCH", `/api/v1/tracks/${t1.id}`, {
    cookie,
    body: { title: " Alpha Prime ", collectionId: null },
  });
  await pin("tracks patch blank title", "PATCH", `/api/v1/tracks/${t1.id}`, {
    cookie,
    body: { title: " " },
  });
  await pin("tracks patch missing", "PATCH", "/api/v1/tracks/9999", {
    cookie,
    body: { title: "x" },
  });
  await pin("tracks patch bad json", "PATCH", `/api/v1/tracks/${t1.id}`, { cookie, raw: "nope" });
  await pin("tracks bulk-move", "POST", "/api/v1/tracks/bulk-move", {
    cookie,
    body: { ids: [t1.id, t2.id], collectionId: null },
  });
  await pin("tracks bulk-move no ids", "POST", "/api/v1/tracks/bulk-move", {
    cookie,
    body: { ids: [] },
  });
  await pin("tracks bulk-move missing collection", "POST", "/api/v1/tracks/bulk-move", {
    cookie,
    body: { ids: [t1.id], collectionId: 9999 },
  });
  await pin("tracks bulk-rename preview", "POST", "/api/v1/tracks/bulk-rename", {
    cookie,
    body: { ids: [t1.id, t2.id, 9999], ops: [{ kind: "set", value: "BGM" }], preview: true },
  });
  await pin("tracks bulk-rename apply", "POST", "/api/v1/tracks/bulk-rename", {
    cookie,
    body: { ids: [t2.id], ops: [{ kind: "stripPrefix", value: "Be" }] },
  });
  await pin("tracks bulk-rename bad op", "POST", "/api/v1/tracks/bulk-rename", {
    cookie,
    body: { ids: [t2.id], ops: [{ kind: "explode" }] },
  });
  await pin("tracks bulk-rename missing ops", "POST", "/api/v1/tracks/bulk-rename", {
    cookie,
    body: { ids: [t2.id] },
  });
  await pin("tracks bulk-tag", "POST", "/api/v1/tracks/bulk-tag", {
    cookie,
    body: { ids: [t1.id, t2.id], addTags: ["calm", "boss"], removeTagIds: [3] },
  });
  await pin("tracks bulk-tag no ids", "POST", "/api/v1/tracks/bulk-tag", { cookie, body: {} });
  await pin("tracks bulk-delete", "POST", "/api/v1/tracks/bulk-delete", {
    cookie,
    body: { ids: [t1.id, 9999] },
  });
  await pin("tracks bulk-delete no ids", "POST", "/api/v1/tracks/bulk-delete", {
    cookie,
    body: { ids: "1" },
  });
  await pin("tracks delete", "DELETE", `/api/v1/tracks/${t2.id}`, { cookie });
  await pin("tracks delete missing", "DELETE", "/api/v1/tracks/9999", { cookie });

  // --- tags ---
  await pin("tags create", "POST", "/api/v1/tags", {
    cookie,
    body: { name: "ambient ", category: "mood" },
  });
  await pin("tags create blank", "POST", "/api/v1/tags", { cookie, body: { name: " " } });
  await pin("tags list", "GET", "/api/v1/tags", { cookie });
  const tagId = base.tagRows[0]?.id;
  await pin("tags patch", "PATCH", `/api/v1/tags/${tagId}`, {
    cookie,
    body: { name: " Ambient ", color: "#aabbcc" },
  });
  await pin("tags patch clear color", "PATCH", `/api/v1/tags/${tagId}`, {
    cookie,
    body: { color: null },
  });
  await pin("tags patch bad color", "PATCH", `/api/v1/tags/${tagId}`, {
    cookie,
    body: { color: "red" },
  });
  await pin("tags patch blank name", "PATCH", `/api/v1/tags/${tagId}`, {
    cookie,
    body: { name: "" },
  });
  await pin("tags patch missing", "PATCH", "/api/v1/tags/9999", { cookie, body: {} });
  await pin("tags delete", "DELETE", `/api/v1/tags/${tagId}`, { cookie });
  await pin("tags delete missing", "DELETE", "/api/v1/tags/9999", { cookie });

  // --- playlists ---
  await pin("playlists create", "POST", "/api/v1/playlists", {
    cookie,
    body: { name: " Combat " },
  });
  await pin("playlists create blank", "POST", "/api/v1/playlists", { cookie, body: {} });
  await pin("playlists list", "GET", "/api/v1/playlists", { cookie });
  const playlistId = base.playlistRows[0]?.id;
  await pin("playlists items", "PUT", `/api/v1/playlists/${playlistId}/items`, {
    cookie,
    body: { trackIds: [3, 1, 2] },
  });
  await pin("playlists items missing ids", "PUT", `/api/v1/playlists/${playlistId}/items`, {
    cookie,
    body: {},
  });
  await pin("playlists items missing playlist", "PUT", "/api/v1/playlists/9999/items", {
    cookie,
    body: {},
  });
  await pin("playlists get", "GET", `/api/v1/playlists/${playlistId}`, { cookie });
  await pin("playlists get missing", "GET", "/api/v1/playlists/9999", { cookie });
  await pin("playlists patch", "PATCH", `/api/v1/playlists/${playlistId}`, {
    cookie,
    body: { name: "Combat II", loopMode: "playlist", shuffle: true },
  });
  await pin("playlists patch missing", "PATCH", "/api/v1/playlists/9999", { cookie, body: {} });
  await pin("playlists delete", "DELETE", `/api/v1/playlists/${playlistId}`, { cookie });
  await pin("playlists delete missing", "DELETE", "/api/v1/playlists/9999", { cookie });

  // --- playback ---
  await pin("playback now", "GET", "/api/v1/playback/now", { cookie });
  await pin("playback play ids", "POST", "/api/v1/playback/play", {
    cookie,
    body: { trackIds: [4, 5], channelId: "chan-9" },
  });
  await pin("playback play one", "POST", "/api/v1/playback/play", { cookie, body: { trackId: 4 } });
  await pin("playback play playlist", "POST", "/api/v1/playback/play", {
    cookie,
    body: { playlistId: 9999 },
  });
  await pin("playback play nothing", "POST", "/api/v1/playback/play", { cookie, body: {} });
  await pin("playback play bad json", "POST", "/api/v1/playback/play", { cookie, raw: "[" });
  await pin("playback stop", "POST", "/api/v1/playback/stop", { cookie });
  await pin("playback prev error status", "POST", "/api/v1/playback/prev", { cookie });
  await pin("playback loop", "POST", "/api/v1/playback/loop", { cookie, body: { mode: "track" } });
  await pin("playback loop invalid", "POST", "/api/v1/playback/loop", {
    cookie,
    body: { mode: "forever" },
  });
  await pin("voice join no body", "POST", "/api/v1/voice/join", { cookie });
  await pin("voice join channel", "POST", "/api/v1/voice/join", {
    cookie,
    body: { channelId: "chan-3" },
  });
  await pin("voice debug", "GET", "/api/v1/voice/debug", { cookie });
  await pin("playback by api key after revoke", "GET", "/api/v1/playback/now", { headers: bearer });
  await pin("playback unavailable", "GET", "/api/v1/playback/now", { cookie }, bare);
  await pin("voice debug unavailable", "GET", "/api/v1/voice/debug", { cookie }, bare);

  // --- ingest ---
  await pin("ingest youtube", "POST", "/api/v1/ingest/youtube", {
    cookie,
    body: { url: " https://youtu.be/x ", collectionId: 2 },
  });
  await pin("ingest youtube blank", "POST", "/api/v1/ingest/youtube", {
    cookie,
    body: { url: "" },
  });
  await pin(
    "ingest youtube unavailable",
    "POST",
    "/api/v1/ingest/youtube",
    { cookie, body: {} },
    bare,
  );
  await pin("ingest upload not multipart", "POST", "/api/v1/ingest/upload", { cookie, body: {} });
  await pin("ingest upload no files", "POST", "/api/v1/ingest/upload", {
    cookie,
    raw: new FormData(),
  });
  const job = await base.createDownloadJob({ type: "single", sourceUrl: "https://youtu.be/y" });
  await pin("ingest jobs", "GET", "/api/v1/ingest/jobs", { cookie });
  await pin("ingest job", "GET", `/api/v1/ingest/jobs/${job.id}`, { cookie });
  await pin("ingest job missing", "GET", "/api/v1/ingest/jobs/9999", { cookie });
  await pin("ingest job events", "GET", `/api/v1/ingest/jobs/${job.id}/events`, { cookie });
  await pin("ingest job events missing", "GET", "/api/v1/ingest/jobs/9999/events", { cookie });
  await pin(
    "ingest job events unavailable",
    "GET",
    `/api/v1/ingest/jobs/${job.id}/events`,
    { cookie },
    bare,
  );

  // --- static SPA ---
  await pin("spa root", "GET", "/");
  await pin("spa asset", "GET", "/app.js");
  await pin("spa client route", "GET", "/library/deep");
  await pin("spa traversal", "GET", "/..%2f..%2fetc%2fpasswd");
  await pin("spa HEAD", "HEAD", "/");
  await pin("non-GET outside the api", "POST", "/somewhere");
});

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
