import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AonFacetError, AonDocMetaSchema, aonSkipReason, extractAonMeta } from "./aonFacets";
import type { AonHit } from "./aonFacets";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "tests",
  "fixtures",
  "aon-data",
);

function readFixture(name: string): AonHit {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as AonHit;
}

describe("extractAonMeta: real fixture — spell family with remaster pairing", () => {
  it("extracts the legacy half (Heal, spell-148) — remaster_id populated, license OGL, edition legacy", () => {
    const meta = extractAonMeta("spell", readFixture("spell-heal-legacy"));
    expect(AonDocMetaSchema.safeParse(meta).success).toBe(true);
    expect(meta.aonId).toBe("spell-148");
    expect(meta.slug).toBe("heal");
    expect(meta.name).toBe("Heal");
    expect(meta.level).toBe(1);
    expect(meta.traits).toEqual(["Healing", "Necromancy", "Positive", "Vitality"]);
    expect(meta.primarySource).toEqual({ book: "Core Rulebook", page: 343 });
    expect(meta.license).toBe("OGL");
    expect(meta.remasterId).toEqual(["spell-1554"]);
    expect(meta.legacyId).toEqual([]);
    expect(meta.edition).toBe("legacy");
    expect(meta.hasMarkdown).toBe(true);
  });

  it("extracts the remaster half (Heal, spell-1554) — legacy_id populated, license ORC, edition remaster", () => {
    const meta = extractAonMeta("spell", readFixture("spell-heal-remaster"));
    expect(meta.aonId).toBe("spell-1554");
    expect(meta.slug).toBe("heal");
    expect(meta.primarySource).toEqual({ book: "Player Core", page: 335 });
    expect(meta.license).toBe("ORC");
    expect(meta.remasterId).toEqual([]);
    expect(meta.legacyId).toEqual(["spell-148"]);
    expect(meta.edition).toBe("remaster");
  });

  it("resolves Magic Missile (AoN-only legacy spell, no Foundry pack file) to OGL via the book table", () => {
    const meta = extractAonMeta("spell", readFixture("spell-magic-missile"));
    expect(meta.name).toBe("Magic Missile");
    expect(meta.primarySource.book).toBe("Core Rulebook");
    expect(meta.license).toBe("OGL");
    expect(meta.remasterId).toEqual(["spell-1536"]); // Force Barrage
    expect(meta.edition).toBe("legacy");
  });
});

describe("extractAonMeta: real fixture — creature family with level + traits", () => {
  it("extracts level, traits, and a size/alignment-flavored trait list", () => {
    const meta = extractAonMeta("creature", readFixture("creature-sample"));
    expect(meta.name).toBe("Aasimar Redeemer");
    expect(meta.level).toBe(5);
    expect(meta.traits).toEqual(["Aasimar", "Human", "Humanoid", "NG", "Medium"]);
    expect(meta.primarySource).toEqual({ book: "Bestiary", page: 263 });
    expect(meta.license).toBe("OGL");
    expect(meta.remasterId).toEqual([]);
    expect(meta.legacyId).toEqual([]);
    // Unpaired + pre-cutover release_date -> the release_date fallback, not the
    // remaster/legacy_id signal (neither is populated on this doc).
    expect(meta.edition).toBe("legacy");
  });
});

