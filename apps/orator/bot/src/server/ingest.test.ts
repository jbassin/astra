import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FakeStore } from "../db/fake-store";
import { extractVideoId, type YtDlp } from "../media/ytdlp";
import { IngestService } from "./ingest";
import { JobHub } from "./jobhub";

let store: FakeStore;
let dataDir: string;
let hub: JobHub;

/** A stub yt-dlp that "downloads" by writing a tiny file; can be told to fail ids. */
function stubYtDlp(
  opts: { entries?: { videoId: string; title: string }[]; failIds?: Set<string> } = {},
): YtDlp {
  return {
    async enumerate() {
      return { title: "Chrono Trigger OST", entries: opts.entries ?? [] };
    },
    async download(target, destDir, onProgress) {
      const videoId = target.videoId ?? extractVideoId(target.url ?? "") ?? "single";
      if (opts.failIds?.has(videoId)) throw new Error("download blew up");
      onProgress?.(50);
      const filePath = join(destDir, `${videoId}.webm`);
      writeFileSync(filePath, "fake-audio");
      onProgress?.(100);
      return { filePath, title: `Title ${videoId}`, videoId, format: "webm", durationMs: 1000 };
    },
  };
}

beforeEach(() => {
  store = new FakeStore();
  dataDir = mkdtempSync(join(tmpdir(), "orator-ingest-"));
  hub = new JobHub();
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function service(ytdlp: YtDlp) {
  return new IngestService({
    store,
    dataDir,
    ytdlp,
    hub,
    prober: async () => ({ loudnessLufs: -20 }),
    concurrency: 2,
  });
}

describe("single ingest", () => {
  test("downloads one video → one ready track with loudness", async () => {
    const { job, done } = await service(stubYtDlp()).start("https://youtu.be/song1");
    expect(job.type).toBe("single");
    await done;
    const finished = await store.getDownloadJob(job.id);
    expect(finished?.status).toBe("done");
    const tracks = await store.listTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.source_type).toBe("youtube");
    expect(tracks[0]?.loudness_lufs).toBe(-20);
  });
});

describe("playlist ingest", () => {
  test("creates a collection and a track per entry", async () => {
    const entries = [
      { videoId: "a", title: "A" },
      { videoId: "b", title: "B" },
      { videoId: "c", title: "C" },
    ];
    const { job, done } = await service(stubYtDlp({ entries })).start(
      "https://youtube.com/playlist?list=PL1",
    );
    expect(job.type).toBe("playlist");
    await done;
    const finished = await store.getDownloadJob(job.id);
    expect(finished?.status).toBe("done");
    expect(finished?.total_items).toBe(3);
    expect(finished?.completed_items).toBe(3);
    const collection = (await store.listCollections()).find(
      (c) => c.id === finished?.collection_id,
    );
    expect(collection?.name).toBe("Chrono Trigger OST");
    expect(await store.listTracks({ collectionId: collection?.id })).toHaveLength(3);
  });

  test("imports into an existing collection when given (no new collection)", async () => {
    const dest = await store.createCollection({ name: "My Mix" });
    const entries = [
      { videoId: "a", title: "A" },
      { videoId: "b", title: "B" },
    ];
    const { job, done } = await service(stubYtDlp({ entries })).start(
      "https://youtube.com/playlist?list=PL1",
      dest.id,
    );
    await done;
    expect((await store.getDownloadJob(job.id))?.collection_id).toBe(dest.id);
    expect(await store.listCollections()).toHaveLength(1); // no new collection created
    expect(await store.listTracks({ collectionId: dest.id })).toHaveLength(2);
  });

  test("one failing item → partial job, others still imported", async () => {
    const entries = [
      { videoId: "ok1", title: "ok1" },
      { videoId: "bad", title: "bad" },
      { videoId: "ok2", title: "ok2" },
    ];
    const { job, done } = await service(stubYtDlp({ entries, failIds: new Set(["bad"]) })).start(
      "https://youtube.com/playlist?list=PL1",
    );
    await done;
    const finished = await store.getDownloadJob(job.id);
    expect(finished?.status).toBe("partial");
    expect(await store.listTracks()).toHaveLength(2);
    const items = await store.listJobItems(job.id);
    expect(items.find((i) => i.video_id === "bad")?.status).toBe("error");
  });
});

describe("dedup", () => {
  test("re-importing an existing video links instead of duplicating", async () => {
    await store.createTrack({ title: "old", sourceType: "youtube", sourceVideoId: "dupe" });
    const { job, done } = await service(stubYtDlp()).start("https://youtu.be/dupe");
    await done;
    expect(await store.listTracks()).toHaveLength(1); // no new track
    const item = (await store.listJobItems(job.id))[0];
    expect(item?.status).toBe("done");
    expect(item?.error).toBe("duplicate");
  });
});

describe("resumeInterrupted (restart recovery)", () => {
  test("re-downloads non-done items of an interrupted job; keeps done ones", async () => {
    // Simulate a playlist job interrupted after 1 of 3 downloaded.
    const job = await store.createDownloadJob({
      type: "playlist",
      sourceUrl: "https://yt/playlist?list=PL1",
    });
    await store.updateDownloadJob(job.id, { status: "running", totalItems: 3 });
    const a = await store.addJobItem({ jobId: job.id, videoId: "a", title: "A", position: 0 });
    await store.addJobItem({ jobId: job.id, videoId: "b", title: "B", position: 1 });
    await store.addJobItem({ jobId: job.id, videoId: "c", title: "C", position: 2 });
    // 'a' already finished (with a real track), 'b'/'c' were left mid-flight.
    const trackA = await store.createTrack({
      title: "A",
      sourceType: "youtube",
      sourceVideoId: "a",
    });
    await store.updateJobItem(a.id, { status: "done", trackId: trackA.id });

    const svc = service(stubYtDlp({ entries: [] }));
    expect(await svc.resumeInterrupted()).toBe(1);
    // Let the resumed downloads finish.
    await new Promise((r) => setTimeout(r, 50));

    const finished = await store.getDownloadJob(job.id);
    expect(finished?.status).toBe("done");
    expect(finished?.completed_items).toBe(3);
    expect(await store.listTracks()).toHaveLength(3); // A kept + B,C downloaded
  });

  test("a fully-done interrupted job is just marked done", async () => {
    const job = await store.createDownloadJob({ type: "single", sourceUrl: "u" });
    await store.updateDownloadJob(job.id, { status: "running" });
    const x = await store.addJobItem({ jobId: job.id, videoId: "x", title: "x", position: 0 });
    await store.updateJobItem(x.id, { status: "done" });
    await service(stubYtDlp()).resumeInterrupted();
    expect((await store.getDownloadJob(job.id))?.status).toBe("done");
  });

  test("leaves already-finished jobs alone", async () => {
    const job = await store.createDownloadJob({ type: "single", sourceUrl: "u" });
    await store.updateDownloadJob(job.id, { status: "done" });
    expect(await service(stubYtDlp()).resumeInterrupted()).toBe(0);
  });

  test("a playlist cut off before its listing finished is listed again", async () => {
    const dest = await store.createCollection({ name: "My Mix" });
    const job = await store.createDownloadJob({
      type: "playlist",
      sourceUrl: "https://youtube.com/playlist?list=PL1",
      collectionId: dest.id,
    });
    const entries = [
      { videoId: "a", title: "A" },
      { videoId: "b", title: "B" },
    ];
    expect(await service(stubYtDlp({ entries })).resumeInterrupted()).toBe(1);
    await vi.waitFor(async () => expect((await store.getDownloadJob(job.id))?.status).toBe("done"));
    expect(await store.listTracks({ collectionId: dest.id })).toHaveLength(2);
    expect(await store.listCollections()).toHaveLength(1);
  });

  test("a playlist cut off while recording its items adds only the missing ones", async () => {
    const job = await store.createDownloadJob({ type: "playlist", sourceUrl: "https://y/l" });
    await store.updateDownloadJob(job.id, { status: "running", totalItems: 3 });
    await store.addJobItem({ jobId: job.id, videoId: "a", title: "A", position: 0 });
    const entries = ["a", "b", "c"].map((videoId) => ({ videoId, title: videoId }));
    await service(stubYtDlp({ entries })).resumeInterrupted();
    await vi.waitFor(async () => expect((await store.getDownloadJob(job.id))?.status).toBe("done"));
    const items = await store.listJobItems(job.id);
    expect(items.map((i) => [i.position, i.video_id, i.status])).toEqual([
      [0, "a", "done"],
      [1, "b", "done"],
      [2, "c", "done"],
    ]);
  });

  test("a single-video job cut off before its item was recorded still downloads", async () => {
    const job = await store.createDownloadJob({ type: "single", sourceUrl: "https://youtu.be/s1" });
    await service(stubYtDlp()).resumeInterrupted();
    await vi.waitFor(async () => expect((await store.getDownloadJob(job.id))?.status).toBe("done"));
    expect((await store.listTracks()).map((t) => t.source_video_id)).toEqual(["s1"]);
  });
});

/** A yt-dlp whose downloads of `hang` ids never finish until their signal aborts. */
function hangingYtDlp(entries: { videoId: string; title: string }[], hang: Set<string>): YtDlp {
  const quick = stubYtDlp({ entries });
  return {
    enumerate: quick.enumerate,
    download(target, destDir, onProgress, signal) {
      const videoId = target.videoId ?? extractVideoId(target.url ?? "") ?? "single";
      if (!hang.has(videoId)) return quick.download(target, destDir, onProgress);
      return new Promise((_, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("yt-dlp was stopped"))),
      );
    },
  };
}

