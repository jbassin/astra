import type { Point } from "./solve";

/** A square on the map, in canvas pixels: top-left corner and side length. */
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** How far from its anchor one arm can draw ink: a centre and a radius in pixels. */
export interface Reach {
  readonly anchor: Point;
  readonly radius: number;
}

/**
 * How far an arm's ink can land from its anchor, in pixels: its full length with 10% to spare
 * (the curve bulges past the joints), plus its widest width, plus two grid squares for the ink
 * to smear into, plus twice the hand's radius when it has one (`handRadius` 0 when not): the
 * hand's ink reaches about two radii from the token centre, at the fingertips and the wrist.
 */
export function reachRadius(
  segments: number,
  length: number,
  maxWidth: number,
  gridSize: number,
  handRadius = 0,
): number {
  return segments * length * 1.1 + maxWidth + 2 * gridSize + 2 * handRadius;
}

/**
 * The smallest square holding every arm's reach square (anchor ± radius), centred on their
 * bounding box; `null` with no arms. It is a square, not the bounding rectangle, so the square
 * buffer texture has the same pixels-per-texel along both axes.
 */
export function smearRegion(reaches: readonly Reach[]): Region | null {
  if (reaches.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { anchor, radius } of reaches) {
    left = Math.min(left, anchor.x - radius);
    top = Math.min(top, anchor.y - radius);
    right = Math.max(right, anchor.x + radius);
    bottom = Math.max(bottom, anchor.y + radius);
  }
  const size = Math.max(right - left, bottom - top);
  return {
    x: (left + right) / 2 - size / 2,
    y: (top + bottom) / 2 - size / 2,
    size,
  };
}

export function sameRegion(a: Region | null, b: Region | null): boolean {
  return a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.size === b.size);
}
