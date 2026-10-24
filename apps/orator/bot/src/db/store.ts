/**
 * The orator music-library store — the **async Postgres** port of faerrin
 * `pkg/lark/src/db/repo.ts` (which was synchronous `bun:sqlite`). Decision F.
 *
 * Two layers:
 *  - `LibraryStore` — the async surface the routes / playback / ingest code against;
 *    injectable so their logic unit-tests with a fake (weal-bot's precedent).
 *  - `PostgresStore` — the postgres.js (porsager) wire implementation (R3, 0022 S8
 *    — off Bun's built-in `SQL`, which required a live Bun runtime; D11). Its schema
 *    is the numbered files in `migrations/`, and `store.pg.test.ts` runs it against a
 *    throwaway Postgres (`just pg-test`, the CI pg-test job).
 *
 * Port notes: every `bun:sqlite` call became `async`; `lastInsertRowid` → `RETURNING`;
 * `changes > 0` → `RETURNING id` then `rows.length > 0`; `INSERT OR IGNORE` →
 * `ON CONFLICT DO NOTHING`; `COLLATE NOCASE` → `lower(...)`; `db.transaction(fn)()` →
 * `sql.begin(async tx => …)`; timestamps cast `::text` so row shapes stay strings.
 */
import { resolve } from "node:path";

import { findPackageRoot } from "@astra/config";
import { loadMigrations, migrate, type MigrateResult } from "@astra/pg-migrate";
import postgres from "postgres";

import type {
  Collection,
  DownloadJob,
  DownloadJobItem,
  Playlist,
  Tag,
  TagWithCount,
  Track,
} from "../api/types";
import { normalizeTag, slugify, uniqueSlug } from "../lib/text";

/** The numbered schema migrations (`NNNN_name.sql`), applied at boot by {@link PostgresStore.migrate}. */
export const MIGRATIONS_DIR = resolve(findPackageRoot(import.meta.dirname), "migrations");

// --- row types: the API sends these rows as they are, so they live with the other API shapes in
// ../api/types.ts, which the SPA imports too. ApiKey stays here: its hash never leaves the server.

export type { Collection, DownloadJob, DownloadJobItem, Playlist, Tag, Track } from "../api/types";

export interface ApiKey {
  id: number;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

// --- input shapes ---

export interface NewCollection {
  name: string;
  ipOrGame?: string | null;
  sourceType?: "manual" | "youtube_playlist";
  sourceUrl?: string | null;
}

export interface NewTrack {
  collectionId?: number | null;
  title: string;
  originalTitle?: string;
  sourceType: "upload" | "youtube";
  sourceUrl?: string | null;
  sourceVideoId?: string | null;
  filePath?: string | null;
  format?: string | null;
  durationMs?: number | null;
  fileSize?: number | null;
  loudnessLufs?: number | null;
  status?: "ready" | "downloading" | "error";
}

export interface TrackFilter {
  collectionId?: number;
  tagId?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface NewDownloadJob {
  type: "single" | "playlist";
  sourceUrl: string;
  title?: string | null;
  collectionId?: number | null;
}

/**
 * The narrow surface the playback engine needs — just track lookup + the
 * file-missing/play-failed error marker. Kept separate so the engine's tests
 * inject a 2-method fake instead of the whole {@link LibraryStore}.
 */
export interface PlaybackStore {
  getTrack(id: number): Promise<Track | null>;
  markTrackError(id: number): Promise<void>;
}

/** The async persistence surface (the routes/playback/ingest inject this). */
export interface LibraryStore extends PlaybackStore {
  /** Resolves when the database answers a trivial query (the `/healthz` readiness probe). */
  ping(): Promise<void>;

  // collections
  createCollection(input: NewCollection): Promise<Collection>;
  getCollection(id: number): Promise<Collection | null>;
  listCollections(): Promise<Collection[]>;
  renameCollection(id: number, name: string): Promise<boolean>;
  deleteCollection(id: number): Promise<boolean>;

  // tracks
  createTrack(t: NewTrack): Promise<Track>;
  findTrackByVideoId(videoId: string): Promise<Track | null>;
  listTracks(f?: TrackFilter): Promise<Track[]>;
  updateTrackTitle(id: number, title: string): Promise<boolean>;
  bulkUpdateTitles(updates: { id: number; title: string }[]): Promise<number>;
  setTrackCollection(id: number, collectionId: number | null): Promise<boolean>;
  setTrackLoudness(id: number, lufs: number): Promise<boolean>;
  deleteTrack(id: number): Promise<{ filePath: string | null } | null>;

