import { describe, expect, it } from "vitest";

import type { ChronicleEpisode, ChronicleShow } from "./chronicleTypes";
import {
  descendantCounts,
  folderDisplayTitle,
  hrefPath,
  latestSession,
  listingRows,
  pagesUpdatedOn,
} from "./listingData";
import type { PageEntryView } from "./runtimeSite";

const episode = (date: string, n: number, href: string | null = `/Script/X/${date}`) =>
  ({
    date,
    episodeNumber: n,
    title: `Episode ${date}`,
    synopsis: `What happened on ${date}.`,
    keyBeats: [],
    charactersPresent: [],
    locations: [],
    factions: [],
    items: [],
    cliffhanger: "",
    href,
  }) satisfies ChronicleEpisode;

const show = (slug: string, isMain: boolean, seasons: ChronicleEpisode[][]): ChronicleShow => ({
  show: slug,
  name: slug.toUpperCase(),
  isMain,
  seasonCount: seasons.length,
  episodeCount: seasons.flat().length,
  seasons: seasons.map((episodes, i) => ({
    number: i + 1,
    title: `Arc ${i + 1}`,
    arcSummary: "",
    episodes,
  })),
});

describe("latestSession", () => {
  const shows = [
    show("side", false, [[episode("2026-12-1", 1)]]),
    show("main", true, [
      [episode("2026-9-3", 1), episode("2026-9-17", 2)],
      [episode("2026-10-1", 1), episode("2026-10-5", 2, null), episode("2026-10-12", 3)],
    ]),
  ];

  it("takes the main campaign's latest episode, by date, with the four before it", () => {
    const latest = latestSession(shows);
    expect(latest).toMatchObject({
      show: "main",
      showName: "MAIN",
      seasonNumber: 2,
      seasonTitle: "Arc 2",
      episodeNumber: 3,
      date: "2026-10-12",
      transcriptHref: "/Script/X/2026-10-12",
      chronicleHref: "/chronicle/main/2026-10-12",
    });
    expect(latest?.earlier.map((e) => e.date)).toEqual([
      "2026-10-5",
      "2026-10-1",
      "2026-9-17",
      "2026-9-3",
    ]);
  });

  it("links an earlier session with no transcript to its chronicle page", () => {
    expect(latestSession(shows)?.earlier[0]?.href).toBe("/chronicle/main/2026-10-5");
  });

  it("is null without a chronicle", () => {
    expect(latestSession([])).toBeNull();
    expect(latestSession([show("main", true, [])])).toBeNull();
  });
});

describe("pagesUpdatedOn", () => {
  const pages = [
    {
      slug: "People/Slade",
      simple: "People/Slade",
      title: "Slade",
      date: "2026-10-29T04:00:00.000Z",
    },
    {
      slug: "Divinity/War",
      simple: "Divinity/War",
      title: "War",
      date: "2026-10-29T04:00:00.000Z",
    },
    {
      slug: "Org/Ætherion-Limited/index",
      simple: "Org/Ætherion-Limited/",
      title: "Ætherion Limited",
      date: "2026-10-29T04:00:00.000Z",
    },
    {
      slug: "Divinity/Ashen-Pact",
      simple: "Divinity/Ashen-Pact",
      title: "Ashen Pact",
      date: "2026-10-29T04:00:00.000Z",
    },
    {
      slug: "Bestiary/Old",
      simple: "Bestiary/Old",
      title: "Old",
      date: "2026-10-28T04:00:00.000Z",
    },
    { slug: "Bestiary/Undated", simple: "Bestiary/Undated", title: "Undated" },
    { slug: "index", simple: "", title: "Heart of Hearts", date: "2026-10-29T04:00:00.000Z" },
    {
      slug: "Script/Through-a-Song,-Darkly/2026-10-29",
      simple: "Script/Through-a-Song,-Darkly/2026-10-29",
      title: "2026-10-29",
      date: "2026-10-29T04:00:00.000Z",
    },
  ];

  it("lists the wiki pages changed on the session's day, by section then title", () => {
    expect(pagesUpdatedOn(pages, "2026-10-29")).toEqual([
      { title: "Ashen Pact", href: "/Divinity/Ashen-Pact", section: "divinity" },
      { title: "War", href: "/Divinity/War", section: "divinity" },
      {
        title: "Ætherion Limited",
        href: `/Org/${encodeURIComponent("Ætherion")}-Limited`,
        section: "org",
      },
      { title: "Slade", href: "/People/Slade", section: "people" },
    ]);
  });

  it("is empty for a day nothing changed", () => {
    expect(pagesUpdatedOn(pages, "2026-1-1")).toEqual([]);
  });
});

const entry = (title: string, href: string, isFolder: boolean): PageEntryView => ({
  title,
  href,
  tags: [],
  isFolder,
});

describe("listing rows", () => {
  it("counts the pages under each folder, but not a folder's own index", () => {
    const counts = descendantCounts([
      "Org/index",
      "Org/Iridescent-Church/index",
      "Org/Iridescent-Church/People/Walter-Stoke",
      "Org/Iridescent-Church/Convox/index",
      "Org/Blackline",
    ]);
    expect(counts.get("Org")).toBe(4);
    expect(counts.get("Org/Iridescent-Church")).toBe(2);
    expect(counts.get("Org/Iridescent-Church/Convox")).toBeUndefined();
  });

  it("resolves a row's relative href against the listing's slug", () => {
    expect(hrefPath("Org/index", "../Org/Iridescent-Church/")).toBe("Org/Iridescent-Church");
    expect(hrefPath("tags/Divinity/Fiends", "../../Divinity/Fiends/Asmodeus")).toBe(
      "Divinity/Fiends/Asmodeus",
    );
    expect(hrefPath("Org/index", "../Org/Ætherion-Limited")).toBe("Org/Ætherion-Limited");
  });

  it("adds each row's section and a folder's page count", () => {
    const counts = new Map([
      ["Org/Iridescent-Church", 12],
      ["Org/Iridescent-Church/People", 1],
      ["Script/Fey-in-the-Mists", 3],
    ]);
    const rows = listingRows(
      "Org/Iridescent-Church/index",
      [
        entry("Iridescent Church", "../../Org/Iridescent-Church/", true),
        entry("People", "../../Org/Iridescent-Church/People", true),
        entry("Empty", "../../Org/Empty/", true),
        entry("Pontifex", "../../Org/Iridescent-Church/Pontifex", false),
      ],
      counts,
    );
    expect(rows.map((r) => [r.section, r.childLabel])).toEqual([
      ["org", "12 pages"],
      ["people", "1 page"],
      ["org", null],
      ["org", null],
    ]);
    const [campaign] = listingRows(
      "Script/index",
      [entry("Fey in the Mists", "../Script/Fey-in-the-Mists", true)],
      counts,
    );
    expect(campaign).toMatchObject({ section: "sessions", childLabel: "3 transcripts" });
  });

  it("titles a section's folder by the section and drops the Folder prefix", () => {
    expect(folderDisplayTitle("Org", "Org")).toBe("Organisations");
    expect(folderDisplayTitle("Script", "Script")).toBe("Script");
    expect(folderDisplayTitle("Iridescent Church", "Org/Iridescent-Church")).toBe(
      "Iridescent Church",
    );
    expect(folderDisplayTitle("Folder: Org/Amber-Call/People", "Org/Amber-Call/People")).toBe(
      "People",
    );
    expect(folderDisplayTitle("Folder: Script/Fey-in-the-Mists", "Script/Fey-in-the-Mists")).toBe(
      "Fey in the Mists",
    );
  });
});
