import { describe, expect, test } from "vitest";
// The global-setup runs build-content first, so the generated module exists.
import { EPISODES, type GeneratedEpisode, SITE } from "@/generated/episodes";

describe("build-content (placeholder)", () => {
  test("emits a typed EPISODES module + SITE meta", () => {
    expect(Array.isArray(EPISODES)).toBe(true);
    expect(SITE.title).toBe("Mouthpiece");
    expect(SITE.description).toBe("The Færrin podcast");
  });

  test("the GeneratedEpisode shape carries the load-bearing fields", () => {
    // a compile-time + runtime sanity check on the placeholder shape slice 3 fills
    const ep: GeneratedEpisode = {
      id: "000.through-a-song-darkly.2026-5-7",
      arcNo: 0,
      arcSlug: "through-a-song-darkly",
      arcTitle: "Through a Song, Darkly",
      episodeNo: 1,
      isMain: true,
      date: "2026-5-7",
      title: "We're Hot Rod People Now",
      episodeTitle: "We're Hot Rod People Now",
      hosts: { A: { name: "Bram", persona: "warm" } },
      synopsis: "…",
      durationMs: 0,
      mp3Url: "/audio/000.through-a-song-darkly.2026-5-7.mp3",
      transcript: [{ speaker: "A", name: "Bram", text: "hi" }],
    };
    expect(ep.hosts.A.name).toBe("Bram");
  });
});
