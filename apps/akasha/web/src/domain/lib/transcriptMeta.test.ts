import { describe, expect, it } from "vitest";

import type { ChronicleEpisode, ChronicleShow } from "./chronicleTypes";
import {
  durationLabel,
  longDate,
  shortDate,
  type TranscriptMeta,
  transcriptPageView,
  transcriptTreeLabel,
} from "./transcriptMeta";

const ep = (date: string, title: string, synopsis = ""): ChronicleEpisode => ({
  date,
  episodeNumber: 0,
  title,
  synopsis,
  keyBeats: [],
  charactersPresent: [],
  locations: [],
  factions: [],
  items: [],
  cliffhanger: "",
  href: null,
});

const MAIN: ChronicleShow = {
  show: "through-a-song-darkly",
  name: "Through a Song, Darkly",
  isMain: true,
  campaignNumber: 3,
  seasonCount: 2,
  episodeCount: 5,
  seasons: [
    {
      number: 1,
      title: "Delivery Boys",
      arcSummary: "",
      episodes: [ep("2026-1-6", "One"), ep("2026-1-13", "Two")],
    },
    {
      number: 2,
      title: "Season 2",
      arcSummary: "",
      episodes: [
        ep("2026-2-3", "Three"),
        ep("2026-2-17", "A Painting for the Machine", "The party reads."),
        // A summary the chronicle doesn't have yet: its title is the date.
        ep("2026-2-24", "2026-2-24"),
      ],
    },
  ],
};

const meta = (date: string, chars = true): TranscriptMeta => ({
  date,
  durationSeconds: 12_838,
  speakers: [
    { user: "Josh", char: chars ? "Gamemaster" : "Josh", lines: 1411 },
    { user: "Mike", char: chars ? "Benny" : "Mike", lines: 429 },
  ],
});

const folder = "Script/Through-a-Song,-Darkly";
const siblings = ["2025-8-11", "2026-1-6", "2026-1-13", "2026-2-3", "2026-2-17", "2026-2-24"].map(
  (date) => ({ slug: `${folder}/${date}`, date }),
);

describe("dates and durations", () => {
  it("formats session dates in UTC", () => {
    expect(longDate("2026-2-17")).toBe("Tuesday 17 February 2026");
    expect(longDate("2025-9-11")).toBe("Thursday 11 September 2025");
    expect(shortDate("2026-2-17")).toBe("17 Feb 2026");
    expect(longDate("not-a-date")).toBe("not-a-date");
  });

  it("rounds a duration to the minute", () => {
    expect(durationLabel(12_838)).toBe("3 h 34 min");
    expect(durationLabel(47 * 60 + 10)).toBe("47 min");
    expect(durationLabel(7200)).toBe("2 h");
    expect(durationLabel(5)).toBe("1 min");
  });
});

describe("transcriptPageView", () => {
  it("labels a session the chronicle knows with its episode", () => {
    const view = transcriptPageView({
      slug: `${folder}/2026-2-17`,
      meta: meta("2026-2-17"),
      shows: [MAIN],
      siblings,
    });
    expect(view.title).toBe("A Painting for the Machine");
    expect(view.campaign).toBe("Through a Song, Darkly");
    expect(view.campaignHref).toBe("/chronicle/through-a-song-darkly");
    expect(view.season).toBe(2);
    expect(view.sessionLabel).toBe("Session 4, season 2 episode 2");
    expect(view.dateLabel).toBe("Tuesday 17 February 2026");
    expect(view.dateTime).toBe("2026-02-17");
    expect(view.durationLabel).toBe("3 h 34 min");
    expect(view.synopsis).toBe("The party reads.");
    expect(view.chronicleHref).toBe("/chronicle/through-a-song-darkly/2026-2-17");
    expect(view.hasCharacters).toBe(true);
  });

  it("groups the campaign's sessions by season, with the rest last", () => {
    const { rail } = transcriptPageView({
      slug: `${folder}/2026-2-17`,
      meta: meta("2026-2-17"),
      shows: [MAIN],
      siblings,
    });
    expect(rail.heading).toBe("Through a Song, Darkly");
    expect(rail.subtitle).toBe("Main campaign, 6 sessions");
    expect(rail.groups.map((g) => [g.number, g.label, g.open])).toEqual([
      [1, "Delivery Boys", false],
      [2, "Season 2", true],
      [null, "Other sessions", false],
    ]);
    const season2 = rail.groups[1]?.items ?? [];
    expect(season2.map((i) => i.title)).toEqual([
      "Three",
      "A Painting for the Machine",
      "24 February 2026",
    ]);
    expect(season2[1]).toMatchObject({
      date: "17 Feb 2026",
      href: "/Script/Through-a-Song,-Darkly/2026-2-17",
      current: true,
    });
    expect(rail.groups[2]?.items).toEqual([
      {
        title: "11 August 2025",
        date: null,
        href: "/Script/Through-a-Song,-Darkly/2025-8-11",
        current: false,
      },
    ]);
  });
});

describe("transcriptPageView for sessions the chronicle doesn't know", () => {
  it("falls back to the date for a session the chronicle doesn't know", () => {
    const view = transcriptPageView({
      slug: `${folder}/2025-8-11`,
      meta: meta("2025-8-11"),
      shows: [MAIN],
      siblings,
    });
    expect(view.title).toBe("Session of 11 August 2025");
    expect(view.season).toBeNull();
    expect(view.sessionLabel).toBeNull();
    expect(view.synopsis).toBeNull();
    expect(view.chronicleHref).toBeNull();
    expect(view.rail.groups.at(-1)?.open).toBe(true);
  });

  it("treats an episode without a summary as unknown by title only", () => {
    const view = transcriptPageView({
      slug: `${folder}/2026-2-24`,
      meta: meta("2026-2-24"),
      shows: [MAIN],
      siblings,
    });
    expect(view.title).toBe("Session of 24 February 2026");
    expect(view.sessionLabel).toBe("Session 5, season 2 episode 3");
  });

  it("lists a campaign the chronicle doesn't know by date, ungrouped", () => {
    const fae = ["2025-9-25", "2025-9-11", "2025-9-18"].map((date) => ({
      slug: `Script/Fae-and-Forest/${date}`,
      date,
    }));
    const view = transcriptPageView({
      slug: "Script/Fae-and-Forest/2025-9-11",
      meta: meta("2025-9-11", false),
      shows: [MAIN],
      siblings: fae,
    });
    expect(view.campaign).toBe("Fae and Forest");
    expect(view.campaignHref).toBe("/Script/Fae-and-Forest");
    expect(view.hasCharacters).toBe(false);
    expect(view.rail.subtitle).toBe("3 sessions");
    expect(view.rail.groups).toHaveLength(1);
    expect(view.rail.groups[0]?.label).toBeNull();
    expect(view.rail.groups[0]?.items.map((i) => i.title)).toEqual([
      "11 September 2025",
      "18 September 2025",
      "25 September 2025",
    ]);
  });
});

describe("transcriptTreeLabel", () => {
  it("uses the episode title, else the date", () => {
    expect(transcriptTreeLabel("2026-2-17", [MAIN])).toBe("A Painting for the Machine");
    expect(transcriptTreeLabel("2026-2-24", [MAIN])).toBe("24 February 2026");
    expect(transcriptTreeLabel("2025-8-11", [MAIN])).toBe("11 August 2025");
  });
});
