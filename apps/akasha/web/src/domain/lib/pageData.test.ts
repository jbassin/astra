import { describe, expect, it } from "vitest";

import { ALIASES } from "@/generated/site";
import { TRANSCRIPT_MINUTES } from "@/generated/transcripts";

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
  it("serves the home page as the index content page", () => {
    expect(homePageData().slug).toBe("index");
  });

  it("returns an empty body for a slug with no transcript module", async () => {
    expect(await transcriptBody("Script/Unsorted/no-such-session")).toBe("");
  });

  it("returns null for an unknown tag and a view for a known one", () => {
    expect(tagPageData("no-such-tag")).toBeNull();
    const [first] = tagIndexData().sections;
    expect(first).toBeDefined();
    expect(tagPageData(first?.tag ?? "")?.title).toBe(`Tag: ${first?.tag}`);
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