describe("extractAonMeta: D29-33b creature family (creature_family_markdown)", () => {
  function creatureHit(creatureFamilyMarkdown: unknown): AonHit {
    return {
      _id: "creature-9000",
      _source: {
        name: "Synthetic Wyrm",
        url: "/Monsters.aspx?ID=9000",
        release_date: "2020-01-01",
        primary_source: "Bestiary",
        creature_family_markdown: creatureFamilyMarkdown,
      },
    };
  }

  it("extracts the display name out of the markdown-link form", () => {
    const meta = extractAonMeta("creature", creatureHit("[Demon](/MonsterFamilies.aspx?ID=28)"));
    expect(meta.family).toBe("Demon");
  });

  it("extracts a comma-bearing family name (e.g. 'Elemental, Water')", () => {
    const meta = extractAonMeta(
      "creature",
      creatureHit("[Elemental, Water](/MonsterFamilies.aspx?ID=343)"),
    );
    expect(meta.family).toBe("Elemental, Water");
  });

  it("leaves family undefined when creature_family_markdown is empty (the common case, 43% of real docs)", () => {
    const meta = extractAonMeta("creature", creatureHit(""));
    expect(meta.family).toBeUndefined();
  });

  it("leaves family undefined when creature_family_markdown is absent", () => {
    const meta = extractAonMeta("creature", creatureHit(undefined));
    expect(meta.family).toBeUndefined();
  });

  it("fails soft (undefined, not a throw) on a malformed markdown-link value", () => {
    const meta = extractAonMeta("creature", creatureHit("not a markdown link"));
    expect(meta.family).toBeUndefined();
  });

  it("never extracts family for a non-creature category, even with the same raw field present", () => {
    const hit: AonHit = {
      _id: "hazard-9000",
      _source: {
        name: "Synthetic Trap",
        url: "/Hazards.aspx?ID=9000",
        release_date: "2020-01-01",
        primary_source: "Bestiary",
        creature_family_markdown: "[Demon](/MonsterFamilies.aspx?ID=28)",
      },
    };
    const meta = extractAonMeta("hazard", hit);
    expect(meta.family).toBeUndefined();
  });
});

describe("extractAonMeta: real fixture — rules family with breadcrumbs", () => {
  it("carries breadcrumbs (the P4 rules-tree input) and no level/traits", () => {
    const meta = extractAonMeta("rules", readFixture("rules-sample"));
    expect(meta.breadcrumbs).toEqual(["Mythic Rules", "Designing Mythic Encounters"]);
    expect(meta.level).toBeUndefined();
    expect(meta.traits).toEqual([]);
    expect(meta.license).toBe("ORC"); // War of Immortals, 2024-10-30
  });
});

describe("extractAonMeta: real fixture — sidebar (no rarity, no level/traits)", () => {
  it("round-trips with rarity/level/traits absent", () => {
    const meta = extractAonMeta("sidebar", readFixture("sidebar-sample"));
    expect(meta.rarity).toBeUndefined();
    expect(meta.level).toBeUndefined();
    expect(meta.traits).toEqual([]);
    expect(meta.breadcrumbs).toBeUndefined();
  });
});

describe("extractAonMeta: real fixture — source (no page number in primary_source_raw)", () => {
  it("leaves primarySource.page undefined when the raw string has no 'pg.'", () => {
    const meta = extractAonMeta("source", readFixture("source-sample"));
    expect(meta.primarySource).toEqual({ book: "A Caroling Horse (Of Course. Of Course.)" });
    expect(meta.primarySource.page).toBeUndefined();
  });
});

describe("extractAonMeta: real fixture — article stub", () => {
  it("extracts a citation-stub doc same as any other category", () => {
    const meta = extractAonMeta("article", readFixture("article-sample"));
    expect(meta.name).toBe("A History of Secrets");
    expect(meta.primarySource).toEqual({ book: "Pathfinder #206: Bring the House Down", page: 74 });
    expect(meta.license).toBe("ORC"); // 2024-09-15, post-cutover
  });
});

describe("extractAonMeta: array normalization (remasterId/legacyId, D29-1)", () => {
  it("normalizes a scalar remaster_id/legacy_id to a single-element array (defensive — never seen live)", () => {
    const hit: AonHit = {
      _id: "spell-9999",
      _source: {
        name: "Synthetic",
        url: "/Spells.aspx?ID=9999",
        release_date: "2020-01-01",
        primary_source: "Core Rulebook",
        remaster_id: "spell-1", // scalar, not array
        legacy_id: null,
      },
    };
    const meta = extractAonMeta("spell", hit);
    expect(meta.remasterId).toEqual(["spell-1"]);
    expect(meta.legacyId).toEqual([]);
  });

  it("normalizes null/absent remaster_id and legacy_id to empty arrays", () => {
    const hit: AonHit = {
      _id: "spell-9998",
      _source: {
        name: "Synthetic Two",
        url: "/Spells.aspx?ID=9998",
        release_date: "2020-01-01",
        primary_source: "Core Rulebook",
      },
    };
    const meta = extractAonMeta("spell", hit);
    expect(meta.remasterId).toEqual([]);
    expect(meta.legacyId).toEqual([]);
  });
});

