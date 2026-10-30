import { defaultBeingFile, loadBeing } from "@astra/ontology";
import { describe, expect, it } from "vitest";

import { contrast, parseColour, readableOn } from "./speakerColour";

// The light theme's page and surface, and the dark theme's (tokens.css).
const LIGHT = ["#f3f3f7", "#ffffff"];
const DARK = ["#16152a", "#1e1d35"];

const being = loadBeing(defaultBeingFile());
const colours = [...being.players.map((p) => p.color), being.guest_color];

describe("speaker colours", () => {
  it("parses rgb() and hex", () => {
    expect(parseColour("rgb(232,184,232)")).toEqual([232, 184, 232]);
    expect(parseColour("#9B3B6E")).toEqual([155, 59, 110]);
  });

  it("measures WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#1e1d2e", "#f3f3f7")).toBeGreaterThan(14);
  });

  it("gives every speaker a light-theme colour that reaches 4.5:1, even on the playing tint", () => {
    for (const c of colours) {
      const light = readableOn(c, LIGHT, { tint: 0.12 });
      for (const bg of LIGHT) expect(contrast(light, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the pastels for the dark theme, where they already pass", () => {
    for (const c of colours) {
      for (const bg of DARK) expect(contrast(c, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
