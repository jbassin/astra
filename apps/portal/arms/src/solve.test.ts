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

/** Which side of the anchor-target line a point is on: positive, negative or (near) zero. */
function side(anchor: Point, target: Point, p: Point): number {
  const cross = (target.x - anchor.x) * (p.y - anchor.y) - (target.y - anchor.y) * (p.x - anchor.x);
  const scale = Math.hypot(target.x - anchor.x, target.y - anchor.y);
  return Math.abs(cross / scale) < 1e-6 ? 0 : Math.sign(cross);
}

describe("solve with an alternating bend", () => {
  const anchor = { x: 100, y: -40 };

  it.each([2, 3, 4, 7])("keeps all %i segments rigid while the hand is in reach", (segments) => {
    // Every target is at least a segment and a half away, which an odd chain needs.
    for (const target of [
      { x: 130, y: 300 },
      { x: 400, y: -40 },
      { x: -150, y: -200 },
      { x: 100 + 1.5 * 200 * Math.cos(1), y: -40 + 1.5 * 200 * Math.sin(1) },
    ]) {
      const joints = solve(anchor, target, segments, 200, 1, "alternate");
      expect(joints).toHaveLength(segments + 1);
      expect(joints[0]).toEqual(anchor);
      expect(joints.at(-1)).toEqual(target);
      for (const length of lengths(joints)) expect(length).toBeCloseTo(200, 3);
    }
  });

  it("is the arc pose for two segments", () => {
    for (const target of [
      { x: 8, y: 0 },
      { x: -3, y: 2 },
      { x: 0.5, y: 0.5 },
    ]) {
      for (const bend of [1, -1] as const) {
        const arc = solve({ x: 0, y: 0 }, target, 2, 5, bend);
        const alternate = solve({ x: 0, y: 0 }, target, 2, 5, bend, "alternate");
        for (const [i, joint] of alternate.entries()) {
          expect(joint.x).toBeCloseTo(arc[i]?.x ?? Number.NaN, 9);
          expect(joint.y).toBeCloseTo(arc[i]?.y ?? Number.NaN, 9);
        }
      }
    }
  });

  it("turns consecutive joints opposite ways", () => {
    const target = { x: 500, y: 300 };
    const joints = solve(anchor, target, 4, 200, 1, "alternate");
    const turns = joints.slice(2).map((c, i) => {
      const a = joints[i] ?? c;
      const b = joints[i + 1] ?? c;
      return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    });
    expect(turns).toEqual([1, -1, 1]);
  });

  it("puts the joints of an odd chain on alternate sides of the anchor-hand line", () => {
    const target = { x: 600, y: 200 };
    for (const segments of [3, 5]) {
      const joints = solve(anchor, target, segments, 200, 1, "alternate");
      const sides = joints.slice(1, -1).map((p) => side(anchor, target, p));
      expect(sides).toEqual(sides.map((_, i) => (i % 2 === 0 ? -1 : 1)));
    }
  });

  it("zigzags an even chain on one side, its middle joint on the anchor-hand line", () => {
    // Equal turns cannot cross the line with an even count: the chain is symmetric about its
    // middle joint, which lands on the line, and the other joints sit on the same side.
    const target = { x: 600, y: 200 };
    const joints = solve(anchor, target, 4, 200, 1, "alternate");
    expect(joints.slice(1, -1).map((p) => side(anchor, target, p))).toEqual([-1, 0, -1]);
  });

  it("straightens and stretches every segment equally when the hand is out of reach", () => {
    const joints = solve({ x: 0, y: 0 }, { x: 0, y: 900 }, 4, 100, 1, "alternate");
    expect(lengths(joints).map((l) => Math.round(l))).toEqual([225, 225, 225, 225]);
    for (const joint of joints) expect(joint.x).toBeCloseTo(0, 6);
  });

  it("mirrors the chain when the bend flips", () => {
    const target = { x: 600, y: -40 };
    const up = solve(anchor, target, 5, 200, 1, "alternate");
    const down = solve(anchor, target, 5, 200, -1, "alternate");
    for (const [i, joint] of down.entries()) {
      expect(joint.x).toBeCloseTo(up[i]?.x ?? Number.NaN, 9);
      expect(joint.y + 40).toBeCloseTo(-((up[i]?.y ?? Number.NaN) + 40), 9);
    }
  });

  it("folds an odd chain flat inside one segment and keeps the hand attached", () => {
    const joints = solve(anchor, { x: 150, y: -40 }, 3, 200, 1, "alternate");
    expect(joints.at(-1)).toEqual({ x: 150, y: -40 });
    for (const joint of joints) {
      expect(Number.isFinite(joint.x)).toBe(true);
      expect(joint.y).toBeCloseTo(-40, 6);
    }
  });

  it("survives a hand sitting on its anchor", () => {
    for (const segments of [2, 3, 4]) {
      const joints = solve({ x: 5, y: 5 }, { x: 5, y: 5 }, segments, 50, 1, "alternate");
      for (const joint of joints) {
        expect(Number.isFinite(joint.x)).toBe(true);
        expect(Number.isFinite(joint.y)).toBe(true);
      }
    }
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
