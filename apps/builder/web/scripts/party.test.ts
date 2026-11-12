// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isPartyWord } from "@/domain/party";

import { generatePhrase, resolvePhrase, WORDS } from "./party";

describe("the word list", () => {
  it("has at least 500 distinct lower-case words of 3 to 7 letters", () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.length).toBeGreaterThanOrEqual(500);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,7}$/);
  });
});

describe("generatePhrase", () => {
  it("joins three list words with hyphens and passes the phrase pattern", () => {
    for (let i = 0; i < 50; i++) {
      const phrase = generatePhrase();
      const parts = phrase.split("-");
      expect(parts).toHaveLength(3);
      for (const part of parts) expect(WORDS).toContain(part);
      expect(isPartyWord(phrase)).toBe(true);
    }
  });
});

describe("resolvePhrase", () => {
  it("uses a good argument as given", () => {
    expect(resolvePhrase("amber-otter-quilt")).toBe("amber-otter-quilt");
    expect(resolvePhrase("owl")).toBe("owl");
  });

  it("generates a phrase with no argument", () => {
    expect(isPartyWord(resolvePhrase())).toBe(true);
  });

  it("refuses a bad argument", () => {
    for (const bad of [
      "ab",
      "--------",
      "-owl",
      "owl-",
      "Owl",
      "a--b",
      "has spaces",
      "x".repeat(65),
      "",
    ]) {
      expect(() => resolvePhrase(bad)).toThrow();
    }
  });
});

describe("isPartyWord", () => {
  it("accepts short and hyphenated phrases and refuses the rest", () => {
    for (const good of ["owl", "amber-otter-quilt", "a1-b2", "x".repeat(64)]) {
      expect(isPartyWord(good)).toBe(true);
    }
    for (const bad of ["ab", "--------", "-owl", "owl-", "Owl", "o_wl", "x".repeat(65)]) {
      expect(isPartyWord(bad)).toBe(false);
    }
  });
});
