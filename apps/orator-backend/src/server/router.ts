/**
 * Minimal path router for the JSON API (lifted from faerrin lark). Supports
 * `:param` segments. Kept tiny + dependency-free; shared by all route modules.
 *
 * astra port: `ApiCtx` carries the async `LibraryStore` (was a sync `bun:sqlite`
 * `db` handle). `Session` + `ApiConfig` live here so the route modules don't take
 * a forward dependency on the auth layer (slice 4).
 */

import type { PlaybackEngine } from "../bot/playback";
import type { LibraryStore } from "../db/store";
import type { AudioProber } from "../media/probe";
import type { IngestService } from "./ingest";
import type { JobHub } from "./jobhub";

/** The authenticated actor — `uid` is the Discord user id (session or API key). */
export interface Session {
  readonly uid: string;
  readonly exp: number;
}

/** The runtime config slice the routes read (subset of `cfg.orator` + resolved paths). */
export interface ApiConfig {
  /** The single guild orator serves (voice debug). */
  guildId: string;
  /** Absolute data dir where ingested audio is written (uploads/ingest, slice 5). */
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

export interface ApiCtx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** The resolved actor — same `uid` whether authed by web session or API key. */
  session: Session;
  /** Which credential authenticated this request (key-management requires "session"). */
  authMethod: "session" | "apikey";
  store: LibraryStore;
  config: ApiConfig;
  services: ApiServices;
}

export type ApiHandler = (ctx: ApiCtx) => Response | Promise<Response>;

export interface ApiRoute {
  method: string;
  /** e.g. "/api/v1/tracks/:id" */
  path: string;
  handler: ApiHandler;
}

export interface MatchedRoute {
  route: ApiRoute;
  params: Record<string, string>;
}

/** Find the first route whose method + path template matches. */
export function matchRoute(
  routes: readonly ApiRoute[],
  method: string,
  pathname: string,
): MatchedRoute | null {
  const segs = pathname.split("/").filter((s) => s.length > 0);
  for (const route of routes) {
    if (route.method !== method) continue;
    const rsegs = route.path.split("/").filter((s) => s.length > 0);
    if (rsegs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rsegs.length; i++) {
      const r = rsegs[i];
      const s = segs[i];
      if (r === undefined || s === undefined) {
        ok = false;
        break;
      }
      if (r.startsWith(":")) params[r.slice(1)] = decodeURIComponent(s);
      else if (r !== s) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export class HttpError extends Error {
  readonly status: number;

  // Not a TS parameter property (`constructor(public readonly x, …)`) — Node's
  // `--experimental-strip-types` (R3, 0022 S8) only erases types, it doesn't emit
  // code, so a parameter property (which needs a real `this.x = x` assignment
  // generated) throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` when Node runs this file
  // directly (see [[weal-bot gateway.ts]], S5).
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Parse a JSON request body, throwing HttpError(400) on malformed input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

/** Parse a positive integer route param, throwing 400 otherwise. */
export function intParam(params: Record<string, string>, name: string): number {
  const n = Number(params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `invalid_${name}`);
  return n;
}
