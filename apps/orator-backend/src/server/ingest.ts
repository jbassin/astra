/**
 * Ingest orchestration (lark B20–B25). Detects single vs playlist, builds the
 * download-job + items, runs downloads through a bounded pool, dedups by video
 * id, measures R128 loudness, creates tracks, and streams progress via the hub.
 *
 * yt-dlp + prober are injected, so the whole lifecycle is unit-tested with stubs
 * and no binaries (CI-safe). `start()` returns a `done` promise tests await.
 *
 * astra port: the sync `bun:sqlite` `db` → the async `LibraryStore` (every repo
 * call awaited); `resumeInterrupted` is now async (`listJobsByStatus`).
 */
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { getLogger, getTracer, lazyCounter, lazyHistogram } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
import type { DownloadJob, DownloadJobItem, LibraryStore } from "../db/store";
import { runPool } from "../lib/pool";
import type { AudioProbe, AudioProber } from "../media/probe";
import { extractVideoId, isPlaylistUrl, type YtDlp } from "../media/ytdlp";
import type { JobHub } from "./jobhub";

// One ingest item = one yt-dlp download (+ optional loudness probe), the service's
// dominant multi-minute unit of work. Traced + timed + counted by outcome.
const tracer = getTracer("astra.orator-backend");
const log = getLogger("astra.orator-backend");
const ingestCounter = lazyCounter("astra.orator-backend", "astra.orator.ingest.items", {
  description: "Ingest items processed, by outcome",
});
const ingestDuration = lazyHistogram("astra.orator-backend", "astra.orator.ingest.duration_ms", {
  description: "Per-item ingest wall-clock (yt-dlp download + loudness probe)",
  unit: "ms",
});

export interface IngestDeps {
  store: LibraryStore;
  dataDir: string;
  ytdlp: YtDlp;
  hub: JobHub;
  prober?: AudioProber;
  concurrency?: number;
}

export interface StartResult {
  job: DownloadJob;
  done: Promise<void>;
}

export class IngestService {
  // Not a TS parameter property (`constructor(private readonly x, …)`) — Node's
  // `--experimental-strip-types` (R3, 0022 S8) only erases types, it doesn't emit
  // code, so a parameter property (which needs a real `this.x = x` assignment
  // generated) throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` when Node runs this file
  // directly (see [[weal-bot gateway.ts]], S5).
  private readonly deps: IngestDeps;

  constructor(deps: IngestDeps) {
    this.deps = deps;
  }

  /**
   * Detect URL type and kick off ingest. If `collectionId` is given, tracks land
   * in that collection (a playlist won't create its own). Creates + returns the
   * job row, then runs the downloads in the background (`done`).
   *
   * astra change: `start` is async (the job row is created on Postgres) — lark
   * returned it synchronously. The REST handler `await`s it then `void done`s.
   */
  start(url: string, collectionId?: number): Promise<StartResult> {
    return isPlaylistUrl(url)
      ? this.startPlaylist(url, collectionId)
      : this.startSingle(url, collectionId);
  }

  private audioDir(): string {
    return resolve(this.deps.dataDir, "audio");
  }

  private async publish(jobId: number): Promise<void> {
    this.deps.hub.publish(jobId, {
      job: await this.deps.store.getDownloadJob(jobId),
      items: await this.deps.store.listJobItems(jobId),
    });
  }

  private async startSingle(url: string, collectionId?: number): Promise<StartResult> {
    const { store } = this.deps;
    const job = await store.createDownloadJob({
      type: "single",
      sourceUrl: url,
      collectionId: collectionId ?? null,
    });
    const videoId = extractVideoId(url) ?? url;
    const item = await store.addJobItem({ jobId: job.id, videoId, title: videoId, position: 0 });
    await store.updateDownloadJob(job.id, { totalItems: 1, status: "running" });
    const done = this.runItems(job.id, [{ item, target: { url } }]);
    return { job: (await store.getDownloadJob(job.id)) ?? job, done };
  }

  private async startPlaylist(url: string, collectionId?: number): Promise<StartResult> {
    const { store } = this.deps;
    const job = await store.createDownloadJob({ type: "playlist", sourceUrl: url });
    const done = (async () => {
      let info: Awaited<ReturnType<YtDlp["enumerate"]>>;
      try {
        info = await this.deps.ytdlp.enumerate(url);
      } catch (err) {
        await store.updateDownloadJob(job.id, { status: "error", error: (err as Error).message });
        await this.publish(job.id);
        return;
      }
      // Target an existing collection if given, else create one from the playlist.
      const targetId =
        collectionId ??
        (
          await store.createCollection({
            name: info.title,
            sourceType: "youtube_playlist",
            sourceUrl: url,
          })
        ).id;
      await store.updateDownloadJob(job.id, {
        title: info.title,
        collectionId: targetId,
        totalItems: info.entries.length,
        status: "running",
      });
      const work = await Promise.all(
        info.entries.map(async (entry, i) => ({
          item: await store.addJobItem({
            jobId: job.id,
            videoId: entry.videoId,
            title: entry.title,
            position: i,
          }),
          target: { videoId: entry.videoId },
        })),
      );
      await this.publish(job.id);
      await this.runItems(job.id, work);
    })();
    return { job, done };
  }

