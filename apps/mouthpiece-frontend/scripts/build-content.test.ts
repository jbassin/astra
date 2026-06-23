import { describe, expect, test } from "vitest";
// The global-setup runs build-content first, so the generated modules exist.
import { EPISODES, SITE } from "@/generated/episodes";
import { TRANSCRIPTS } from "@/generated/transcripts";

describe("build-content (reads the committed episodes-index.json)", () => {
  test("emits the catalog + SITE meta", () => {
    expect(SITE.title).toBe("Mouthpiece");
    expect(EPISODES.length).toBe(7);
  });

  test("episodes are sorted arc-then-date with the recap capstone last", () => {
    expect(EPISODES[0].episodeNo).toBe(1);
    expect(EPISODES.at(-1)?.episodeNo).toBe(0); // the mega recap
    const keys = EPISODES.map((e) => e.dateSortKey);
    expect([...keys]).toEqual([...keys].sort((a, b) => a - b));
  });

  test("catalog carries the load-bearing fields incl. a same-origin mp3Url", () => {
    const e = EPISODES[0];
    expect(e.arcTitle).toBe("Through a Song, Darkly");
    expect(e.hosts.A.name).toBe("Bram");
    expect(e.mp3Url).toBe(`/audio/${e.id}.mp3`); // no ?v= until audio is seeded
  });

  test("transcripts split into their own module, keyed by episode id, stripped", () => {
    const e = EPISODES[0];
    const lines = TRANSCRIPTS[e.id];
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].name).toMatch(/Bram|Maeve|Pip/);
    // the catalog episode shape no longer carries the transcript inline
    expect((e as Record<string, unknown>).transcript).toBeUndefined();
  });
});
