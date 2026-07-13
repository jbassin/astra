import { describe, expect, it } from "vitest";

import {
  BOOK_LICENSE,
  REMASTER_CUTOVER_DATE,
  licenseForBook,
  normalizeBookName,
} from "./licenseMap";

describe("licenseForBook: spec gate C's own three spot-checks", () => {
  it("resolves a remastered Player Core entity's book to ORC", () => {
    expect(licenseForBook("Player Core")).toBe("ORC");
  });

  it("resolves a pre-remaster Core Rulebook entity's book to OGL", () => {
    expect(licenseForBook("Core Rulebook")).toBe("OGL");
  });

  it("resolves Magic Missile's own book (Core Rulebook, AoN-only legacy spell) via the table", () => {
    // Magic Missile (AoN spell-180) carries `primary_source: "Core Rulebook"` and
    // has no Foundry pack file at all — this is the exact table lookup its
    // license resolution depends on.
    expect(licenseForBook("Core Rulebook")).toBe("OGL");
  });
});

describe("licenseForBook: broader hand-verified spot-checks", () => {
  it.each([
    ["GM Core", "ORC"],
    ["Monster Core", "ORC"],
    ["Player Core 2", "ORC"],
    ["NPC Core", "ORC"],
    ["Howl of the Wild", "ORC"],
    ["War of Immortals", "ORC"],
    ["Divine Mysteries", "ORC"],
    ["Battlecry!", "ORC"],
    ["Bestiary", "OGL"],
    ["Advanced Player's Guide", "OGL"],
    ["Gamemastery Guide", "OGL"],
    ["Kingmaker Adventure Path", "OGL"],
    ["Secrets of Magic", "OGL"],
  ] as const)("%s -> %s", (book, license) => {
    expect(licenseForBook(book)).toBe(license);
  });
});

describe("licenseForBook: the Treasure Vault anomaly (title override beats release_date)", () => {
  it("classifies the pre-remaster edition OGL", () => {
    expect(licenseForBook("Treasure Vault")).toBe("OGL");
  });

  it("classifies the (Remastered) edition ORC even though AoN's release_date is identical to the original", () => {
    expect(licenseForBook("Treasure Vault (Remastered)")).toBe("ORC");
  });
});

describe("licenseForBook: same base title split correctly by edition", () => {
  it("Guns & Gears (pre-remaster) is OGL, Guns & Gears (Remastered) is ORC", () => {
    expect(licenseForBook("Guns & Gears")).toBe("OGL");
    expect(licenseForBook("Guns & Gears (Remastered)")).toBe("ORC");
  });
});

describe("licenseForBook: unknown residue", () => {
  it("returns unknown for a book not in the table", () => {
    expect(licenseForBook("A Book From A Future Refresh Nobody Has Reviewed Yet")).toBe("unknown");
  });

  it("returns unknown for an empty string", () => {
    expect(licenseForBook("")).toBe("unknown");
  });
});

describe("normalizeBookName: the CRLF-garbage gotcha", () => {
  it("strips trailing CRLF so a dirty spelling resolves the same as the clean one", () => {
    expect(normalizeBookName("Draconic Codex\r\n")).toBe("Draconic Codex");
    expect(licenseForBook("Draconic Codex\r\n")).toBe(licenseForBook("Draconic Codex"));
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeBookName("  Core   Rulebook  ")).toBe("Core Rulebook");
  });

  it("is a no-op for an already-clean name", () => {
    expect(normalizeBookName("Player Core")).toBe("Player Core");
  });
});

describe("BOOK_LICENSE: table integrity", () => {
  it("has no duplicate keys post-normalization (every key is already normalized)", () => {
    const keys = Object.keys(BOOK_LICENSE);
    const normalized = new Set(keys.map(normalizeBookName));
    expect(normalized.size).toBe(keys.length);
  });

  it("every value is ORC or OGL (never 'unknown' — that's the resolver's fallback, not a table entry)", () => {
    for (const license of Object.values(BOOK_LICENSE)) {
      expect(["ORC", "OGL"]).toContain(license);
    }
  });

  it("REMASTER_CUTOVER_DATE is Player Core/GM Core's real release date", () => {
    expect(REMASTER_CUTOVER_DATE).toBe("2023-11-15");
  });
});
