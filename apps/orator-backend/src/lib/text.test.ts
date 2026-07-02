import { describe, expect, test } from "vitest";
import { normalizeTag, slugify, uniqueSlug } from "./text";

describe("normalizeTag", () => {
  test("collapses whitespace and lowercases", () => {
    expect(normalizeTag("  Calm   Storm ")).toBe("calm storm");
    expect(normalizeTag("CALM")).toBe("calm");
  });
});

describe("slugify", () => {
  test("lowercases and replaces non-alphanumerics with dashes", () => {
    expect(slugify("Through a Song, Darkly!")).toBe("through-a-song-darkly");
  });
  test("strips diacritics", () => {
    expect(slugify("Café Müller")).toBe("cafe-muller");
  });
  test("trims leading/trailing dashes and caps length", () => {
    expect(slugify("  --hello--  ")).toBe("hello");
    expect(slugify("x".repeat(120)).length).toBe(80);
  });
});

describe("uniqueSlug", () => {
  test("returns the root when free", () => {
    expect(uniqueSlug("calm", () => false)).toBe("calm");
  });
  test("appends -2, -3 … on collision", () => {
    const taken = new Set(["calm", "calm-2"]);
    expect(uniqueSlug("calm", (s) => taken.has(s))).toBe("calm-3");
  });
  test("empty base → untitled", () => {
    expect(uniqueSlug("", () => false)).toBe("untitled");
  });
});
