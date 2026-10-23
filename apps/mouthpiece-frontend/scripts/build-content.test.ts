import { describe, expect, test } from "vitest";

// The global-setup runs build-content first, so the generated modules exist.
import { EPISODES, SITE } from "@/generated/episodes";
import { TRANSCRIPTS } from "@/generated/transcripts";

function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`expected ${what}`);
  return value;
}

describe("build-content (reads the committed episodes-index.json)", () => {
  test("emits the catalog + SITE meta", () => {
    expect(SITE.title).toBe("Mouthpiece");
    // The snapshot is live-derived (grows as the pipeline runs) — assert a floor, not
    // an exact count, matching akasha's content-agnostic cutover posture.
    expect(EPISODES.length).toBeGreaterThanOrEqual(7);
  });

  test("episodes are sorted by date; recaps and specials are episode 0", () => {
    expect(defined(EPISODES[0], "an episode").episodeNo).toBe(1);
    const keys = EPISODES.map((e) => e.dateSortKey);
    expect([...keys]).toEqual([...keys].sort((a, b) => a - b));
    // The catalog is live data, so assert its shape, not its counts: recaps and
    // specials carry episodeNo 0 and a "-recap-of-" id; every session is numbered.
    for (const e of EPISODES) {
      expect(Number.isInteger(e.episodeNo) && e.episodeNo >= 0).toBe(true);
      expect(e.episodeNo === 0).toBe(e.id.includes("-recap-of-"));
    }
  });

  test("catalog carries the load-bearing fields incl. a same-origin mp3Url", () => {
    const e = defined(EPISODES[0], "an episode");
    expect(e.arcTitle).toBe("Through a Song, Darkly");
    expect(e.hosts.A?.name).toBe("Bram");
    // EPISODES[0] is a historical (metadata-only) entry → no audioVersion → no ?v=
    expect(e.mp3Url).toBe(`/audio/${e.id}.mp3`);
  });

  test("transcripts split into their own module, keyed by episode id, stripped", () => {
    const e = defined(EPISODES[0], "an episode");
    const lines = defined(TRANSCRIPTS[e.id], "a transcript");
    expect(lines.length).toBeGreaterThan(0);
    expect(defined(lines[0], "a transcript line").name).toMatch(/Bram|Maeve|Pip/);
    // the catalog episode shape no longer carries the transcript inline
    expect(e).not.toHaveProperty("transcript");
  });
});
