/**
 * Ingest orchestration. Detects single vs playlist, builds the
 * download-job + items, runs downloads through a bounded pool, dedups by video
 * id, measures R128 loudness, creates tracks, and streams progress via the hub.
 *
 * yt-dlp + prober are injected, so the whole lifecycle is unit-tested with stubs
 * and no binaries (CI-safe). `start()` returns a `done` promise tests await.
 *
 * Shutdown and restart: `stop()` (a service-kit shutdown hook, run before the store closes) kills
 * the running yt-dlp processes and waits for the jobs to let go, writing nothing about the
 * interruption. A job a shutdown cut off therefore stays `queued` or `running` in the database,
 * and `resumeInterrupted()` at the next boot picks it up from `listJobsByStatus`.
 */
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { getLogger, getTracer, lazyCounter, lazyHistogram, reportIgnored } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";

import type { JobSnapshot } from "../api/types";
import type { DownloadJob, DownloadJobItem, LibraryStore } from "../db/store";
import { runPool } from "../lib/pool";
import type { AudioProbe, AudioProber } from "../media/probe";
import { type DownloadTarget, extractVideoId, isPlaylistUrl, type YtDlp } from "../media/ytdlp";
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

/** How long `stop()` waits for in-flight jobs once their downloads are killed. */
const STOP_WAIT_MS = 5_000;

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

type Work = { item: DownloadJobItem; target: DownloadTarget };

export class IngestService {
  private readonly deps: IngestDeps;
  readonly #stopper = new AbortController();
  readonly #inFlight = new Set<Promise<void>>();

  constructor(deps: IngestDeps) {
    this.deps = deps;
  }