  // tags
  upsertTag(name: string, category?: string | null): Promise<Tag>;
  listTags(): Promise<TagWithCount[]>;
  tagsForTrack(trackId: number): Promise<Tag[]>;
  /** Every listed track's tags in one query; a track with none maps to []. */
  tagsForTracks(trackIds: number[]): Promise<Map<number, Tag[]>>;
  addTagsToTracks(trackIds: number[], tagIds: number[]): Promise<number>;
  removeTagsFromTracks(trackIds: number[], tagIds: number[]): Promise<number>;
  deleteTag(id: number): Promise<boolean>;
  updateTag(id: number, patch: { name?: string; color?: string | null }): Promise<Tag | null>;

  // playlists
  createPlaylist(name: string): Promise<Playlist>;
  getPlaylist(id: number): Promise<Playlist | null>;
  listPlaylists(): Promise<Playlist[]>;
  updatePlaylist(
    id: number,
    patch: { name?: string; loopMode?: "none" | "track" | "playlist"; shuffle?: boolean },
  ): Promise<boolean>;
  deletePlaylist(id: number): Promise<boolean>;
  setPlaylistItems(playlistId: number, trackIds: number[]): Promise<void>;
  playlistTrackIds(playlistId: number): Promise<number[]>;

  // download jobs
  createDownloadJob(input: NewDownloadJob): Promise<DownloadJob>;
  getDownloadJob(id: number): Promise<DownloadJob | null>;
  listDownloadJobs(limit?: number): Promise<DownloadJob[]>;
  /** Jobs in any of the given statuses, id-ordered (resume recovery). */
  listJobsByStatus(statuses: DownloadJob["status"][]): Promise<DownloadJob[]>;
  updateDownloadJob(
    id: number,
    patch: {
      status?: DownloadJob["status"];
      completedItems?: number;
      totalItems?: number;
      error?: string | null;
      title?: string | null;
      collectionId?: number | null;
    },
  ): Promise<void>;
  addJobItem(input: {
    jobId: number;
    videoId: string;
    title: string;
    position: number;
  }): Promise<DownloadJobItem>;
  listJobItems(jobId: number): Promise<DownloadJobItem[]>;
  updateJobItem(
    id: number,
    patch: {
      status?: DownloadJobItem["status"];
      progressPct?: number;
      error?: string | null;
      trackId?: number | null;
    },
  ): Promise<void>;

  // api keys
  createApiKey(input: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
  }): Promise<ApiKey>;
  listApiKeys(userId: string): Promise<ApiKey[]>;
  getApiKeyByHash(hash: string): Promise<ApiKey | null>;
  revokeApiKey(id: number, userId: string): Promise<boolean>;
  touchApiKey(id: number): Promise<void>;
}

// --- column lists (timestamps cast to ISO-ish text so row fields stay strings) ---

const C =
  "id, name, slug, ip_or_game, source_type, source_url, cover_url, created_at::text, updated_at::text";
const T =
  "id, collection_id, title, original_title, source_type, source_url, source_video_id, file_path, format, duration_ms, file_size::float8 as file_size, loudness_lufs, status, error, added_at::text, updated_at::text";
const TAG = "id, name, category, color, created_at::text";
const PL = "id, name, loop_mode, shuffle, created_at::text, updated_at::text";
const JOB =
  "id, type, source_url, title, collection_id, status, total_items, completed_items, error, created_at::text, updated_at::text";
const JI = "id, job_id, video_id, title, position, status, progress_pct, error, track_id";
const KEY =
  "id, user_id, name, key_hash, key_prefix, created_at::text, last_used_at::text, revoked_at::text";

/**
 * Pure query-builder for {@link PostgresStore.listJobsByStatus} — extracted so its
 * SQL shape is unit-testable without a live PG connection (store.test.ts).
 *
 * D11 (0022 S8): postgres.js serializes an array param as a real Postgres array,
 * so the natural `status = any($1)` form works directly — restoring it and
 * DELETING the `in ($1, $2, …)` scalar-expansion this used to need. That
 * expansion was a Bun `SQL.unsafe`-only workaround (2c2fd10): Bun's `SQL.unsafe`
 * stringified a JS array param into a bad comma-joined literal ("queued,running"),
 * which Postgres rejected as a malformed array — postgres.js doesn't have that bug.
 */
export function listJobsByStatusQuery(statuses: DownloadJob["status"][]): {
  query: string;
  params: [DownloadJob["status"][]];
} {
  return {
    query: `select ${JOB} from download_jobs where status = any($1) order by id`,
    params: [statuses],
  };
}

/** postgres.js-backed Postgres implementation of {@link LibraryStore} (R3, 0022 S8 — off Bun.SQL onto the Node-runtime-portable postgres.js; tagged-template/`.unsafe` call sites are unchanged). */
export class PostgresStore implements LibraryStore {
  readonly #sql: postgres.Sql;

