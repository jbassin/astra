import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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

describe("single ingest (B20)", () => {
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

describe("playlist ingest (B21)", () => {
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

  test("one failing item → partial job, others still imported (B21)", async () => {
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

describe("dedup (B23)", () => {
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
