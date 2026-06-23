import { describe, expect, test } from "vitest";
import { normalizeMode } from "./mode";

describe("normalizeMode", () => {
  test("passes through diegetic", () => {
    expect(normalizeMode("diegetic")).toBe("diegetic");
  });

  test("everything else falls back to mechanical", () => {
    expect(normalizeMode("mechanical")).toBe("mechanical");
    expect(normalizeMode("MECHANICAL")).toBe("mechanical");
    expect(normalizeMode("nonsense")).toBe("mechanical");
    expect(normalizeMode("")).toBe("mechanical");
    expect(normalizeMode(null)).toBe("mechanical");
    expect(normalizeMode(undefined)).toBe("mechanical");
  });
});