  private async runItems(
    jobId: number,
    work: { item: DownloadJobItem; target: { url?: string; videoId?: string } }[],
  ): Promise<void> {
    const { store } = this.deps;
    await mkdir(this.audioDir(), { recursive: true }).catch(() => {});
    const doneCount = async () =>
      (await store.listJobItems(jobId)).filter((i) => i.status === "done").length;

    await runPool(work, this.deps.concurrency ?? 3, async ({ item, target }) => {
      try {
        await this.processItem(jobId, item, target);
      } catch (err) {
        await store.updateJobItem(item.id, { status: "error", error: (err as Error).message });
      }
      await store.updateDownloadJob(jobId, { completedItems: await doneCount() });
      await this.publish(jobId);
    });

    // Compute final status from the DB so it's correct for resumed jobs too.
    const items = await store.listJobItems(jobId);
    const done = items.filter((i) => i.status === "done").length;
    const failed = items.filter((i) => i.status === "error").length;
    await store.updateDownloadJob(jobId, {
      status: failed === 0 ? "done" : done === 0 ? "error" : "partial",
      completedItems: done,
    });
    await this.publish(jobId);
  }

  /**
   * Resume jobs left mid-flight by a crash/restart (status still queued/running):
   * re-queue their non-done items and download them. Dedup makes already-finished
   * items instant. Returns the number of jobs resumed.
   */
  async resumeInterrupted(): Promise<number> {
    const { store } = this.deps;
    const jobs = await store.listJobsByStatus(["queued", "running"]);
    for (const job of jobs) {
      const pending = (await store.listJobItems(job.id)).filter((i) => i.status !== "done");
      if (pending.length === 0) {
        await store.updateDownloadJob(job.id, { status: "done" });
        continue;
      }
      await store.updateDownloadJob(job.id, { status: "running" });
      for (const it of pending)
        await store.updateJobItem(it.id, { status: "queued", progressPct: 0, error: null });
      const work = pending.map((item) => ({
        item,
        target: job.type === "single" ? { url: job.source_url } : { videoId: item.video_id },
      }));
      void this.runItems(job.id, work).catch((err) =>
        log.emit({
          severityText: "ERROR",
          body: `resume of job ${job.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
    return jobs.length;
  }

  private async processItem(
    jobId: number,
    item: DownloadJobItem,
    target: { url?: string; videoId?: string },
  ): Promise<void> {
    await tracer.startActiveSpan(
      "orator.ingest.item",
      { attributes: { "orator.job_id": jobId, "orator.video_id": item.video_id ?? "" } },
      async (span) => {
        const startedAt = Date.now();
        try {
          const outcome = await this._ingestItem(jobId, item, target);
          span.setAttribute("orator.outcome", outcome);
          ingestCounter.add(1, { outcome });
          ingestDuration.record(Date.now() - startedAt, { outcome });
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          ingestCounter.add(1, { outcome: "error" });
          ingestDuration.record(Date.now() - startedAt, { outcome: "error" });
          log.emit({
            severityText: "ERROR",
            body: `ingest item failed (job ${jobId}, item ${item.id}): ${err instanceof Error ? err.message : String(err)}`,
          });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  private async _ingestItem(
    jobId: number,
    item: DownloadJobItem,
    target: { url?: string; videoId?: string },
  ): Promise<"ok" | "duplicate"> {
    const { store } = this.deps;
    const job = await store.getDownloadJob(jobId);
    await store.updateJobItem(item.id, { status: "downloading", progressPct: 0 });
    await this.publish(jobId);

    // Dedup (B23): if this video already has a ready track, link to it and skip.
    if (item.video_id) {
      const existing = await store.findTrackByVideoId(item.video_id);
      if (existing) {
        await store.updateJobItem(item.id, {
          status: "done",
          progressPct: 100,
          trackId: existing.id,
          error: "duplicate",
        });
        return "duplicate";
      }
    }

    let lastPct = 0;
    const result = await this.deps.ytdlp.download(target, this.audioDir(), (pct) => {
      if (pct - lastPct >= 5 || pct >= 100) {
        lastPct = pct;
        void store.updateJobItem(item.id, { progressPct: pct }).then(() => this.publish(jobId));
      }
    });

    // Loudness on ingest (B25), best-effort.
    let loudnessLufs: number | null = null;
    if (this.deps.prober) {
      const probe: AudioProbe = await this.deps
        .prober(result.filePath)
        .catch((): AudioProbe => ({}));
      loudnessLufs = probe.loudnessLufs ?? null;
    }
    const fileSize = await stat(result.filePath)
      .then((s) => s.size)
      .catch(() => null);

    const track = await store.createTrack({
      collectionId: job?.collection_id ?? null,
      title: result.title,
      originalTitle: result.title,
      sourceType: "youtube",
      sourceUrl: target.url ?? `https://www.youtube.com/watch?v=${result.videoId}`,
      sourceVideoId: result.videoId,
      filePath: result.filePath,
      format: result.format,
      durationMs: result.durationMs ?? null,
      fileSize,
      loudnessLufs,
      status: "ready",
    });
    await store.updateJobItem(item.id, { status: "done", progressPct: 100, trackId: track.id });
    return "ok";
  }
}
