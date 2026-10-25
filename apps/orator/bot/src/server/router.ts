/**
 * The orator API's route shape. Routes are served by `@astra/service-kit` (matching,
 * `:param` templates, span names, error mapping); this module adds what every orator
 * handler gets on top: the authenticated actor, the store, the config slice and the
 * runtime services. `Session` + `ApiConfig` live here so the route modules don't take a
 * forward dependency on the auth layer.
 */

import { HttpError, type Schema } from "@astra/service-kit";

import type { PlaybackEngine } from "../bot/playback";
import type { LibraryStore } from "../db/store";
import type { AudioProber } from "../media/probe";
import type { IngestService } from "./ingest";
import type { JobHub } from "./jobhub";

export { HttpError, json } from "@astra/service-kit";

/** The authenticated actor — `uid` is the Discord user id (session or API key). */
export interface Session {
  readonly uid: string;
  readonly exp: number;
}

/** The runtime config slice the routes read (subset of `cfg.orator` + resolved paths). */
export interface ApiConfig {
  /** The single guild orator serves (voice debug). */
  guildId: string;
  /** Absolute data dir where ingested audio is written (uploads/ingest). */
  dataDir: string;
}

/** Service handles the API can call into. Populated incrementally per slice. */
export interface ApiServices {
  /** The single-session playback engine (present only when a bot token is set). */
  playback?: PlaybackEngine;
  /** Audio prober for uploads/ingest (injected; real one shells out to ffmpeg). */
  prober?: AudioProber;
  /** YouTube ingest orchestration (jobs, downloads, loudness). */
  ingest?: IngestService;
  /** SSE hub for download-job progress. */
  hub?: JobHub;
}

export interface ApiCtx<Body = unknown> {
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** The JSON body, validated by the route's `body` schema (400 on a bad body). The
   * handler calls it when it is ready to read the body, after its own 404/503 checks. */
  body(): Promise<Body>;
  /** The resolved actor — same `uid` whether authed by web session or API key. */
  session: Session;
  /** Which credential authenticated this request (key-management requires "session"). */
  authMethod: "session" | "apikey";
  store: LibraryStore;
  config: ApiConfig;
  services: ApiServices;
}

export interface ApiRoute<Body = unknown> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** e.g. "/api/v1/tracks/:id" */
  path: string;
  /** The body schema; its error messages are the API's error codes. */
  body?: Schema<Body>;
  handler(ctx: ApiCtx<Body>): Response | Promise<Response>;
}

/** Declare a route, inferring its body type from its schema. */
export function apiRoute<Body = unknown>(route: ApiRoute<Body>): ApiRoute<Body> {
  return route;
}

/** Parse a positive integer route param, throwing 400 otherwise. */
export function intParam(params: Record<string, string>, name: string): number {
  const n = Number(params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `invalid_${name}`);
  return n;
}
