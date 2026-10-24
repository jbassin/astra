/**
 * The real {@link PostgresStore} and its migrations against a real Postgres. Runs only when
 * ASTRA_TEST_DATABASE_URL names a throwaway server: `just pg-test` starts one, and the CI
 * pg-test job uses a `services: postgres` container. Each suite works in its own scratch
 * database (@astra/pg-migrate/testing). Never point it at the live `orator-postgres`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createScratchDatabase,
  type ScratchDatabase,
  TEST_DATABASE_URL,
} from "@astra/pg-migrate/testing";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { MIGRATIONS_DIR, PostgresStore } from "./store";

const TABLES = [
  "api_keys",
  "collections",
  "download_job_items",
  "download_jobs",
  "playlist_items",
  "playlists",
  "schema_migrations",
  "tags",
  "track_tags",
  "tracks",
];

describe.skipIf(TEST_DATABASE_URL === undefined)("PostgresStore (real Postgres)", () => {
  let db: ScratchDatabase;
  let store: PostgresStore;
  let sql: postgres.Sql;

  beforeAll(async () => {
    db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
    store = new PostgresStore(db.url);
    sql = postgres(db.url);
    const first = await store.migrate();
    expect(first.applied.map((m) => m.file)).toEqual(["0001_initial.sql"]);
    expect((await store.migrate()).applied).toEqual([]);
  });

  afterAll(async () => {
    await store.close();
    await sql.end();
    await db.drop();
  });

  test("ping answers while the database is up (the /healthz probe)", async () => {
    await expect(store.ping()).resolves.toBeUndefined();
  });

  test("the migrations create the library tables with by-default identity ids", async () => {
    const tables = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`;
    expect(tables.map((r) => r.table_name as string)).toEqual(TABLES);
    // `by default`, not `always`: an import can insert explicit ids (README trap).
    const ids = await sql`
      select distinct identity_generation from information_schema.columns
      where table_schema = 'public' and is_identity = 'YES'`;
    expect(ids.map((r) => r.identity_generation as string)).toEqual(["BY DEFAULT"]);
  });

  test("collections: unique slugs, rename, delete leaves tracks unfiled", async () => {
    const a = await store.createCollection({ name: "Dark Souls" });
    const b = await store.createCollection({ name: "Dark Souls", ipOrGame: "FromSoft" });
    expect([a.slug, b.slug]).toEqual(["dark-souls", "dark-souls-2"]);
    expect(b.ip_or_game).toBe("FromSoft");
    expect(typeof a.created_at).toBe("string");
    expect(await store.renameCollection(a.id, "Ash")).toBe(true);
    expect((await store.getCollection(a.id))?.name).toBe("Ash");
    expect((await store.listCollections()).map((c) => c.name)).toEqual(["Ash", "Dark Souls"]);

    const t = await store.createTrack({
      title: "Firelink",
      sourceType: "upload",
      collectionId: b.id,
    });
    expect(await store.deleteCollection(b.id)).toBe(true);
    expect(await store.deleteCollection(b.id)).toBe(false);
    expect((await store.getTrack(t.id))?.collection_id).toBeNull();
  });

  test("tracks: insert, filters, title edits, loudness, error mark, delete", async () => {
    const c = await store.createCollection({ name: "Hollow Knight" });
    const t = await store.createTrack({
      title: "Dirtmouth",
      sourceType: "youtube",
      sourceVideoId: "vid-dirtmouth",
      collectionId: c.id,
      filePath: "hk/dirtmouth.opus",
      durationMs: 120_000,
      fileSize: 5_000_000,
      loudnessLufs: -14.5,
    });
    expect(t).toMatchObject({
      title: "Dirtmouth",
      original_title: "Dirtmouth",
      status: "ready",
      duration_ms: 120_000,
      file_size: 5_000_000,
      loudness_lufs: -14.5,
    });
    await store.createTrack({ title: "City of Tears", sourceType: "upload", collectionId: c.id });

    expect((await store.findTrackByVideoId("vid-dirtmouth"))?.id).toBe(t.id);
    expect(await store.findTrackByVideoId("nope")).toBeNull();
    const inC = await store.listTracks({ collectionId: c.id });
    expect(inC.map((x) => x.title)).toEqual(["City of Tears", "Dirtmouth"]);
    expect((await store.listTracks({ q: "dirt" })).map((x) => x.id)).toEqual([t.id]);
    expect(await store.listTracks({ collectionId: c.id, limit: 1, offset: 1 })).toHaveLength(1);

    expect(await store.updateTrackTitle(t.id, "Dirtmouth (Town)")).toBe(true);
    expect(
      await store.bulkUpdateTitles([
        { id: t.id, title: "Dirtmouth" },
        { id: 999_999, title: "missing" },
      ]),
    ).toBe(1);
    expect(await store.setTrackLoudness(t.id, -16)).toBe(true);
    await store.markTrackError(t.id);
    const after = await store.getTrack(t.id);
    expect(after).toMatchObject({ title: "Dirtmouth", loudness_lufs: -16, status: "error" });
    expect(await store.setTrackCollection(t.id, null)).toBe(true);

    expect(await store.deleteTrack(t.id)).toEqual({ filePath: "hk/dirtmouth.opus" });
    expect(await store.deleteTrack(t.id)).toBeNull();
  });

  test("tags: normalized upsert, counts, add/remove, edit, cascade on delete", async () => {
    const t1 = await store.createTrack({ title: "Boss A", sourceType: "upload" });
    const t2 = await store.createTrack({ title: "Boss B", sourceType: "upload" });
    const tag = await store.upsertTag("  Boss   Fight ", "mood");
    expect(tag.name).toBe("boss fight");
    expect((await store.upsertTag("boss fight")).id).toBe(tag.id);
    const calm = await store.upsertTag("calm");

    expect(await store.addTagsToTracks([t1.id, t2.id], [tag.id])).toBe(2);
    expect(await store.addTagsToTracks([t1.id], [tag.id, calm.id])).toBe(1); // dup skipped
    const counts = Object.fromEntries((await store.listTags()).map((x) => [x.name, x.track_count]));
    expect(counts).toMatchObject({ "boss fight": 2, calm: 1 });
    expect((await store.tagsForTrack(t1.id)).map((x) => x.name)).toEqual(["boss fight", "calm"]);
    expect((await store.listTracks({ tagId: calm.id })).map((x) => x.id)).toEqual([t1.id]);

    expect(await store.removeTagsFromTracks([t1.id, t2.id], [tag.id])).toBe(2);
    expect(await store.updateTag(calm.id, { name: "Serene", color: "#88aaff" })).toMatchObject({
      name: "serene",
      color: "#88aaff",
    });
    expect(await store.updateTag(999_999, { color: null })).toBeNull();

    expect(await store.deleteTag(calm.id)).toBe(true);
    expect(await store.tagsForTrack(t1.id)).toEqual([]);
    // Deleting a track cascades its track_tags rows.
    await store.addTagsToTracks([t2.id], [tag.id]);
    await store.deleteTrack(t2.id);
    const [left] = await sql`select count(*)::int as n from track_tags where track_id = ${t2.id}`;
    expect(left?.n).toBe(0);
  });

  test("playlists: create, patch, ordered items, cascade on delete", async () => {
    const a = await store.createTrack({ title: "One", sourceType: "upload" });
    const b = await store.createTrack({ title: "Two", sourceType: "upload" });
    const p = await store.createPlaylist("Session 12");
    expect(p).toMatchObject({ name: "Session 12", loop_mode: "none", shuffle: 0 });
    expect(await store.updatePlaylist(p.id, {})).toBe(false);
    expect(await store.updatePlaylist(p.id, { loopMode: "playlist", shuffle: true })).toBe(true);
    expect(await store.getPlaylist(p.id)).toMatchObject({ loop_mode: "playlist", shuffle: 1 });

    await store.setPlaylistItems(p.id, [b.id, a.id, b.id]);
    expect(await store.playlistTrackIds(p.id)).toEqual([b.id, a.id, b.id]);
    await store.setPlaylistItems(p.id, [a.id]);
    expect(await store.playlistTrackIds(p.id)).toEqual([a.id]);
    expect((await store.listPlaylists()).map((x) => x.id)).toContain(p.id);

    expect(await store.deletePlaylist(p.id)).toBe(true);
    const [left] =
      await sql`select count(*)::int as n from playlist_items where playlist_id = ${p.id}`;
    expect(left?.n).toBe(0);
  });

  test("download jobs: create, status array filter, patch, items", async () => {
    const j1 = await store.createDownloadJob({ type: "playlist", sourceUrl: "https://y/list" });
    const j2 = await store.createDownloadJob({ type: "single", sourceUrl: "https://y/one" });
    expect(j1).toMatchObject({ status: "queued", total_items: 0, completed_items: 0 });
    await store.updateDownloadJob(j2.id, { status: "running", title: "One" });
    await store.updateDownloadJob(j2.id, {}); // no-op

    // `status = any($1)` with a real array param (the wire bug D11 fixed).
    const byStatus = await store.listJobsByStatus(["queued", "running"]);
    expect(byStatus.map((j) => j.id)).toEqual([j1.id, j2.id]);
    expect((await store.listJobsByStatus(["running"])).map((j) => j.id)).toEqual([j2.id]);
    expect(await store.listJobsByStatus([])).toEqual([]);
    expect((await store.listDownloadJobs(1)).map((j) => j.id)).toEqual([j2.id]);

    const track = await store.createTrack({ title: "Item", sourceType: "youtube" });
    const i1 = await store.addJobItem({ jobId: j1.id, videoId: "v1", title: "A", position: 1 });
    await store.addJobItem({ jobId: j1.id, videoId: "v0", title: "B", position: 0 });
    await store.updateJobItem(i1.id, { status: "done", progressPct: 100, trackId: track.id });
    const items = await store.listJobItems(j1.id);
    expect(items.map((i) => i.video_id)).toEqual(["v0", "v1"]);
    expect(items[1]).toMatchObject({ status: "done", progress_pct: 100, track_id: track.id });

    await store.updateDownloadJob(j1.id, { status: "done", totalItems: 2, completedItems: 2 });
    expect(await store.getDownloadJob(j1.id)).toMatchObject({
      status: "done",
      total_items: 2,
      completed_items: 2,
    });
  });

  test("api keys: create, list, lookup by hash, touch, revoke once", async () => {
    const k = await store.createApiKey({
      userId: "u1",
      name: "deck",
      keyHash: "hash-1",
      keyPrefix: "orator_ab",
    });
    expect(k.last_used_at).toBeNull();
    expect((await store.listApiKeys("u1")).map((x) => x.id)).toEqual([k.id]);
    expect((await store.getApiKeyByHash("hash-1"))?.id).toBe(k.id);
    await store.touchApiKey(k.id);
    expect((await store.getApiKeyByHash("hash-1"))?.last_used_at).not.toBeNull();
    expect(await store.revokeApiKey(k.id, "someone-else")).toBe(false);
    expect(await store.revokeApiKey(k.id, "u1")).toBe(true);
    expect(await store.revokeApiKey(k.id, "u1")).toBe(false);
    await expect(
      store.createApiKey({ userId: "u2", name: "dup", keyHash: "hash-1", keyPrefix: "x" }),
    ).rejects.toThrow(/unique/);
  });
});

// The live upgrade path: a database built by the old boot-time `create table if not exists`
// block, with rows in it, adopts migration 0001 without changing anything.
describe.skipIf(TEST_DATABASE_URL === undefined)("0001 over a pre-ledger database", () => {
  test("only records itself; the rows stay", async () => {
    const db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
    const sql = postgres(db.url, { onnotice: () => {} });
    const store = new PostgresStore(db.url);
    try {
      await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, "0001_initial.sql"), "utf8"));
      await sql`insert into collections (name, slug) values ('Old', 'old')`;
      const r = await store.migrate();
      expect(r.applied.map((m) => m.file)).toEqual(["0001_initial.sql"]);
      const [n] = await sql`select count(*)::int as n from collections`;
      expect(n?.n).toBe(1);
    } finally {
      await store.close();
      await sql.end();
      await db.drop();
    }
  });
});
