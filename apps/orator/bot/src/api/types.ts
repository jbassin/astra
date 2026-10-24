/**
 * The shapes orator's HTTP API sends, defined once. The server builds its responses from these
 * types (the store's row types, the playback engine's now-playing state, the route bodies) and the
 * SPA under `src/web/` imports the same types, so a server change that alters a response breaks
 * the SPA's typecheck instead of drifting silently.
 *
 * This file is type-only and imports nothing, so the browser bundle can import it.
 * Timestamps are Postgres `::text` strings.
 */

// --- library rows (the store returns these; the API sends them as they are) ---

export interface Collection {
  id: number;
  name: string;
  slug: string;
  ip_or_game: string | null;
  source_type: "manual" | "youtube_playlist";
  source_url: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: number;
  collection_id: number | null;
  title: string;
  original_title: string;
  source_type: "upload" | "youtube";
  source_url: string | null;
  source_video_id: string | null;
  file_path: string | null;
  format: string | null;
  duration_ms: number | null;
  file_size: number | null;
  loudness_lufs: number | null;
  status: "ready" | "downloading" | "error";
  error: string | null;
  added_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  category: string | null;
  /** Optional #rrggbb; drives web row tint + section grouping. NULL = uncolored. */
  color: string | null;
  created_at: string;
}

export interface Playlist {
  id: number;
  name: string;
  loop_mode: LoopMode;
  shuffle: number;
  created_at: string;
  updated_at: string;
}

export interface DownloadJob {
  id: number;
  type: "single" | "playlist";
  source_url: string;
  title: string | null;
  collection_id: number | null;
  status: "queued" | "running" | "done" | "error" | "partial";
  total_items: number;
  completed_items: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DownloadJobItem {
  id: number;
  job_id: number;
  video_id: string;
  title: string;
  position: number;
  status: "queued" | "downloading" | "done" | "error";
  progress_pct: number;
  error: string | null;
  track_id: number | null;
}

// --- response bodies ---

/** `GET /api/v1/me`. */
export interface Me {
  uid: string;
}

/** `GET /api/v1/tracks` (each element), `GET`/`PATCH /api/v1/tracks/:id`. */
export type TrackWithTags = Track & { tags: Tag[] };

/** `GET /api/v1/tags` (each element). */
export type TagWithCount = Tag & { track_count: number };

/** `GET /api/v1/playlists/:id`. */
export type PlaylistWithItems = Playlist & { trackIds: number[] };

/** One frame of the `GET /api/v1/ingest/jobs/:id/events` SSE stream. */
export interface JobSnapshot {
  job: DownloadJob | null;
  items: DownloadJobItem[];
}

/** `GET /api/v1/keys` (each element). The hash never leaves the server. */
export interface PublicApiKey {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

/** `POST /api/v1/keys`: the raw key, shown only this once. */
export type CreatedApiKey = PublicApiKey & { key: string };

// --- playback ---

export type LoopMode = "none" | "track" | "playlist";
export type PlaybackStatus = "idle" | "playing" | "paused";

/** `GET /api/v1/playback/now`, and the answer of every playback command. */
export interface NowPlaying {
  connected: boolean;
  channelId: string | null;
  status: PlaybackStatus;
  loopMode: LoopMode;
  current: { trackId: number; title: string; positionMs: number; durationMs: number | null } | null;
  queueLength: number;
  queueIndex: number;
}