describe("extractAonMeta: multi-citation source (source/source_raw arrays)", () => {
  it("extracts every source citation, not just the primary one", () => {
    const hit: AonHit = {
      _id: "archetype-9000",
      _source: {
        name: "Bright Lion",
        url: "/Archetypes.aspx?ID=9000",
        release_date: "2021-10-13",
        primary_source: "Pathfinder #172: Secrets of the Temple City",
        primary_source_raw: "Pathfinder #172: Secrets of the Temple City pg. 79",
        source: ["Pathfinder #172: Secrets of the Temple City", "Legends"],
        source_raw: ["Pathfinder #172: Secrets of the Temple City pg. 79", "Legends pg. 101"],
      },
    };
    const meta = extractAonMeta("archetype", hit);
    expect(meta.allSources).toEqual([
      { book: "Pathfinder #172: Secrets of the Temple City", page: 79 },
      { book: "Legends", page: 101 },
    ]);
  });
});

describe("extractAonMeta: the CRLF book-name gotcha", () => {
  it("cleans a CRLF-dirty primary_source before it lands in primarySource.book / license lookup", () => {
    const hit: AonHit = {
      _id: "archetype-333",
      _source: {
        name: "Draconic Something",
        url: "/Archetypes.aspx?ID=333",
        release_date: "2025-11-05",
        primary_source: "Draconic Codex\r\n",
        primary_source_raw: "Draconic Codex\r\n pg. 12",
      },
    };
    const meta = extractAonMeta("archetype", hit);
    expect(meta.primarySource.book).toBe("Draconic Codex");
    expect(meta.license).toBe("ORC");
  });
});

describe("extractAonMeta: hard-fail on missing critical fields", () => {
  it("throws AonFacetError for a doc with no name", () => {
    const hit: AonHit = {
      _id: "spell-0000",
      _source: { url: "/Spells.aspx?ID=0", release_date: "2020-01-01", primary_source: "X" },
    };
    expect(() => extractAonMeta("spell", hit)).toThrow(AonFacetError);
    expect(() => extractAonMeta("spell", hit)).toThrow(/spell-0000/);
  });

  it("throws AonFacetError for a doc with no url", () => {
    const hit: AonHit = {
      _id: "spell-0001",
      _source: { name: "No Url", release_date: "2020-01-01", primary_source: "X" },
    };
    expect(() => extractAonMeta("spell", hit)).toThrow(AonFacetError);
  });

  it("throws AonFacetError for a doc with no release_date", () => {
    const hit: AonHit = {
      _id: "spell-0002",
      _source: { name: "No Date", url: "/Spells.aspx?ID=2", primary_source: "X" },
    };
    expect(() => extractAonMeta("spell", hit)).toThrow(AonFacetError);
  });

  it("throws AonFacetError for a doc with no primary_source", () => {
    const hit: AonHit = {
      _id: "spell-0003",
      _source: { name: "No Source", url: "/Spells.aspx?ID=3", release_date: "2020-01-01" },
    };
    expect(() => extractAonMeta("spell", hit)).toThrow(AonFacetError);
  });
});

describe("aonSkipReason: the empty-name fragment class (53 real docs)", () => {
  it("flags an empty-string name (the real action-1140 activation-fragment shape)", () => {
    const hit: AonHit = {
      _id: "action-1140",
      _source: {
        name: "",
        url: "/Actions.aspx?ID=1140",
        release_date: "2022-02-23",
        primary_source: "Pathfinder #176: Lost Mammoth Valley",
        exclude_from_search: true,
      },
    };
    expect(aonSkipReason(hit)).toBe("aonNamelessFragment");
    // and extraction still hard-fails if a caller ignores the skip.
    expect(() => extractAonMeta("action", hit)).toThrow(AonFacetError);
  });

  it("flags a whitespace-only or absent name too", () => {
    expect(aonSkipReason({ _id: "x-1", _source: { name: "   ", url: "/X.aspx?ID=1" } })).toBe(
      "aonNamelessFragment",
    );
    expect(aonSkipReason({ _id: "x-2", _source: { url: "/X.aspx?ID=2" } })).toBe(
      "aonNamelessFragment",
    );
  });

  it("returns undefined for a normally-named doc", () => {
    expect(aonSkipReason(readFixture("spell-heal-legacy"))).toBeUndefined();
  });
});
