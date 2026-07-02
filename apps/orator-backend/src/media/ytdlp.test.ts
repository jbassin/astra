import { describe, expect, test } from "vitest";
import { extractVideoId, isPlaylistUrl } from "./ytdlp";

describe("isPlaylistUrl (B20/B21)", () => {
  test("a real list= is a playlist", () => {
    expect(isPlaylistUrl("https://youtube.com/watch?v=abc&list=PL123")).toBe(true);
  });
  test("no list= is a single video", () => {
    expect(isPlaylistUrl("https://youtube.com/watch?v=abc")).toBe(false);
  });
  test("auto-generated radio/mix lists are treated as a single video", () => {
    expect(isPlaylistUrl("https://youtube.com/watch?v=abc&list=RD123")).toBe(false);
    expect(isPlaylistUrl("https://youtube.com/watch?v=abc&list=RDMM999")).toBe(false);
  });
  test("garbage url → false", () => {
    expect(isPlaylistUrl("not a url")).toBe(false);
  });
});

describe("extractVideoId", () => {
  test("reads v= from a watch url", () => {
    expect(extractVideoId("https://youtube.com/watch?v=abc123")).toBe("abc123");
  });
  test("reads the path of a youtu.be url", () => {
    expect(extractVideoId("https://youtu.be/xyz789")).toBe("xyz789");
  });
  test("null when absent / unparseable", () => {
    expect(extractVideoId("https://youtube.com/feed")).toBeNull();
    expect(extractVideoId("nonsense")).toBeNull();
  });
});
