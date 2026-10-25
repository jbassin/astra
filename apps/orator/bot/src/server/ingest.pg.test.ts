/**
 * Shutdown and resume of YouTube ingest against a real Postgres: a job a shutdown cuts off must
 * still be `queued` or `running` for the next boot's `listJobsByStatus`, and the next boot's
 * `resumeInterrupted` must finish it. yt-dlp is a stub (no binary, no network). Runs only under
 * `just pg-test` (a throwaway Postgres); never point it at the live database.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createScratchDatabase,
  type ScratchDatabase,
  TEST_DATABASE_URL,
} from "@astra/pg-migrate/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PostgresStore } from "../db/store";
import type { YtDlp } from "../media/ytdlp";
import { IngestService } from "./ingest";
import { JobHub } from "./jobhub";

const PLAYLIST = "https://youtube.com/playlist?list=PL1";
const ENTRIES = ["a", "b", "c"].map((videoId) => ({ videoId, title: videoId.toUpperCase() }));

/** Downloads every id at once except `hang`, which wait until `signal` (or `release`) aborts. */
function ytdlp(hang: Set<string>, release?: AbortSignal): YtDlp {
  return {
    enumerate: () => Promise.resolve({ title: "OST", entries: ENTRIES }),
    download(target, destDir, onProgress, signal) {
      const videoId = target.videoId ?? "single";
      if (hang.has(videoId))
        return new Promise((_, reject) => {
          const stop = () => reject(new Error("yt-dlp was stopped"));
          signal?.addEventListener("abort", stop);
          release?.addEventListener("abort", stop);
        });
      const filePath = join(destDir, `${videoId}.webm`);
      writeFileSync(filePath, "fake-audio");
      onProgress?.(100);
      return Promise.resolve({ filePath, title: videoId, videoId, format: "webm" });
    },
  };
}

describe.skipIf(TEST_DATABASE_URL === undefined)(
  "ingest shutdown and resume (real Postgres)",
  // Each test boots, stops and resumes a job against a real database; under several parallel
  // `just ci` runs that takes longer than vitest's 5 s default.
  { timeout: 20_000 },
  () => {
    let db: ScratchDatabase;
    let dataDir: string;

    beforeEach(async () => {
      db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
      const store = new PostgresStore(db.url);
      await store.migrate();
      await store.close();
      dataDir = mkdtempSync(join(tmpdir(), "orator-ingest-pg-"));
    });

    afterEach(async () => {
      await db.drop();
      rmSync(dataDir, { recursive: true, force: true });
    });

    function ingest(store: PostgresStore, yt: YtDlp): IngestService {
      return new IngestService({ store, dataDir, ytdlp: yt, hub: new JobHub(), concurrency: 2 });
    }

    /** The next boot: a new store and service, then resume; resolves once the job is done. */
    async function nextBoot(jobId: number) {
      const store = new PostgresStore(db.url);
      try {
        const interrupted = await store.listJobsByStatus(["queued", "running"]);
        expect(interrupted.map((j) => j.id)).toEqual([jobId]);
        expect(await ingest(store, ytdlp(new Set())).resumeInterrupted()).toBe(1);
        await vi.waitFor(async () =>
          expect((await store.getDownloadJob(jobId))?.status).toBe("done"),
        );
        return {
          job: await store.getDownloadJob(jobId),
          items: await store.listJobItems(jobId),
          tracks: await store.listTracks(),
        };
      } finally {
        await store.close();
      }
    }

    test("the shutdown order (ingest stops, then the store closes) leaves the job resumable", async () => {
      const store = new PostgresStore(db.url);
      const svc = ingest(store, ytdlp(new Set(["b", "c"])));
      const { job, done } = await svc.start(PLAYLIST);
      await vi.waitFor(async () =>
        expect((await store.listJobItems(job.id)).map((i) => i.status)).toEqual([
          "done",
          "downloading",
          "downloading",
        ]),
      );

      // index.ts registers these so they run in this order on SIGTERM.
      await svc.stop();
      await store.close();
      await done;

      const after = await nextBoot(job.id);
      expect(after.job).toMatchObject({ status: "done", completed_items: 3, total_items: 3 });
      expect(after.items.map((i) => [i.video_id, i.status, i.error])).toEqual([
        ["a", "done", null],
        ["b", "done", null],
        ["c", "done", null],
      ]);
      expect(new Set(after.tracks.map((t) => t.source_video_id))).toEqual(new Set(["a", "b", "c"]));
    });

    test("a store closed under running downloads still leaves the job resumable", async () => {
      // Without the stop hook: the downloads fail after the pool is gone, so every write about
      // the failure is rejected and the rows keep their in-flight state.
      const release = new AbortController();
      const store = new PostgresStore(db.url);
      const { job, done } = await ingest(store, ytdlp(new Set(["b", "c"]), release.signal)).start(
        PLAYLIST,
      );
      await vi.waitFor(async () =>
        expect((await store.listJobItems(job.id)).filter((i) => i.status === "done")).toHaveLength(
          1,
        ),
      );
      await store.close();
      release.abort();
      await expect(done).rejects.toThrow();

      const after = await nextBoot(job.id);
      expect(after.job).toMatchObject({ status: "done", completed_items: 3 });
      expect(after.tracks).toHaveLength(3);
    });

    test("a playlist cut off before its listing finished is listed again", async () => {
      const store = new PostgresStore(db.url);
      const hangingList: YtDlp = {
        ...ytdlp(new Set()),
        enumerate: (_url, signal) =>
          new Promise((_, reject) =>
            signal?.addEventListener("abort", () => reject(new Error("stopped"))),
          ),
      };
      const svc = ingest(store, hangingList);
      const { job, done } = await svc.start(PLAYLIST);
      await svc.stop();
      await store.close();
      await done;

      const after = await nextBoot(job.id);
      expect(after.job).toMatchObject({ status: "done", total_items: 3, title: "OST" });
      expect(after.items).toHaveLength(3);
    });
  },
);
