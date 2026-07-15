import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { abbreviateBook } from "./abbreviations";

/** The committed 496-book-name fixture (D29-68) — book NAMES are not
 * gitignored, only the built `sources-index.json` is (its own
 * `entityCount`/`categoryCounts`/etc. are corpus-derived and DO belong in the
 * gitignored tree; the bare name list is a small, stable test asset).
 * Integration re-verifies this fixture still matches the freshly regenerated
 * `sources-index.json`'s book list and fails loudly on drift — this file's
 * own test only proves internal consistency (zero collisions), not
 * freshness. */
const FIXTURE_PATH = join(import.meta.dirname, "bookNames.fixture.json");

function loadBookNames(): string[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as string[];
}

describe("abbreviateBook (D29-68)", () => {
  it("the committed fixture has exactly 496 distinct book names", () => {
    const names = loadBookNames();
    expect(names).toHaveLength(496);
    expect(new Set(names).size).toBe(496);
  });

  it("matches the stakeholder's own worked example verbatim", () => {
    expect(abbreviateBook("Pathfinder Society Scenario #6-13: All That Glitters")).toBe("PS:ATG");
  });

  it("returns undefined for the corpus's own no-source sentinel", () => {
    expect(abbreviateBook("unknown")).toBeUndefined();
  });

  it("returns undefined (never a blank string) for a book neither tier covers", () => {
    expect(abbreviateBook("Some Entirely Made-Up Book Nobody Curated")).toBeUndefined();
  });

  it("every book in the fixture resolves to either a non-empty abbreviation or undefined", () => {
    for (const book of loadBookNames()) {
      const abbrev = abbreviateBook(book);
      if (abbrev !== undefined) {
        expect(abbrev.length).toBeGreaterThan(0);
      }
    }
  });

  it("zero-collision: no two distinct books in the fixture map to the same abbreviation", () => {
    const names = loadBookNames();
    const byAbbrev = new Map<string, string[]>();
    for (const book of names) {
      const abbrev = abbreviateBook(book);
      if (abbrev === undefined) continue; // undefined isn't an abbreviation — no collision to check
      const bucket = byAbbrev.get(abbrev) ?? [];
      bucket.push(book);
      byAbbrev.set(abbrev, bucket);
    }
    const collisions = [...byAbbrev.entries()].filter(([, books]) => books.length > 1);
    expect(collisions).toEqual([]);
  });

  it("known community-convention codes for flagship rulebooks", () => {
    expect(abbreviateBook("Core Rulebook")).toBe("CRB");
    expect(abbreviateBook("Advanced Player's Guide")).toBe("APG");
    expect(abbreviateBook("Gamemastery Guide")).toBe("GMG");
    expect(abbreviateBook("Secrets of Magic")).toBe("SoM");
    expect(abbreviateBook("Guns & Gears")).toBe("G&G");
    expect(abbreviateBook("Treasure Vault")).toBe("TV");
    expect(abbreviateBook("GM Core")).toBe("GMC");
    expect(abbreviateBook("Player Core")).toBe("PC1");
  });

  it("disambiguates the short PFS-form (curated tier) from the long Pathfinder Society Scenario form (generated tier) for the same real scenario", () => {
    const short = abbreviateBook("PFS Scenario #1-03: Escaping the Grave");
    const long = abbreviateBook("Pathfinder Society Scenario #1-03: Escaping the Grave");
    expect(short).toBeDefined();
    expect(long).toBeDefined();
    expect(short).not.toBe(long);
    expect(short).toBe("PFS1-03:EG");
    expect(long).toBe("PS:EG");
  });

  it("disambiguates near-duplicate AP-volume strings that differ only by punctuation/typo", () => {
    const known = abbreviateBook("Pathfinder #203 Shepherd of Decay");
    const dup = abbreviateBook("Pathfinder #203: Shepherd of Decay");
    expect(known).toBe("AP203");
    expect(dup).toBeDefined();
    expect(dup).not.toBe(known);
  });

  it("generates a PS: code for an unseen (but shaped) Society scenario title, matching the algorithm", () => {
    // Not individually curated/overridden — proves the generator itself runs
    // (not just the fixture's own pre-baked overrides).
    expect(
      abbreviateBook("Pathfinder Society Scenario #6-01: Intro to the Year of Immortal Influence"),
    ).toBe("PS:IYII");
  });
});
