import { describe, expect, it } from "vitest";
import { detectPageType, voiceLint } from "./voiceLint";

// Mirrors the backend proposer/lint.py calibration: the BAD slop archetype trips the
// prose tells; the GOOD voice + a terse stub stay clean; page-type gates the tells.
const BAD = "Sableclutch is a large scrapyard. It is an expansive site with numerous workers.";
const GOOD =
  "Down where Hallia gives up on itself, Sableclutch swallows what the city throws away — and pays anyone willing to climb in after it.";

describe("voiceLint prose tells", () => {
  it("flags the encyclopedia opener + it-is + intensifiers on the BAD archetype", () => {
    const types = voiceLint(BAD, { pageType: "lore" }).map((l) => l.type);
    expect(types).toContain("encyclopedia_opener");
    expect(types).toContain("it_is_template");
    expect(types).toContain("intensifier");
  });

  it("leaves the GOOD house voice clean", () => {
    expect(voiceLint(GOOD, { pageType: "lore" })).toHaveLength(0);
  });

  it("flags empty prose", () => {
    expect(voiceLint("   ", { pageType: "lore" })[0]?.type).toBe("empty");
  });

  it("suppresses prose tells on non-prose page types", () => {
    // The BAD opener would trip on a lore page, but a deity-statblock is exempt.
    expect(voiceLint(BAD, { pageType: "deity-statblock" })).toHaveLength(0);
  });
});

describe("voiceLint broken_wikilink", () => {
  const known = new Set(["Org/Iconoclasm/index", "Geography/Hallia/index"]);

  it("flags a link to an absent page", () => {
    const w = voiceLint("See [[Nowhere]] for details.", { pageType: "lore", knownPages: known });
    expect(w.find((l) => l.type === "broken_wikilink")?.hit).toBe("Nowhere");
  });

  it("accepts a name-form link resolving by stem", () => {
    const w = voiceLint("Run by [[Iconoclasm]].", { pageType: "lore", knownPages: known });
    expect(w.some((l) => l.type === "broken_wikilink")).toBe(false);
  });

  it("skips link checking when no known set is supplied", () => {
    const w = voiceLint("See [[Nowhere]].", { pageType: "lore" });
    expect(w.some((l) => l.type === "broken_wikilink")).toBe(false);
  });
});

describe("detectPageType", () => {
  it("classifies a deity stat-block, timeline, stub, and lore", () => {
    expect(detectPageType("---\n---\n@deity { name }")).toBe("deity-statblock");
    expect(detectPageType("@timeline { }")).toBe("timeline");
    expect(detectPageType("---\n---\n")).toBe("stub");
    expect(detectPageType(`---\n---\n${GOOD}`)).toBe("lore");
  });
});
