import { describe, expect, it } from "vitest";

import { DEFAULTS, MAX_SEGMENTS, parseArmFlag } from "./config";

describe("parseArmFlag", () => {
  it("fills every field but the anchor from the defaults", () => {
    expect(parseArmFlag({ anchor: { x: 10, y: 20 } })).toEqual({
      ...DEFAULTS,
      anchor: { x: 10, y: 20 },
    });
  });

  it.each([
    undefined,
    null,
    "arm",
    {},
    { anchor: null },
    { anchor: { x: 1 } },
    { anchor: { x: "1", y: 2 } },
    { anchor: { x: Number.NaN, y: 2 } },
  ])("has no arm for a flag without a usable anchor: %j", (flag) => {
    expect(parseArmFlag(flag)).toBeNull();
  });

  it("keeps valid fields as written", () => {
    const flag = {
      anchor: { x: 1, y: 2 },
      segments: 4,
      length: 300,
      bend: -1,
      bendPattern: "alternate",
      shoulderWidth: 1,
      wristWidth: 0.5,
      fill: 0,
      outline: 0xffffff,
      outlineWidth: 0,
      glow: 0x00ff00,
      shader: "pulse",
      smooth: false,
      rings: true,
    };
    expect(parseArmFlag(flag)).toEqual(flag);
  });

  it("replaces bad fields with their defaults", () => {
    const parsed = parseArmFlag({
      anchor: { x: 1, y: 2 },
      segments: "3",
      length: -5,
      bend: "left",
      bendPattern: "zigzag",
      shoulderWidth: 0,
      wristWidth: null,
      fill: "red",
      glow: "pink",
      shader: "",
      smooth: "yes",
      rings: 1,
    });
    expect(parsed).toEqual({ ...DEFAULTS, anchor: { x: 1, y: 2 } });
  });

  it("rounds and clamps the segment count", () => {
    const anchor = { x: 0, y: 0 };
    expect(parseArmFlag({ anchor, segments: 2.6 })?.segments).toBe(3);
    expect(parseArmFlag({ anchor, segments: 0 })?.segments).toBe(1);
    expect(parseArmFlag({ anchor, segments: 500 })?.segments).toBe(MAX_SEGMENTS);
  });
});
