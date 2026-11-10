import { describe, expect, it } from "vitest";

import { solve } from "./solve";
import {
  allocateStrip,
  buildPath,
  stripEnd,
  stripIndices,
  SUBDIV,
  vertexCount,
  writeStrip,
} from "./strip";

const bent = solve({ x: 0, y: 0 }, { x: 300, y: 100 }, 3, 160, 1);

/** `array[i]`, NaN when out of range (so a bad index fails the assertion). */
function at(array: ArrayLike<number>, i: number): number {
  return array[i] ?? Number.NaN;
}

function strip(joints: { x: number; y: number }[], smooth: boolean, sh = 40, wh = 20) {
  const out = allocateStrip(joints.length - 1);
  const length = writeStrip(out, joints, sh, wh, smooth);
  return { ...out, length };
}

/** The centre of vertex pair `g`. */
function centre(position: Float32Array, g: number): { x: number; y: number } {
  const v = 4 * g;
  return {
    x: (at(position, v) + at(position, v + 2)) / 2,
    y: (at(position, v + 1) + at(position, v + 3)) / 2,
  };
}

describe("strip layout", () => {
  it("sizes the arrays and indices for the segment count", () => {
    const s = strip(bent, true);
    expect(s.dist.length).toBe(vertexCount(3));
    expect(s.position.length).toBe(2 * vertexCount(3));
    const index = stripIndices(3);
    expect(index.length).toBe(3 * SUBDIV * 6);
    expect(Math.max(...index)).toBe(vertexCount(3) - 1);
  });
});

describe.each([true, false])("writeStrip (smooth %s)", (smooth) => {
  const s = strip(bent, smooth);
  const last = s.dist.length / 2 - 1;

  it("starts at the shoulder and ends at the hand", () => {
    const a = centre(s.position, 0);
    const b = centre(s.position, last);
    expect(a.x).toBeCloseTo(0, 4);
    expect(a.y).toBeCloseTo(0, 4);
    expect(b.x).toBeCloseTo(300, 3);
    expect(b.y).toBeCloseTo(100, 3);
    expect(s.uv[0]).toBe(0);
    expect(s.uv.at(-2)).toBeCloseTo(1, 6);
  });

  it("runs aDist and aSeg continuously from shoulder to hand", () => {
    expect(s.dist[0]).toBe(0);
    expect(s.seg[0]).toBe(0);
    expect(s.dist[2 * last]).toBeCloseTo(s.length, 2);
    expect(s.seg[2 * last]).toBeCloseTo(3, 6);
    for (let g = 1; g <= last; g++) {
      const step = at(s.dist, 2 * g) - at(s.dist, 2 * g - 2);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(s.length / 20);
      expect(at(s.seg, 2 * g) - at(s.seg, 2 * g - 2)).toBeCloseTo(1 / SUBDIV, 5);
      expect(s.dist[2 * g + 1]).toBe(s.dist[2 * g]);
    }
    // Each joint falls on a whole segment number.
    expect(s.seg[2 * SUBDIV]).toBeCloseTo(1, 6);
    expect(s.seg[4 * SUBDIV]).toBeCloseTo(2, 6);
  });

  it("tapers the half width from shoulder to wrist", () => {
    expect(s.half[0]).toBeCloseTo(40, 5);
    expect(s.half[2 * last]).toBeCloseTo(20, 5);
    for (let g = 1; g <= last; g++) {
      expect(at(s.half, 2 * g)).toBeLessThanOrEqual(at(s.half, 2 * g - 2));
    }
  });
});

describe("tight bends", () => {
  // Three long segments folded so the hand is near the shoulder: a much tighter curve than the
  // arm is wide.
  const tight = solve({ x: 0, y: 0 }, { x: 60, y: 0 }, 3, 120, 1);
  const { xs, ys, cum, samples } = buildPath(tight, true);
  const sh = 70;

  /** The centre line's local radius at sample `g`, and which side (+1 plus, -1 minus) is inside. */
  function bendAt(g: number): { radius: number; inside: 1 | -1 } {
    const ax = at(xs, g) - at(xs, g - 1);
    const ay = at(ys, g) - at(ys, g - 1);
    const bx = at(xs, g + 1) - at(xs, g);
    const by = at(ys, g + 1) - at(ys, g);
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    const span = (at(cum, g + 1) - at(cum, g - 1)) / 2;
    return { radius: span / Math.abs(turn), inside: turn > 0 ? 1 : -1 };
  }

  it("is tighter than the arm is wide (so the case is a real test)", () => {
    let smallest = Number.POSITIVE_INFINITY;
    for (let g = 1; g < samples; g++) smallest = Math.min(smallest, bendAt(g).radius);
    expect(sh).toBeGreaterThan(smallest);
  });

  it("keeps the inner offset within the local radius in smooth mode", () => {
    const s = strip(tight, true, sh, sh);
    for (let g = 1; g < samples; g++) {
      const { radius, inside } = bendAt(g);
      const x = at(xs, g);
      const y = at(ys, g);
      const inner = 4 * g + (inside === 1 ? 2 : 0);
      const outer = 4 * g + (inside === 1 ? 0 : 2);
      const offset = (v: number): number =>
        Math.hypot(at(s.position, v) - x, at(s.position, v + 1) - y);
      expect(offset(inner)).toBeLessThanOrEqual(Math.min(sh, radius) + 1e-3);
      expect(offset(outer)).toBeCloseTo(sh, 3);
    }
  });
});

describe("straight arms", () => {
  const line = [0, 1, 2, 3].map((k) => ({ x: 10 + 100 * k, y: 20 + 50 * k }));

  it("lays out the same strip smooth or not", () => {
    const a = strip(line, true);
    const b = strip(line, false);
    expect(a.length).toBeCloseTo(b.length, 6);
    for (const key of ["position", "uv", "dist", "seg", "half"] as const) {
      for (const [i, value] of a[key].entries()) expect(value).toBeCloseTo(at(b[key], i), 3);
    }
  });
});

describe.each([true, false])("stripEnd (smooth %s)", (smooth) => {
  it("is the last centre-line sample, heading the way the last step goes", () => {
    const joints = solve({ x: 0, y: 0 }, { x: 300, y: 120 }, 3, 160, 1, "arc");
    const out = allocateStrip(3);
    writeStrip(out, joints, 30, 12, smooth);
    const path = buildPath(joints, smooth);
    const g = path.samples;
    const ex = (path.xs[g] ?? 0) - (path.xs[g - 1] ?? 0);
    const ey = (path.ys[g] ?? 0) - (path.ys[g - 1] ?? 0);
    const el = Math.hypot(ex, ey);
    const end = stripEnd(out);
    expect(end.x).toBeCloseTo(300, 3);
    expect(end.y).toBeCloseTo(120, 3);
    expect(end.dx).toBeCloseTo(ex / el, 4);
    expect(end.dy).toBeCloseTo(ey / el, 4);
  });

  it("heads along a straight arm", () => {
    const out = allocateStrip(1);
    writeStrip(
      out,
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      20,
      10,
      smooth,
    );
    const end = stripEnd(out);
    expect(end.dx).toBeCloseTo(0, 6);
    expect(end.dy).toBeCloseTo(1, 6);
  });
});