describe("stop (shutdown) then resume", () => {
  test("a shutdown mid-download leaves the job resumable, and the next boot finishes it", async () => {
    const entries = ["a", "b", "c"].map((videoId) => ({ videoId, title: videoId }));
    const first = service(hangingYtDlp(entries, new Set(["b", "c"])));
    const { job, done } = await first.start("https://youtube.com/playlist?list=PL1");
    await vi.waitFor(async () => {
      const items = await store.listJobItems(job.id);
      expect(items.map((i) => i.status)).toEqual(["done", "downloading", "downloading"]);
    });

    await first.stop();
    await done;
    // Nothing recorded the interruption as a failure.
    expect((await store.getDownloadJob(job.id))?.status).toBe("running");
    expect((await store.listJobItems(job.id)).map((i) => [i.status, i.error])).toEqual([
      ["done", null],
      ["downloading", null],
      ["downloading", null],
    ]);
    expect((await store.listJobsByStatus(["queued", "running"])).map((j) => j.id)).toEqual([
      job.id,
    ]);

    // The next boot: a fresh service over the same store.
    expect(await service(stubYtDlp({ entries })).resumeInterrupted()).toBe(1);
    await vi.waitFor(async () => expect((await store.getDownloadJob(job.id))?.status).toBe("done"));
    expect((await store.getDownloadJob(job.id))?.completed_items).toBe(3);
    expect(await store.listTracks()).toHaveLength(3);
  });

  test("a stopped service starts no queued item", async () => {
    const entries = ["a", "b", "c"].map((videoId) => ({ videoId, title: videoId }));
    const svc = new IngestService({
      store,
      dataDir,
      ytdlp: hangingYtDlp(entries, new Set(["a"])),
      hub,
      concurrency: 1,
    });
    const { job, done } = await svc.start("https://youtube.com/playlist?list=PL1");
    await vi.waitFor(async () =>
      expect((await store.listJobItems(job.id))[0]?.status).toBe("downloading"),
    );
    await svc.stop();
    await done;
    expect((await store.listJobItems(job.id)).map((i) => i.status)).toEqual([
      "downloading",
      "queued",
      "queued",
    ]);
  });
});

describe("sse hub", () => {
  test("publishes progress frames to subscribers", async () => {
    const { job, done } = await service(
      stubYtDlp({ entries: [{ videoId: "a", title: "A" }] }),
    ).start("https://youtube.com/playlist?list=PL1");
    const frames: string[] = [];
    const off = hub.subscribe(job.id, (f) => frames.push(f));
    await done;
    off();
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.includes('"status":"done"'))).toBe(true);
  });
});
