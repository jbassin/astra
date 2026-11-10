import { describe, expect, it } from "vitest";

import { reachRadius, sameRegion, smearRegion } from "./region";

describe("reachRadius", () => {
  it("is the arm's length with 10% spare, plus its widest width and two grid squares", () => {
    expect(reachRadius(3, 200, 70, 100)).toBeCloseTo(3 * 200 * 1.1 + 70 + 200);
  });

  it("grows by twice the hand's radius when the arm has a hand", () => {
    expect(reachRadius(3, 200, 70, 100, 50)).toBeCloseTo(reachRadius(3, 200, 70, 100) + 100);
    expect(reachRadius(3, 200, 70, 100, 0)).toBe(reachRadius(3, 200, 70, 100));
  });
});

describe("smearRegion", () => {
  it("is null with no arms", () => {
    expect(smearRegion([])).toBeNull();
  });

  it("is the reach square around a single anchor", () => {
    expect(smearRegion([{ anchor: { x: 1000, y: 500 }, radius: 300 }])).toEqual({
      x: 700,
      y: 200,
      size: 600,
    });
  });

  it("covers every arm's reach square", () => {
    const reaches = [
      { anchor: { x: 0, y: 0 }, radius: 100 },
      { anchor: { x: 1000, y: 200 }, radius: 300 },
    ];
    const region = smearRegion(reaches);
    expect(region).not.toBeNull();
    if (!region) return;
    for (const { anchor, radius } of reaches) {
      expect(region.x).toBeLessThanOrEqual(anchor.x - radius);
      expect(region.y).toBeLessThanOrEqual(anchor.y - radius);
      expect(region.x + region.size).toBeGreaterThanOrEqual(anchor.x + radius);
      expect(region.y + region.size).toBeGreaterThanOrEqual(anchor.y + radius);
    }
  });

  it("is a square centred on the reaches' bounding box", () => {
    // Bounding box x -100..1300 (1400 wide), y -100..500 (600 tall).
    const region = smearRegion([
      { anchor: { x: 0, y: 0 }, radius: 100 },
      { anchor: { x: 1000, y: 200 }, radius: 300 },
    ]);
    expect(region).toEqual({ x: -100, y: 200 - 700, size: 1400 });
  });

  it("does not depend on the order of the arms", () => {
    const a = { anchor: { x: 10, y: 20 }, radius: 50 };
    const b = { anchor: { x: -300, y: 400 }, radius: 120 };
    expect(smearRegion([a, b])).toEqual(smearRegion([b, a]));
  });
});

describe("sameRegion", () => {
  it("compares by value", () => {
    expect(sameRegion({ x: 1, y: 2, size: 3 }, { x: 1, y: 2, size: 3 })).toBe(true);
    expect(sameRegion({ x: 1, y: 2, size: 3 }, { x: 1, y: 2, size: 4 })).toBe(false);
    expect(sameRegion(null, null)).toBe(true);
    expect(sameRegion(null, { x: 1, y: 2, size: 3 })).toBe(false);
  });
});
