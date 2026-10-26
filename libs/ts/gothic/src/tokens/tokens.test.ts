import { describe, expect, it } from "vitest";

import { gothic as gothicPalette } from "../generated/palette";
import { generateTokenFiles, resolveColor } from "./generate";
import { gothic, parchment, type Theme } from "./tokens";

const themes: [string, Theme][] = [
  ["gothic", gothic],
  ["parchment", parchment],
];

describe.each(themes)("the %s theme", (_, theme) => {
  it("names each token once, old names included", () => {
    const names = theme.colors.flatMap((t) => [t.name, ...(t.legacy ? [t.legacy] : [])]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every reference to a literal", () => {
    for (const token of theme.colors) {
      expect(resolveColor(theme, token.value)).toMatch(/^(#|rgb\()/);
    }
  });
});

describe("the shared names", () => {
  it("exist in both themes", () => {
    const shared = ["page", "fg", "fg-muted", "fg-faint", "accent", "accent-secondary", "rule"];
    for (const theme of [gothic, parchment]) {
      const names = theme.colors.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(shared));
    }
  });
});

describe("generateTokenFiles", () => {
  it("emits the old names as aliases of the new ones", () => {
    const css = generateTokenFiles().find((f) => f.path.endsWith("gothic-theme.css"))?.contents;
    expect(css).toContain("--color-page: #090c10;");
    expect(css).toContain("--color-void: var(--color-page);");
  });

  it("rounds GLSL floats to 3 places, as the shaders always used", () => {
    expect(gothicPalette.rgb.accent).toEqual([0.427, 0.835, 0.753]);
    expect(gothicPalette.rgb.page).toEqual([0.035, 0.047, 0.063]);
    expect(gothicPalette.pixi.accent).toBe(0x6dd5c0);
  });
});
