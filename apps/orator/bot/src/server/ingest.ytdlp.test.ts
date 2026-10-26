/**
 * The real `createYtDlp` against a fake `yt-dlp` on PATH (a node script, so CI needs no yt-dlp):
 * a failing or hanging run must reach the job and its item as an error that quotes yt-dlp's
 * stderr, not as a bare exit code.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FakeStore } from "../db/fake-store";
import { createYtDlp } from "../media/ytdlp";
import { IngestService } from "./ingest";
import { JobHub } from "./jobhub";

let binDir: string;
let dataDir: string;

/** Installs `yt-dlp` as a node script with the given body. */
function fakeYtDlp(body: string): void {
  const file = join(binDir, "yt-dlp");
  writeFileSync(file, `#!${process.execPath}\n${body}\n`);
  chmodSync(file, 0o755);
}

beforeEach(() => {
  binDir = mkdtempSync(join(tmpdir(), "orator-fake-ytdlp-"));
  dataDir = mkdtempSync(join(tmpdir(), "orator-ingest-"));
  // Only the fake: its shebang names node by absolute path, so nothing else needs PATH.
  vi.stubEnv("PATH", binDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(binDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

function service(store: FakeStore, timeoutMs = 10_000) {
  return new IngestService({
    store,
    dataDir,
    ytdlp: createYtDlp({ enumerateTimeoutMs: timeoutMs, downloadTimeoutMs: timeoutMs }),
    hub: new JobHub(),
  });
}

describe("yt-dlp failures reach the job item", () => {
  test("a failed download stores the exit code and yt-dlp's stderr tail on the item", async () => {
    fakeYtDlp(`
process.stderr.write("[youtube] abc: Downloading webpage\\n");
process.stderr.write("ERROR: [youtube] abc: Video unavailable. This video is private\\n");
process.exit(1);`);
    const store = new FakeStore();
    const { job, done } = await service(store).start("https://youtu.be/abc");
    await done;
    expect((await store.getDownloadJob(job.id))?.status).toBe("error");
    const [item] = await store.listJobItems(job.id);
    expect(item?.status).toBe("error");
    expect(item?.error).toContain("yt-dlp download failed (exit 1)");
    expect(item?.error).toContain("Video unavailable. This video is private");
  });

  test("a failed playlist listing stores yt-dlp's stderr tail on the job", async () => {
    fakeYtDlp(`
process.stderr.write("ERROR: [youtube:tab] PL1: The playlist does not exist\\n");
process.exit(1);`);
    const store = new FakeStore();
    const { job, done } = await service(store).start("https://youtube.com/playlist?list=PL1");
    await done;
    const finished = await store.getDownloadJob(job.id);
    expect(finished?.status).toBe("error");
    expect(finished?.error).toContain("yt-dlp failed (exit 1)");
    expect(finished?.error).toContain("The playlist does not exist");
  });

  test("a hung download is killed at its limit and the item says it timed out", async () => {
    fakeYtDlp(`
process.stderr.write("[download] Destination: abc.webm\\n");
setInterval(() => {}, 1000);`);
    const store = new FakeStore();
    const { job, done } = await service(store, 300).start("https://youtu.be/abc");
    await done;
    const [item] = await store.listJobItems(job.id);
    expect(item?.status).toBe("error");
    expect(item?.error).toMatch(/^yt-dlp timed out after 0s: \[download\] Destination: abc\.webm/);
  });
});