  get #stopping(): boolean {
    return this.#stopper.signal.aborted;
  }

  /** Keeps `stop()` aware of a background job until it settles. */
  #track(job: Promise<void>): Promise<void> {
    this.#inFlight.add(job);
    void job.then(
      () => this.#inFlight.delete(job),
      () => this.#inFlight.delete(job),
    );
    return job;
  }

  /**
   * Kill every running yt-dlp and wait (up to {@link STOP_WAIT_MS}) for the jobs to return,
   * leaving their rows as they were so the next boot resumes them. After this the service starts
   * no new work.
   */
  async stop(): Promise<void> {
    this.#stopper.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<void>((r) => {
      timer = setTimeout(r, STOP_WAIT_MS);
    });
    await Promise.race([Promise.allSettled(this.#inFlight), waited]);
    clearTimeout(timer);
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
    const snapshot: JobSnapshot = {
      job: await this.deps.store.getDownloadJob(jobId),
      items: await this.deps.store.listJobItems(jobId),
    };
    this.deps.hub.publish(jobId, snapshot);
  }

  private async startSingle(url: string, collectionId?: number): Promise<StartResult> {
    const { store } = this.deps;
    const job = await store.createDownloadJob({
      type: "single",
      sourceUrl: url,
      collectionId: collectionId ?? null,
    });
    const item = await this.addSingleItem(job.id, url);
    await store.updateDownloadJob(job.id, { totalItems: 1, status: "running" });
    const done = this.#track(this.runItems(job.id, [{ item, target: { url } }]));
    return { job: (await store.getDownloadJob(job.id)) ?? job, done };
  }

  private addSingleItem(jobId: number, url: string): Promise<DownloadJobItem> {
    const videoId = extractVideoId(url) ?? url;
    return this.deps.store.addJobItem({ jobId, videoId, title: videoId, position: 0 });
  }

  private async startPlaylist(url: string, collectionId?: number): Promise<StartResult> {
    // The target collection goes on the job row now, so a resume after an interrupted listing
    // still imports into it.
    const job = await this.deps.store.createDownloadJob({
      type: "playlist",
      sourceUrl: url,
      collectionId: collectionId ?? null,
    });
    const done = this.#track(this.listAndRun(job, []));
    return { job, done };
  }

  /**
   * List the playlist, record an item per entry not already in `existing` (matched by position),
   * then download every item not yet done. A resume calls this too when the job's items were
   * never all recorded.
   */
  private async listAndRun(job: DownloadJob, existing: DownloadJobItem[]): Promise<void> {
    const { store } = this.deps;
    let info: Awaited<ReturnType<YtDlp["enumerate"]>>;
    try {
      info = await this.deps.ytdlp.enumerate(job.source_url, this.#stopper.signal);
    } catch (err) {
      if (this.#stopping) return; // shutdown: the next boot lists it again
      await store.updateDownloadJob(job.id, { status: "error", error: (err as Error).message });
      await this.publish(job.id);
      return;
    }
    // Target the job's collection if it has one, else create one from the playlist.
    const targetId =
      job.collection_id ??
      (
        await store.createCollection({
          name: info.title,
          sourceType: "youtube_playlist",
          sourceUrl: job.source_url,
        })
      ).id;
    await store.updateDownloadJob(job.id, {
      title: info.title,
      collectionId: targetId,
      totalItems: info.entries.length,
      status: "running",
    });
    const have = new Set(existing.map((i) => i.position));
    const added = await Promise.all(
      info.entries.flatMap((entry, i) =>
        have.has(i)
          ? []
          : [
              store.addJobItem({
                jobId: job.id,
                videoId: entry.videoId,
                title: entry.title,
                position: i,
              }),
            ],
      ),
    );
    const work = [...existing.filter((i) => i.status !== "done"), ...added].map((item) => ({
      item,
      target: { videoId: item.video_id },
    }));
    await this.publish(job.id);
    await this.runItems(job.id, work);
  }

  private async runItems(jobId: number, work: Work[]): Promise<void> {
    const { store } = this.deps;
    await mkdir(this.audioDir(), { recursive: true }).catch(() => {});
    const doneCount = async () =>
      (await store.listJobItems(jobId)).filter((i) => i.status === "done").length;

    await runPool(work, this.deps.concurrency ?? 3, async ({ item, target }) => {
      if (this.#stopping) return; // shutdown: the item stays queued for the next boot
      try {
        await this.processItem(jobId, item, target);
      } catch (err) {
        // A download killed by shutdown is not a failure: leave the row for the resume.
        if (this.#stopping) return;
        await store.updateJobItem(item.id, { status: "error", error: (err as Error).message });
      }
      await store.updateDownloadJob(jobId, { completedItems: await doneCount() });
      await this.publish(jobId);
    });
    if (this.#stopping) return; // the job stays running; the next boot resumes it

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
   * Resume jobs left mid-flight by a crash, restart or shutdown (status still queued/running):
   * re-queue their non-done items and download them. Dedup makes already-finished items instant.
   * A playlist whose items were not all recorded is listed again; a single-video job cut off
   * before its item was recorded gets the item now. Returns the number of jobs resumed.
   */
  async resumeInterrupted(): Promise<number> {
    const { store } = this.deps;
    const jobs = await store.listJobsByStatus(["queued", "running"]);
    for (const job of jobs) {
      let items = await store.listJobItems(job.id);
      for (const it of items.filter((i) => i.status !== "done"))
        await store.updateJobItem(it.id, { status: "queued", progressPct: 0, error: null });
      items = await store.listJobItems(job.id);
      if (job.type === "playlist" && (items.length === 0 || items.length < job.total_items)) {
        await store.updateDownloadJob(job.id, { status: "running" });
        this.#resumeInBackground(job.id, this.listAndRun(job, items));
        continue;
      }
      if (job.type === "single" && items.length === 0)
        items = [await this.addSingleItem(job.id, job.source_url)];
      const pending = items.filter((i) => i.status !== "done");
      if (pending.length === 0) {
        await store.updateDownloadJob(job.id, { status: "done" });
        continue;
      }
      await store.updateDownloadJob(job.id, { status: "running" });
      const work = pending.map((item) => ({
        item,
        target: job.type === "single" ? { url: job.source_url } : { videoId: item.video_id },
      }));
      this.#resumeInBackground(job.id, this.runItems(job.id, work));
    }
    return jobs.length;
  }

  #resumeInBackground(jobId: number, run: Promise<void>): void {
    void this.#track(run).catch((err: unknown) => {
      if (this.#stopping) return;
      log.emit({
        severityText: "ERROR",
        body: `resume of job ${jobId} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    });
  }

  private async processItem(jobId: number, item: DownloadJobItem, target: DownloadTarget) {
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
          // A shutdown interrupts the item; it is not an error (and must not page).
          const outcome = this.#stopping ? "interrupted" : "error";
          span.setAttribute("orator.outcome", outcome);
          ingestCounter.add(1, { outcome });
          ingestDuration.record(Date.now() - startedAt, { outcome });
          if (!this.#stopping) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            log.emit({
              severityText: "ERROR",
              body: `ingest item failed (job ${jobId}, item ${item.id}): ${err instanceof Error ? err.message : String(err)}`,
            });
          }
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
    target: DownloadTarget,
  ): Promise<"ok" | "duplicate"> {
    const { store } = this.deps;
    const job = await store.getDownloadJob(jobId);
    await store.updateJobItem(item.id, { status: "downloading", progressPct: 0 });
    await this.publish(jobId);

    // Dedup: if this video already has a ready track, link to it and skip.
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
    const result = await this.deps.ytdlp.download(
      target,
      this.audioDir(),
      (pct) => {
        if (this.#stopping || !(pct - lastPct >= 5 || pct >= 100)) return;
        lastPct = pct;
        void store
          .updateJobItem(item.id, { progressPct: pct })
          .then(() => this.publish(jobId))
          .catch((err: unknown) => reportIgnored("orator.ingest-progress", err));
      },
      this.#stopper.signal,
    );

    // Loudness on ingest, best-effort.
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
