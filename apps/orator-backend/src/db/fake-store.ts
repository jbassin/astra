/**
 * A test-double `LibraryStore` — an in-memory stand-in used by the auth/route
 * tests (lark tested these against an in-memory `bun:sqlite`; astra's store is
 * async Postgres, so CI uses this fake instead, per weal-bot's "no live PG in CI"
 * precedent). It implements the surfaces the tests exercise (API keys +
 * `listCollections`) for real; everything else throws via `notImpl()`.
 *
 * Not imported by any runtime code — only by `*.test.ts`.
 */
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

export class FakeStore implements LibraryStore {
  readonly keys: ApiKey[] = [];
  collections: Collection[] = [];
  #seq = 0;

  ensureSchema(): Promise<void> {
    return Promise.resolve();
  }

  // --- api keys (real) ---
  createApiKey(input: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
  }): Promise<ApiKey> {
    const k: ApiKey = {
      id: ++this.#seq,
      user_id: input.userId,
      name: input.name,
      key_hash: input.keyHash,
      key_prefix: input.keyPrefix,
      created_at: "2026-01-01T00:00:00",
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
    k.revoked_at = "2026-01-01T00:00:00";
    return Promise.resolve(true);
  }
  touchApiKey(id: number): Promise<void> {
    const k = this.keys.find((x) => x.id === id);
    if (k) k.last_used_at = "2026-01-01T00:00:01";
    return Promise.resolve();
  }

  // --- collections (just the list, for the API-key auth route check) ---
  listCollections(): Promise<Collection[]> {
    return Promise.resolve(this.collections);
  }

  // --- everything else: not exercised by the auth tests ---
  createCollection(_input: NewCollection): Promise<Collection> {
    return notImpl("createCollection");
  }
  getCollection(_id: number): Promise<Collection | null> {
    return notImpl("getCollection");
  }
  renameCollection(_id: number, _name: string): Promise<boolean> {
    return notImpl("renameCollection");
  }
  deleteCollection(_id: number): Promise<boolean> {
    return notImpl("deleteCollection");
  }
  createTrack(_t: NewTrack): Promise<Track> {
    return notImpl("createTrack");
  }
  getTrack(_id: number): Promise<Track | null> {
    return notImpl("getTrack");
  }
  markTrackError(_id: number): Promise<void> {
    return notImpl("markTrackError");
  }
  findTrackByVideoId(_videoId: string): Promise<Track | null> {
    return notImpl("findTrackByVideoId");
  }
  listTracks(_f?: TrackFilter): Promise<Track[]> {
    return notImpl("listTracks");
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
  createDownloadJob(_input: NewDownloadJob): Promise<DownloadJob> {
    return notImpl("createDownloadJob");
  }
  getDownloadJob(_id: number): Promise<DownloadJob | null> {
    return notImpl("getDownloadJob");
  }
  listDownloadJobs(_limit?: number): Promise<DownloadJob[]> {
    return notImpl("listDownloadJobs");
  }
  updateDownloadJob(_id: number, _patch: unknown): Promise<void> {
    return notImpl("updateDownloadJob");
  }
  addJobItem(_input: {
    jobId: number;
    videoId: string;
    title: string;
    position: number;
  }): Promise<DownloadJobItem> {
    return notImpl("addJobItem");
  }
  listJobItems(_jobId: number): Promise<DownloadJobItem[]> {
    return notImpl("listJobItems");
  }
  updateJobItem(_id: number, _patch: unknown): Promise<void> {
    return notImpl("updateJobItem");
  }
}
