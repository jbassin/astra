import type { Campaign } from "@astra/ontology";
import { describe, expect, it } from "vitest";
import { characterFor, matchCampaign } from "./campaigns";
import type { Transcript } from "./transcript";

const nameBySlug = new Map([
  ["josh", "Josh"],
  ["jorge", "Jorge"],
]);

const campA: Campaign = {
  slug: "alpha",
  name: "Alpha Quest",
  edition: "5e",
  main: true,
  roles: [
    { player: "josh", character: "Gamemaster", character_class: "gm", descriptions: [] },
    { player: "jorge", character: "Argyle", character_class: "champion", descriptions: [] },
    { player: "jorge", character: "Arctos", character_class: null, descriptions: [] },
  ],
};
const campB: Campaign = {
  slug: "beta",
  name: "Beta Tale",
  edition: "5e",
  main: false,
  roles: [
    { player: "josh", character: "Gamemaster", character_class: "gm", descriptions: [] },
    { player: "jorge", character: "Zephyr", character_class: "rogue", descriptions: [] },
  ],
};

const lines = (...texts: string[]): Transcript => ({
  date: "2025-1-1",
  audio: "x",
  script: texts.map((text) => ({
    start: "00:00:00",
    second: 0,
    text,
    user: { name: "Jorge", color: "--textJorge" },
    duration: 1,
  })),
});

describe("matchCampaign (faerrin content heuristic, N7)", () => {
  it("returns null below the match threshold (→ Unsorted)", () => {
    expect(matchCampaign(lines("Argyle showed up"), [campA, campB], nameBySlug)).toBeNull();
  });

  it("matches the first campaign past the threshold and bills the highest-hit character", () => {
    const script = lines(...Array.from({ length: 16 }, () => "Argyle did a thing"));
    const m = matchCampaign(script, [campA, campB], nameBySlug);
    expect(m?.campaign.name).toBe("Alpha Quest");
    // Jorge has two characters; Argyle has the hits → billed as Argyle. Josh is GM.
    expect(m?.billing.Jorge).toBe("Argyle");
    expect(m?.billing.Josh).toBe("Gamemaster");
  });

  it("GM names never count toward the keyword total", () => {
    const script = lines(...Array.from({ length: 30 }, () => "Gamemaster narrates"));
    expect(matchCampaign(script, [campA, campB], nameBySlug)).toBeNull();
  });

  it("respects campaign order — earlier campaign wins when both could match", () => {
    // "Argyle" (campA) and "Zephyr" (campB) both clear threshold; campA is first.
    const both = lines(
      ...Array.from({ length: 16 }, () => "Argyle"),
      ...Array.from({ length: 16 }, () => "Zephyr"),
    );
    expect(matchCampaign(both, [campA, campB], nameBySlug)?.campaign.name).toBe("Alpha Quest");
  });

  it("characterFor falls back to the real name when unmatched", () => {
    expect(characterFor("Jorge", null)).toBe("Jorge");
  });
});
