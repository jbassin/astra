import { describe, expect, it } from "vitest";

import { ALIASES, PAGES } from "@/generated/site";
import { TRANSCRIPT_MINUTES } from "@/generated/transcripts";

import { hrefPath } from "./listingData";
import { isoDay } from "./listingFormat";
import {
  chronicleEpisodeData,
  chronicleIndexData,
  chronicleShowData,
  homePageData,
  tagIndexData,
  tagPageData,
  transcriptBody,
  wikiPageData,
} from "./pageData";

// The server functions are thin wrappers over these; the loaders turn `null` into a 404.

const titles = (list: { title: string }[]) => list.map((p) => p.title).toSorted();

describe("wikiPageData", () => {
  it("returns a content page with its rendered body", async () => {
    const page = await wikiPageData("Timeline");
    expect(page?.kind).toBe("content");
    if (page?.kind !== "content") return;
    expect(page.slug).toBe("Timeline");
    expect(page.view.bodyHtml.length).toBeGreaterThan(0);
  });

  it("fills in a transcript's code-split body", async () => {
    const slug = Object.keys(TRANSCRIPT_MINUTES)[0] ?? "";
    const page = await wikiPageData(slug);
    expect(page?.kind).toBe("content");
    if (page?.kind !== "content") return;
    expect(page.view.transcript).toBe(true);
    expect(page.view.bodyHtml).toContain("transcript-line");
  });

  it("returns a folder listing and an alias stub", async () => {
    expect((await wikiPageData("Divinity"))?.kind).toBe("folder");
    const alias = ALIASES[0];
    const page = await wikiPageData(alias?.slug ?? "");
    expect(page).toMatchObject({ kind: "alias", redirUrl: alias?.redirUrl });
  });

  it("returns null for an unknown path", async () => {
    expect(await wikiPageData("definitely/not/a/page")).toBeNull();
  });
});

describe("the other pages", () => {
  it("serves the home page with the index content page", () => {
    const home = homePageData();
    expect(home.slug).toBe("index");
    expect(home.view.slug).toBe("index");
  });

  it("puts the main campaign's latest session on the home page", () => {
    const { latest } = homePageData();
    const main = chronicleIndexData().find((s) => s.isMain);
    expect(main).toBeDefined();
    const dates = main?.seasons.flatMap((s) => s.episodes.map((e) => isoDay(e.date) ?? "")) ?? [];
    expect(latest && isoDay(latest.date)).toBe(dates.toSorted().at(-1));
    expect(latest?.earlier.length).toBe(Math.min(4, dates.length - 1));
  });

  it("lists the wiki pages dated on the latest session's day", () => {
    const { latest, updated } = homePageData();
    const day = latest ? isoDay(latest.date) : null;
    const expected = PAGES.filter(
      (p) =>
        p.slug !== "index" &&
        !p.slug.startsWith("Script/") &&
        p.date !== undefined &&
        isoDay(p.date) === day,
    );
    expect(titles(updated)).toEqual(titles(expected));
  });

  it("gives every folder row a section and a target that exists", async () => {
    const page = await wikiPageData("Org");
    expect(page?.kind).toBe("folder");
    if (page?.kind !== "folder") return;
    expect(page.view.title).toBe("Organisations");
    expect(page.view.entries.length).toBeGreaterThan(0);
    const rows = page.view.entries;
    const targets = await Promise.all(rows.map((r) => wikiPageData(hrefPath(page.slug, r.href))));
    rows.forEach((row, i) => {
      expect(row.section).not.toBeNull();
      expect(targets[i]?.kind, row.href).toBe(row.isFolder ? "folder" : "content");
      if (!row.isFolder) expect(row.childLabel).toBeNull();
    });
  });

  it("returns an empty body for a slug with no transcript module", async () => {
    expect(await transcriptBody("Script/Unsorted/no-such-session")).toBe("");
  });

  it("returns null for an unknown tag and a view for a known one", () => {
    expect(tagPageData("no-such-tag")).toBeNull();
    const [first] = tagIndexData().sections;
    expect(first).toBeDefined();
    const view = tagPageData(first?.tag ?? "");
    expect(view?.tag).toBe(first?.tag);
    expect(view?.entries.every((e) => e.section !== undefined)).toBe(true);
  });

  it("finds a chronicle show and episode, and null for unknown ones", () => {
    const [show] = chronicleIndexData();
    expect(show).toBeDefined();
    if (!show) return;
    expect(chronicleShowData(show.show)?.name).toBe(show.name);
    expect(chronicleShowData("no-such-show")).toBeNull();
    const season = show.seasons[0];
    const episode = season?.episodes[0];
    expect(episode).toBeDefined();
    if (!season || !episode) return;
    expect(chronicleEpisodeData(show.show, episode.date)?.slug).toBe(
      `chronicle/${show.show}/s${season.number}/${episode.date}`,
    );
    expect(chronicleEpisodeData(show.show, "1900-1-1")).toBeNull();
  });
});