  /** `onQuery` sees every statement sent (tests count queries with it). */
  constructor(databaseUrl: string, opts: { onQuery?: (query: string) => void } = {}) {
    const { onQuery } = opts;
    this.#sql = postgres(databaseUrl, onQuery ? { debug: (_conn, query) => onQuery(query) } : {});
  }

  /** Apply pending migrations from {@link MIGRATIONS_DIR} (@astra/pg-migrate). */
  migrate(): Promise<MigrateResult> {
    return migrate(this.#sql, loadMigrations(MIGRATIONS_DIR));
  }

  async close(): Promise<void> {
    await this.#sql.end();
  }

  async ping(): Promise<void> {
    await this.#sql`select 1`;
  }

  #all<R>(query: string, params: unknown[] = []): Promise<R[]> {
    // postgres.js's `.unsafe` types params as `ParameterOrJSON<never>[]` (no plain
    // `unknown`); this store passes genuinely heterogeneous SQL params (numbers,
    // strings, nulls, and now — D11, R3 0022 S8 — arrays for `= any($1)`).
    return this.#sql.unsafe(query, params as never[]) as Promise<R[]>;
  }

  async #one<R>(query: string, params: unknown[] = []): Promise<R | null> {
    const rows = await this.#all<R>(query, params);
    return rows[0] ?? null;
  }

