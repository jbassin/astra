import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { FakeStore } from "../db/fake-store";
import { handleUpload, titleFromFilename } from "./uploads";

describe("titleFromFilename", () => {
  test("drops the extension and tidies underscores", () => {
    expect(titleFromFilename("Boss_Theme.mp3")).toBe("Boss Theme");
    expect(titleFromFilename("track.flac")).toBe("track");
  });
  test("falls back to the raw name when empty", () => {
    expect(titleFromFilename(".mp3")).toBe(".mp3");
  });
});

describe("handleUpload (B19)", () => {
  let store: FakeStore;
  let dataDir: string;
  beforeEach(() => {
    store = new FakeStore();
    dataDir = mkdtempSync(join(tmpdir(), "orator-upload-"));
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  test("stores an audio file → a ready track, with the stub prober's loudness", async () => {
    const file = new File(["fake-audio"], "Town Theme.ogg", { type: "audio/ogg" });
    const result = await handleUpload({
      store,
      dataDir,
      files: [file],
      prober: async () => ({ loudnessLufs: -18, durationMs: 1234, format: "ogg" }),
    });
    expect(result.errors).toEqual([]);
    expect(result.created).toHaveLength(1);
    const track = result.created[0];
    expect(track?.title).toBe("Town Theme");
    expect(track?.source_type).toBe("upload");
    expect(track?.loudness_lufs).toBe(-18);
    expect(track?.status).toBe("ready");
  });

  test("rejects an unsupported file type", async () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    const result = await handleUpload({ store, dataDir, files: [file] });
    expect(result.created).toEqual([]);
    expect(result.errors[0]?.error).toContain("unsupported file type");
  });
});
