/**
 * Session-audio same-origin normalization (decision A). The 78 committed linguist
 * transcripts bake faerrin's old absolute `static-audio.iridi.cc/<date>/audio.mp3`;
 * akasha serves the audio itself at `/audio/<date>.mp3` off the akasha-audio volume,
 * so loadTranscripts must rewrite the URL at build time (no re-gen of the JSONs).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { audioSrc, loadTranscripts } from "./transcript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../../../linguist/data");

describe("audioSrc", () => {
  it("derives the flat same-origin path from the session date", () => {
    expect(audioSrc("2025-9-11")).toBe("/audio/2025-9-11.mp3");
    expect(audioSrc("2026-6-18")).toBe("/audio/2026-6-18.mp3");
  });
});

describe("loadTranscripts audio normalization", () => {
  const transcripts = loadTranscripts(DATA_DIR);

  it("loads the committed corpus", () => {
    expect(transcripts.length).toBeGreaterThan(0);
  });

  it("rewrites every audio URL same-origin — no static-audio.iridi.cc survives", () => {
    for (const t of transcripts) {
      expect(t.audio).toBe(`/audio/${t.date}.mp3`);
      expect(t.audio).not.toContain("static-audio.iridi.cc");
    }
  });
});
