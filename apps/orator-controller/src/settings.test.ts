import { describe, expect, test } from "bun:test";
import { isConfigured, normalizeOrigin, type OratorGlobalSettings } from "./settings";

describe("isConfigured", () => {
  test("requires both origin and key", () => {
    expect(isConfigured({})).toBe(false);
    expect(isConfigured({ oratorOrigin: "https://orator.iridi.cc" })).toBe(false);
    expect(isConfigured({ apiKey: "orator_abc" })).toBe(false);
    const full: OratorGlobalSettings = {
      oratorOrigin: "https://orator.iridi.cc",
      apiKey: "orator_abc",
    };
    expect(isConfigured(full)).toBe(true);
  });
});

describe("normalizeOrigin", () => {
  test("trims and strips trailing slashes", () => {
    expect(normalizeOrigin("  https://orator.iridi.cc/  ")).toBe("https://orator.iridi.cc");
    expect(normalizeOrigin("https://orator.iridi.cc///")).toBe("https://orator.iridi.cc");
    expect(normalizeOrigin("https://orator.iridi.cc")).toBe("https://orator.iridi.cc");
  });
});
