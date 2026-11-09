import { describe, expect, it } from "vitest";

import { defaultLength, type Point, solve } from "./solve";

function lengths(joints: Point[]): number[] {
  return joints.slice(1).map((q, i) => {
    const p = joints[i] ?? q;
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
}

describe("solve", () => {
  it("is the two-bone elbow solution for two segments", () => {
    // A 3-4-5 triangle on each side: the hand is 8 away, each segment is 5, the elbow is 3 off.
    const joints = solve({ x: 0, y: 0 }, { x: 8, y: 0 }, 2, 5, 1);
    expect(joints).toHaveLength(3);
    expect(joints[1]?.x).toBeCloseTo(4, 6);
    expect(joints[1]?.y).toBeCloseTo(-3, 6);
    expect(joints[2]).toEqual({ x: 8, y: 0 });
  });

  it("mirrors the elbow when the bend flips", () => {
    const joints = solve({ x: 0, y: 0 }, { x: 8, y: 0 }, 2, 5, -1);
    expect(joints[1]?.y).toBeCloseTo(3, 6);
  });

  it.each([2, 3, 4, 7])("keeps all %i segments rigid while the hand is in reach", (segments) => {
    const anchor = { x: 100, y: -40 };
    for (const target of [
      { x: 130, y: 300 },
      { x: 101, y: -39 },
      { x: -150, y: -200 },
    ]) {
      const joints = solve(anchor, target, segments, 200, 1);
      expect(joints).toHaveLength(segments + 1);
      expect(joints[0]).toEqual(anchor);
      expect(joints.at(-1)).toEqual(target);
      for (const length of lengths(joints)) expect(length).toBeCloseTo(200, 3);
    }
  });

  it("straightens and stretches every segment equally when the hand is out of reach", () => {
    const joints = solve({ x: 0, y: 0 }, { x: 0, y: 900 }, 3, 100, 1);
    expect(lengths(joints).map((l) => Math.round(l))).toEqual([300, 300, 300]);
    for (const joint of joints) expect(joint.x).toBeCloseTo(0, 6);
  });

  it("survives a hand sitting on its anchor", () => {
    const joints = solve({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, 50, 1);
    for (const joint of joints) {
      expect(Number.isFinite(joint.x)).toBe(true);
      expect(Number.isFinite(joint.y)).toBe(true);
    }
    for (const length of lengths(joints)) expect(length).toBeCloseTo(50, 3);
  });
});

describe("defaultLength", () => {
  it("makes the arm a quarter longer than the hand is far", () => {
    expect(defaultLength({ x: 0, y: 0 }, { x: 800, y: 0 }, 2, 100)).toBe(500);
  });

  it("never returns a segment shorter than the minimum", () => {
    expect(defaultLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, 140)).toBe(140);
  });
});