  /** Like {@link #one}, for `INSERT … RETURNING` where a row is guaranteed. */
  async #required<R>(query: string, params: unknown[] = []): Promise<R> {
    const row = await this.#one<R>(query, params);
    if (!row) throw new Error("expected a returned row but got none");
    return row;
  }

  // --- collections ---

  async createCollection(input: NewCollection): Promise<Collection> {
    const taken = new Set(
      (await this.#all<{ slug: string }>("select slug from collections")).map((r) => r.slug),
    );
    const slug = uniqueSlug(slugify(input.name), (s) => taken.has(s));
    return this.#required<Collection>(
      `insert into collections (name, slug, ip_or_game, source_type, source_url)
       values ($1, $2, $3, $4, $5) returning ${C}`,
      [
        input.name,
        slug,
        input.ipOrGame ?? null,
        input.sourceType ?? "manual",
        input.sourceUrl ?? null,
      ],
    );
  }

  getCollection(id: number): Promise<Collection | null> {
    return this.#one<Collection>(`select ${C} from collections where id = $1`, [id]);
  }

  listCollections(): Promise<Collection[]> {
    return this.#all<Collection>(`select ${C} from collections order by lower(name)`);
  }

  async renameCollection(id: number, name: string): Promise<boolean> {
    const rows = await this.#all(
      "update collections set name = $1, updated_at = now() where id = $2 returning id",
      [name, id],
    );
    return rows.length > 0;
  }

  async deleteCollection(id: number): Promise<boolean> {
    // tracks.collection_id is ON DELETE SET NULL — tracks/files survive (B15).
    const rows = await this.#all("delete from collections where id = $1 returning id", [id]);
    return rows.length > 0;
  }

  // --- tracks ---

  createTrack(t: NewTrack): Promise<Track> {
    return this.#required<Track>(
      `insert into tracks
         (collection_id, title, original_title, source_type, source_url, source_video_id,
          file_path, format, duration_ms, file_size, loudness_lufs, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning ${T}`,
      [
        t.collectionId ?? null,
        t.title,
        t.originalTitle ?? t.title,
        t.sourceType,
        t.sourceUrl ?? null,
        t.sourceVideoId ?? null,
        t.filePath ?? null,
        t.format ?? null,
        t.durationMs ?? null,
        t.fileSize ?? null,
        t.loudnessLufs ?? null,
        t.status ?? "ready",
      ],
    );
  }

  getTrack(id: number): Promise<Track | null> {
    return this.#one<Track>(`select ${T} from tracks where id = $1`, [id]);
  }

  findTrackByVideoId(videoId: string): Promise<Track | null> {
    return this.#one<Track>(`select ${T} from tracks where source_video_id = $1 limit 1`, [
      videoId,
    ]);
  }

  listTracks(f: TrackFilter = {}): Promise<Track[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    let from = "tracks t";
    if (f.tagId !== undefined) {
      params.push(f.tagId);
      from += ` join track_tags tt on tt.track_id = t.id and tt.tag_id = $${params.length}`;
    }
    if (f.collectionId !== undefined) {
      params.push(f.collectionId);
      where.push(`t.collection_id = $${params.length}`);
    }
    if (f.q) {
      params.push(`%${f.q}%`);
      where.push(`t.title ilike $${params.length}`);
    }
    const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
    const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);
    const offset = Math.max(f.offset ?? 0, 0);
    params.push(limit, offset);
    // track_tags' columns (track_id, tag_id) don't collide with any tracks column,
    // so the bare `${T}` list resolves unambiguously even with the join (lark's `t.*`).
    return this.#all<Track>(
      `select ${T} from ${from} ${whereSql} order by lower(title) limit $${params.length - 1} offset $${params.length}`,
      params,
    );
  }

  async updateTrackTitle(id: number, title: string): Promise<boolean> {
    const rows = await this.#all(
      "update tracks set title = $1, updated_at = now() where id = $2 returning id",
      [title, id],
    );
    return rows.length > 0;
  }

  async bulkUpdateTitles(updates: { id: number; title: string }[]): Promise<number> {
    let n = 0;
    await this.#sql.begin(async (tx) => {
      for (const u of updates) {
        const rows = (await tx.unsafe(
          "update tracks set title = $1, updated_at = now() where id = $2 returning id",
          [u.title, u.id],
        )) as unknown[];
        n += rows.length > 0 ? 1 : 0;
      }
    });
    return n;
  }

  async setTrackCollection(id: number, collectionId: number | null): Promise<boolean> {
    const rows = await this.#all(
      "update tracks set collection_id = $1, updated_at = now() where id = $2 returning id",
      [collectionId, id],
    );
    return rows.length > 0;
  }

  async setTrackLoudness(id: number, lufs: number): Promise<boolean> {
    const rows = await this.#all(
      "update tracks set loudness_lufs = $1, updated_at = now() where id = $2 returning id",
      [lufs, id],
    );
    return rows.length > 0;
  }

  async markTrackError(id: number): Promise<void> {
    await this.#all("update tracks set status = 'error', updated_at = now() where id = $1", [id]);
  }

  async deleteTrack(id: number): Promise<{ filePath: string | null } | null> {
    const row = await this.#one<{ file_path: string | null }>(
      "delete from tracks where id = $1 returning file_path", // track_tags cascade
      [id],
    );
    return row ? { filePath: row.file_path } : null;
  }

  // --- tags ---

  async upsertTag(name: string, category?: string | null): Promise<Tag> {
    const norm = normalizeTag(name);
    const existing = await this.#one<Tag>(`select ${TAG} from tags where name = $1`, [norm]);
    if (existing) return existing;
    return this.#required<Tag>(
      `insert into tags (name, category) values ($1, $2) returning ${TAG}`,
      [norm, category ?? null],
    );
  }

  listTags(): Promise<TagWithCount[]> {
    return this.#all<TagWithCount>(
      `select tags.id, tags.name, tags.category, tags.color, tags.created_at::text,
              count(track_tags.track_id)::int as track_count
       from tags left join track_tags on track_tags.tag_id = tags.id
       group by tags.id order by tags.name`,
    );
  }

  tagsForTrack(trackId: number): Promise<Tag[]> {
    return this.#all<Tag>(
      `select tags.id, tags.name, tags.category, tags.color, tags.created_at::text
       from tags join track_tags tt on tt.tag_id = tags.id where tt.track_id = $1 order by tags.name`,
      [trackId],
    );
  }

  async tagsForTracks(trackIds: number[]): Promise<Map<number, Tag[]>> {
    const byTrack = new Map<number, Tag[]>(trackIds.map((id) => [id, []]));
    if (trackIds.length === 0) return byTrack;
    const rows = await this.#all<Tag & { track_id: number }>(
      `select tt.track_id, tags.id, tags.name, tags.category, tags.color, tags.created_at::text
       from tags join track_tags tt on tt.tag_id = tags.id
       where tt.track_id = any($1::int[]) order by tags.name`,
      [trackIds],
    );
    for (const { track_id, ...tag } of rows) byTrack.get(track_id)?.push(tag);
    return byTrack;
  }

  async addTagsToTracks(trackIds: number[], tagIds: number[]): Promise<number> {
    if (trackIds.length === 0 || tagIds.length === 0) return 0;
    // One statement for every track × tag pair; `distinct` keeps a repeated id from
    // conflicting with itself inside the insert.
    const rows = await this.#all(
      `insert into track_tags (track_id, tag_id)
       select distinct t.id, g.id from unnest($1::int[]) as t(id) cross join unnest($2::int[]) as g(id)
       on conflict do nothing returning track_id`,
      [trackIds, tagIds],
    );
    return rows.length;
  }

  async removeTagsFromTracks(trackIds: number[], tagIds: number[]): Promise<number> {
    if (trackIds.length === 0 || tagIds.length === 0) return 0;
    const rows = await this.#all(
      `delete from track_tags where track_id = any($1::int[]) and tag_id = any($2::int[])
       returning track_id`,
      [trackIds, tagIds],
    );
    return rows.length;
  }

  async deleteTag(id: number): Promise<boolean> {
    const rows = await this.#all("delete from tags where id = $1 returning id", [id]);
    return rows.length > 0;
  }

  async updateTag(
    id: number,
    patch: { name?: string; color?: string | null },
  ): Promise<Tag | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(normalizeTag(patch.name));
      sets.push(`name = $${params.length}`);
    }
    if (patch.color !== undefined) {
      params.push(patch.color);
      sets.push(`color = $${params.length}`);
    }
    if (sets.length > 0) {
      params.push(id);
      await this.#all(`update tags set ${sets.join(", ")} where id = $${params.length}`, params);
    }
    return this.#one<Tag>(`select ${TAG} from tags where id = $1`, [id]);
  }

  // --- playlists ---

  createPlaylist(name: string): Promise<Playlist> {
    return this.#required<Playlist>(`insert into playlists (name) values ($1) returning ${PL}`, [
      name,
    ]);
  }

  getPlaylist(id: number): Promise<Playlist | null> {
    return this.#one<Playlist>(`select ${PL} from playlists where id = $1`, [id]);
  }

  listPlaylists(): Promise<Playlist[]> {
    return this.#all<Playlist>(`select ${PL} from playlists order by lower(name)`);
  }

  async updatePlaylist(
    id: number,
    patch: { name?: string; loopMode?: "none" | "track" | "playlist"; shuffle?: boolean },
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.loopMode !== undefined) {
      params.push(patch.loopMode);
      sets.push(`loop_mode = $${params.length}`);
    }
    if (patch.shuffle !== undefined) {
      params.push(patch.shuffle ? 1 : 0);
      sets.push(`shuffle = $${params.length}`);
    }
    if (sets.length === 0) return false;
    params.push(id);
    sets.push("updated_at = now()");
    const rows = await this.#all(
      `update playlists set ${sets.join(", ")} where id = $${params.length} returning id`,
      params,
    );
    return rows.length > 0;
  }

  async deletePlaylist(id: number): Promise<boolean> {
    const rows = await this.#all("delete from playlists where id = $1 returning id", [id]);
    return rows.length > 0;
  }

  async setPlaylistItems(playlistId: number, trackIds: number[]): Promise<void> {
    await this.#sql.begin(async (tx) => {
      await tx.unsafe("delete from playlist_items where playlist_id = $1", [playlistId]);
      // One insert for the whole list; `with ordinality` numbers the ids from 1 in list order.
      if (trackIds.length > 0)
        await tx.unsafe(
          `insert into playlist_items (playlist_id, track_id, position)
           select $1, u.track_id, u.n - 1 from unnest($2::int[]) with ordinality as u(track_id, n)`,
          [playlistId, trackIds] as never[],
        );
      await tx.unsafe("update playlists set updated_at = now() where id = $1", [playlistId]);
    });
  }

  async playlistTrackIds(playlistId: number): Promise<number[]> {
    const rows = await this.#all<{ track_id: number }>(
      "select track_id from playlist_items where playlist_id = $1 order by position",
      [playlistId],
    );
    return rows.map((r) => r.track_id);
  }

  // --- download jobs ---

  createDownloadJob(input: NewDownloadJob): Promise<DownloadJob> {
    return this.#required<DownloadJob>(
      `insert into download_jobs (type, source_url, title, collection_id, status)
       values ($1, $2, $3, $4, 'queued') returning ${JOB}`,
      [input.type, input.sourceUrl, input.title ?? null, input.collectionId ?? null],
    );
  }

  getDownloadJob(id: number): Promise<DownloadJob | null> {
    return this.#one<DownloadJob>(`select ${JOB} from download_jobs where id = $1`, [id]);
  }

  listDownloadJobs(limit = 25): Promise<DownloadJob[]> {
    return this.#all<DownloadJob>(`select ${JOB} from download_jobs order by id desc limit $1`, [
      limit,
    ]);
  }

  listJobsByStatus(statuses: DownloadJob["status"][]): Promise<DownloadJob[]> {
    if (statuses.length === 0) return Promise.resolve([]);
    const { query, params } = listJobsByStatusQuery(statuses);
    return this.#all<DownloadJob>(query, params);
  }

  async updateDownloadJob(
    id: number,
    patch: {
      status?: DownloadJob["status"];
      completedItems?: number;
      totalItems?: number;
      error?: string | null;
      title?: string | null;
      collectionId?: number | null;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.status !== undefined) push("status", patch.status);
    if (patch.completedItems !== undefined) push("completed_items", patch.completedItems);
    if (patch.totalItems !== undefined) push("total_items", patch.totalItems);
    if (patch.error !== undefined) push("error", patch.error);
    if (patch.title !== undefined) push("title", patch.title);
    if (patch.collectionId !== undefined) push("collection_id", patch.collectionId);
    if (sets.length === 0) return;
    params.push(id);
    sets.push("updated_at = now()");
    await this.#all(
      `update download_jobs set ${sets.join(", ")} where id = $${params.length}`,
      params,
    );
  }

  addJobItem(input: {
    jobId: number;
    videoId: string;
    title: string;
    position: number;
  }): Promise<DownloadJobItem> {
    return this.#required<DownloadJobItem>(
      `insert into download_job_items (job_id, video_id, title, position) values ($1, $2, $3, $4) returning ${JI}`,
      [input.jobId, input.videoId, input.title, input.position],
    );
  }

  listJobItems(jobId: number): Promise<DownloadJobItem[]> {
    return this.#all<DownloadJobItem>(
      `select ${JI} from download_job_items where job_id = $1 order by position`,
      [jobId],
    );
  }

  async updateJobItem(
    id: number,
    patch: {
      status?: DownloadJobItem["status"];
      progressPct?: number;
      error?: string | null;
      trackId?: number | null;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.status !== undefined) push("status", patch.status);
    if (patch.progressPct !== undefined) push("progress_pct", patch.progressPct);
    if (patch.error !== undefined) push("error", patch.error);
    if (patch.trackId !== undefined) push("track_id", patch.trackId);
    if (sets.length === 0) return;
    params.push(id);
    await this.#all(
      `update download_job_items set ${sets.join(", ")} where id = $${params.length}`,
      params,
    );
  }

  // --- api keys ---

  createApiKey(input: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
  }): Promise<ApiKey> {
    return this.#required<ApiKey>(
      `insert into api_keys (user_id, name, key_hash, key_prefix) values ($1, $2, $3, $4) returning ${KEY}`,
      [input.userId, input.name, input.keyHash, input.keyPrefix],
    );
  }

  listApiKeys(userId: string): Promise<ApiKey[]> {
    return this.#all<ApiKey>(`select ${KEY} from api_keys where user_id = $1 order by id desc`, [
      userId,
    ]);
  }

  getApiKeyByHash(hash: string): Promise<ApiKey | null> {
    return this.#one<ApiKey>(`select ${KEY} from api_keys where key_hash = $1`, [hash]);
  }

  async revokeApiKey(id: number, userId: string): Promise<boolean> {
    const rows = await this.#all(
      "update api_keys set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning id",
      [id, userId],
    );
    return rows.length > 0;
  }

  async touchApiKey(id: number): Promise<void> {
    await this.#all("update api_keys set last_used_at = now() where id = $1", [id]);
  }
}
