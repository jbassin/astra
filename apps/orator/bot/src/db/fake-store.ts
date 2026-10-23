/**
 * An in-memory `LibraryStore` test double. lark tested its routes/ingest against
 * an in-memory `bun:sqlite`; astra's store is async Postgres, so CI uses this Map-
 * backed fake instead (weal-bot's "no live PG in CI" precedent). It reproduces the
 * *relational behavior* the auth + ingest + upload tests rely on (collections,
 * tracks, download jobs/items, API keys); the PostgresStore's SQL-dialect
 * correctness is validated separately at slice-6 integration.
 *
 * Tags + playlists are not exercised by these tests, so they stay `notImpl()`.
 * Not imported by any runtime code — only by `*.test.ts`.
 */
import { slugify, uniqueSlug } from "../lib/text";
import type {
  ApiKey,
  Collection,
  DownloadJob,
  DownloadJobItem,
  LibraryStore,
  NewCollection,
  NewDownloadJob,
  NewTrack,
  Playlist,
  Tag,
  Track,
  TrackFilter,
} from "./store";

function notImpl<T>(name: string): T {
  throw new Error(`FakeStore.${name} not implemented`);
}

const TS = "2026-01-01T00:00:00";

export class FakeStore implements LibraryStore {
  readonly keys: ApiKey[] = [];
  collections: Collection[] = [];
  tracks: Track[] = [];
  jobs: DownloadJob[] = [];
  items: DownloadJobItem[] = [];
  #seq = 0;
  #id(): number {
    return ++this.#seq;
  }

  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }

  // --- collections ---
  createCollection(input: NewCollection): Promise<Collection> {
    const taken = new Set(this.collections.map((c) => c.slug));
    const c: Collection = {
      id: this.#id(),
      name: input.name,
      slug: uniqueSlug(slugify(input.name), (s) => taken.has(s)),
      ip_or_game: input.ipOrGame ?? null,
      source_type: input.sourceType ?? "manual",
      source_url: input.sourceUrl ?? null,
      cover_url: null,
      created_at: TS,
      updated_at: TS,
    };
    this.collections.push(c);
    return Promise.resolve(c);
  }
  getCollection(id: number): Promise<Collection | null> {
    return Promise.resolve(this.collections.find((c) => c.id === id) ?? null);
  }
  listCollections(): Promise<Collection[]> {
    return Promise.resolve([...this.collections].sort((a, b) => a.name.localeCompare(b.name)));
  }

  // --- tracks ---
  createTrack(t: NewTrack): Promise<Track> {
    const row: Track = {
      id: this.#id(),
      collection_id: t.collectionId ?? null,
      title: t.title,
      original_title: t.originalTitle ?? t.title,
      source_type: t.sourceType,
      source_url: t.sourceUrl ?? null,
      source_video_id: t.sourceVideoId ?? null,
      file_path: t.filePath ?? null,
      format: t.format ?? null,
      duration_ms: t.durationMs ?? null,
      file_size: t.fileSize ?? null,
      loudness_lufs: t.loudnessLufs ?? null,
      status: t.status ?? "ready",
      error: null,
      added_at: TS,
      updated_at: TS,
    };
    this.tracks.push(row);
    return Promise.resolve(row);
  }
  getTrack(id: number): Promise<Track | null> {
    return Promise.resolve(this.tracks.find((t) => t.id === id) ?? null);
  }
  findTrackByVideoId(videoId: string): Promise<Track | null> {
    return Promise.resolve(this.tracks.find((t) => t.source_video_id === videoId) ?? null);
  }
  listTracks(f: TrackFilter = {}): Promise<Track[]> {
    let rows = [...this.tracks];
    if (f.collectionId !== undefined) rows = rows.filter((t) => t.collection_id === f.collectionId);
    if (f.q) {
      const q = f.q.toLowerCase();
      rows = rows.filter((t) => t.title.toLowerCase().includes(q));
    }
    rows.sort((a, b) => a.title.localeCompare(b.title));
    const offset = Math.max(f.offset ?? 0, 0);
    const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);
    return Promise.resolve(rows.slice(offset, offset + limit));
  }
  markTrackError(id: number): Promise<void> {
    const t = this.tracks.find((x) => x.id === id);
    if (t) t.status = "error";
    return Promise.resolve();
  }

  // --- download jobs ---
  createDownloadJob(input: NewDownloadJob): Promise<DownloadJob> {
    const j: DownloadJob = {
      id: this.#id(),
      type: input.type,
      source_url: input.sourceUrl,
      title: input.title ?? null,
      collection_id: input.collectionId ?? null,
      status: "queued",
      total_items: 0,
      completed_items: 0,
      error: null,
      created_at: TS,
      updated_at: TS,
    };
    this.jobs.push(j);
    return Promise.resolve(j);
  }
  getDownloadJob(id: number): Promise<DownloadJob | null> {
    return Promise.resolve(this.jobs.find((j) => j.id === id) ?? null);
  }
  listDownloadJobs(limit = 25): Promise<DownloadJob[]> {
    return Promise.resolve([...this.jobs].sort((a, b) => b.id - a.id).slice(0, limit));
  }
  listJobsByStatus(statuses: DownloadJob["status"][]): Promise<DownloadJob[]> {
    return Promise.resolve(
      this.jobs.filter((j) => statuses.includes(j.status)).sort((a, b) => a.id - b.id),
    );
  }
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
  ): Promise<void> {
    const j = this.jobs.find((x) => x.id === id);
    if (j) {
      if (patch.status !== undefined) j.status = patch.status;
      if (patch.completedItems !== undefined) j.completed_items = patch.completedItems;
      if (patch.totalItems !== undefined) j.total_items = patch.totalItems;
      if (patch.error !== undefined) j.error = patch.error;
      if (patch.title !== undefined) j.title = patch.title;
      if (patch.collectionId !== undefined) j.collection_id = patch.collectionId;
    }
    return Promise.resolve();
  }
  addJobItem(input: {
    jobId: number;
    videoId: string;
    title: string;
    position: number;
  }): Promise<DownloadJobItem> {
    const it: DownloadJobItem = {
      id: this.#id(),
      job_id: input.jobId,
      video_id: input.videoId,
      title: input.title,
      position: input.position,
      status: "queued",
      progress_pct: 0,
      error: null,
      track_id: null,
    };
    this.items.push(it);
    return Promise.resolve(it);
  }
  listJobItems(jobId: number): Promise<DownloadJobItem[]> {
    return Promise.resolve(
      this.items.filter((i) => i.job_id === jobId).sort((a, b) => a.position - b.position),
    );
  }
  updateJobItem(
    id: number,
    patch: {
      status?: DownloadJobItem["status"];
      progressPct?: number;
      error?: string | null;
      trackId?: number | null;
    },
  ): Promise<void> {
    const it = this.items.find((x) => x.id === id);
    if (it) {
      if (patch.status !== undefined) it.status = patch.status;
      if (patch.progressPct !== undefined) it.progress_pct = patch.progressPct;
      if (patch.error !== undefined) it.error = patch.error;
      if (patch.trackId !== undefined) it.track_id = patch.trackId;
    }
    return Promise.resolve();
  }

  // --- api keys ---
  createApiKey(input: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
  }): Promise<ApiKey> {
    const k: ApiKey = {
      id: this.#id(),
      user_id: input.userId,
      name: input.name,
      key_hash: input.keyHash,
      key_prefix: input.keyPrefix,
      created_at: TS,
      last_used_at: null,
      revoked_at: null,
    };
    this.keys.push(k);
    return Promise.resolve(k);
  }
  listApiKeys(userId: string): Promise<ApiKey[]> {
    return Promise.resolve(
      this.keys.filter((k) => k.user_id === userId).sort((a, b) => b.id - a.id),
    );
  }
  getApiKeyByHash(hash: string): Promise<ApiKey | null> {
    return Promise.resolve(this.keys.find((k) => k.key_hash === hash) ?? null);
  }
  revokeApiKey(id: number, userId: string): Promise<boolean> {
    const k = this.keys.find((x) => x.id === id && x.user_id === userId && x.revoked_at === null);
    if (!k) return Promise.resolve(false);
    k.revoked_at = TS;
    return Promise.resolve(true);
  }
  touchApiKey(id: number): Promise<void> {
    const k = this.keys.find((x) => x.id === id);
    if (k) k.last_used_at = "2026-01-01T00:00:01";
    return Promise.resolve();
  }

  // --- not exercised by the tests ---
  renameCollection(_id: number, _name: string): Promise<boolean> {
    return notImpl("renameCollection");
  }
  deleteCollection(_id: number): Promise<boolean> {
    return notImpl("deleteCollection");
  }
  updateTrackTitle(_id: number, _title: string): Promise<boolean> {
    return notImpl("updateTrackTitle");
  }
  bulkUpdateTitles(_updates: { id: number; title: string }[]): Promise<number> {
    return notImpl("bulkUpdateTitles");
  }
  setTrackCollection(_id: number, _collectionId: number | null): Promise<boolean> {
    return notImpl("setTrackCollection");
  }
  setTrackLoudness(_id: number, _lufs: number): Promise<boolean> {
    return notImpl("setTrackLoudness");
  }
  deleteTrack(_id: number): Promise<{ filePath: string | null } | null> {
    return notImpl("deleteTrack");
  }
  upsertTag(_name: string, _category?: string | null): Promise<Tag> {
    return notImpl("upsertTag");
  }
  listTags(): Promise<(Tag & { track_count: number })[]> {
    return notImpl("listTags");
  }
  tagsForTrack(_trackId: number): Promise<Tag[]> {
    return notImpl("tagsForTrack");
  }
  addTagsToTracks(_trackIds: number[], _tagIds: number[]): Promise<number> {
    return notImpl("addTagsToTracks");
  }
  removeTagsFromTracks(_trackIds: number[], _tagIds: number[]): Promise<number> {
    return notImpl("removeTagsFromTracks");
  }
  deleteTag(_id: number): Promise<boolean> {
    return notImpl("deleteTag");
  }
  updateTag(_id: number, _patch: { name?: string; color?: string | null }): Promise<Tag | null> {
    return notImpl("updateTag");
  }
  createPlaylist(_name: string): Promise<Playlist> {
    return notImpl("createPlaylist");
  }
  getPlaylist(_id: number): Promise<Playlist | null> {
    return notImpl("getPlaylist");
  }
  listPlaylists(): Promise<Playlist[]> {
    return notImpl("listPlaylists");
  }
  updatePlaylist(
    _id: number,
    _patch: { name?: string; loopMode?: "none" | "track" | "playlist"; shuffle?: boolean },
  ): Promise<boolean> {
    return notImpl("updatePlaylist");
  }
  deletePlaylist(_id: number): Promise<boolean> {
    return notImpl("deletePlaylist");
  }
  setPlaylistItems(_playlistId: number, _trackIds: number[]): Promise<void> {
    return notImpl("setPlaylistItems");
  }
  playlistTrackIds(_playlistId: number): Promise<number[]> {
    return notImpl("playlistTrackIds");
  }
}
