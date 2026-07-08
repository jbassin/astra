/**
 * Plain node `/health` server (D27-11) — deliberately NOT srvx/express (vellum-render
 * and portal-server both have other reasons to run a richer HTTP stack; this service's
 * ONLY HTTP surface is a health check, so `node:http` is the whole dependency). The
 * compose healthcheck (S3) asserts `ok` alone — process-up + browser-connected ONLY.
 * `world-down` is a reported state, not unhealthy (D27-11 — a restart can't launch a
 * world; a restart-loop during the GM's maintenance window would be noise).
 */
import { createServer, type Server } from "node:http";

export interface HealthSnapshot {
  /** process-up + browser-connected ONLY (D27-11) — never false because of
   * `world-down`, never true because of `in-world` alone. */
  ok: boolean;
  browserConnected: boolean;
  state: string;
  inWorld: boolean;
  lastJoinAt: number | null;
  joins: number;
  relaunches: number;
}

/** The slice of `Supervisor` `/health` needs — structural, so `index.ts` can pass the
 * real `Supervisor` instance and tests can pass a plain object, with one shared mapping
 * (below) proving `ok`'s D27-11 semantics in exactly one place. */
export interface SupervisorSnapshotSource {
  state: string;
  browserConnected: boolean;
  lastJoinAt: number | null;
  joins: number;
  relaunches: number;
}

/** The D27-11 mapping: `ok` is process-up + browser-connected ONLY — `world-down` is a
 * reported `state`, never a reason `ok` goes false. */
export function snapshotFromSupervisor(sup: SupervisorSnapshotSource): HealthSnapshot {
  return {
    ok: sup.browserConnected,
    browserConnected: sup.browserConnected,
    state: sup.state,
    inWorld: sup.state === "in-world",
    lastJoinAt: sup.lastJoinAt,
    joins: sup.joins,
    relaunches: sup.relaunches,
  };
}

/** Binds `/health`; anything else 404s. `getSnapshot` is called fresh per request — the
 * supervisor's live state, not a cached copy. */
export function createHealthServer(getSnapshot: () => HealthSnapshot): Server {
  return createServer((req, res) => {
    if (req.url === "/health") {
      const body = JSON.stringify(getSnapshot());
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}
