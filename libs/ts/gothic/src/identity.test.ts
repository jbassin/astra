import { describe, expect, test } from "vitest";
import {
  FALLBACK_IDENTITY_COLOR,
  IDENTITY_COLOR_VAR,
  identityColor,
  identityStyle,
} from "./identity";

/** I5: identity colors come from ontology-being as runtime CSS vars, with a visible fallback. */
describe("identity-color seam (I5)", () => {
  test("resolves a raw color string", () => {
    expect(identityColor("#ff8800")).toBe("#ff8800");
  });

  test("resolves an ontology entity's color (shape of Player/WealHost)", () => {
    expect(identityColor({ color: "#6dd5c0" })).toBe("#6dd5c0");
  });

  test("falls back VISIBLY for missing / blank / nullish color (never crashes)", () => {
    expect(identityColor(null)).toBe(FALLBACK_IDENTITY_COLOR);
    expect(identityColor(undefined)).toBe(FALLBACK_IDENTITY_COLOR);
    expect(identityColor("")).toBe(FALLBACK_IDENTITY_COLOR);
    expect(identityColor("   ")).toBe(FALLBACK_IDENTITY_COLOR);
    expect(identityColor({ color: null })).toBe(FALLBACK_IDENTITY_COLOR);
  });

  test("identityStyle sets the --identity-color custom property", () => {
    expect(identityStyle("#abcdef") as Record<string, string>).toEqual({
      [IDENTITY_COLOR_VAR]: "#abcdef",
    });
    expect(identityStyle(null) as Record<string, string>).toEqual({
      [IDENTITY_COLOR_VAR]: FALLBACK_IDENTITY_COLOR,
    });
  });
});
