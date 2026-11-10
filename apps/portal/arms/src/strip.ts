import type { Point } from "./solve";

/** Centre-line samples per segment. */
export const SUBDIV = 24;

/** The arm strip's vertex attributes, two vertices (minus side, then plus side) per sample. */
export interface StripArrays {
  /** `aVertexPosition`: x, y in canvas pixels. */
  readonly position: Float32Array;
  /** `aUv`: x 0..1 from shoulder to hand, y -1 (minus side) to 1 (plus side). */
  readonly uv: Float32Array;
  /** `aDist`: pixels along the centre line from the shoulder. */
  readonly dist: Float32Array;
  /** `aSeg`: segment index plus the fraction through that segment (0..segments). */
  readonly seg: Float32Array;
  /** `aHalf`: the tapered half width in pixels, before any pinch or mitre. */
  readonly half: Float32Array;
}

/** The sampled centre line: `samples + 1` points and the running length at each. */
interface Path {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly cum: Float64Array;
  readonly samples: number;
}

export function vertexCount(segments: number): number {
  return (segments * SUBDIV + 1) * 2;
}

/** Two triangles per sample step, for vertices laid out as `StripArrays` describes. */
export function stripIndices(segments: number): Uint16Array {
  const steps = segments * SUBDIV;
  const index = new Uint16Array(steps * 6);
  for (let i = 0; i < steps; i++) {
    const a = 2 * i;
    index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  return index;
}

export function allocateStrip(segments: number): StripArrays {
  const n = vertexCount(segments);
  return {
    position: new Float32Array(n * 2),
    uv: new Float32Array(n * 2),
    dist: new Float32Array(n),
    seg: new Float32Array(n),
    half: new Float32Array(n),
  };
}

/**
 * Sample the centre line through `joints` (at least two): straight between joints, or, when
 * `smooth`, a Catmull-Rom curve through them, with an end point extrapolated past each end.
 */
export function buildPath(joints: readonly Point[], smooth: boolean): Path {
  const n = joints.length - 1;
  const samples = n * SUBDIV;
  const xs = new Float64Array(samples + 1);
  const ys = new Float64Array(samples + 1);
  /** Joint `k`, with one extra point mirrored past each end for the curve's end tangents. */
  const joint = (k: number): Point => {
    if (k < 0) return mirror(pointAt(joints, 0), pointAt(joints, 1));
    if (k > n) return mirror(pointAt(joints, n), pointAt(joints, n - 1));
    return pointAt(joints, k);
  };
  for (let g = 0; g <= samples; g++) {
    const i = Math.min(Math.floor(g / SUBDIV), n - 1);
    const t = (g - i * SUBDIV) / SUBDIV;
    const p1 = joint(i);
    const p2 = joint(i + 1);
    if (!smooth) {
      xs[g] = p1.x + (p2.x - p1.x) * t;
      ys[g] = p1.y + (p2.y - p1.y) * t;
      continue;
    }
    const p0 = joint(i - 1);
    const p3 = joint(i + 2);
    const t2 = t * t;
    const t3 = t2 * t;
    const cr = (a: number, b: number, c: number, d: number): number =>
      0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    xs[g] = cr(p0.x, p1.x, p2.x, p3.x);
    ys[g] = cr(p0.y, p1.y, p2.y, p3.y);
  }
  const cum = new Float64Array(samples + 1);
  for (let g = 1; g <= samples; g++) {
    cum[g] = at(cum, g - 1) + Math.hypot(at(xs, g) - at(xs, g - 1), at(ys, g) - at(ys, g - 1));
  }
  return { xs, ys, cum, samples };
}

/** `array[i]`, for an index the caller knows is in range (NaN shows up if it is not). */
function at(array: ArrayLike<number>, i: number): number {
  return array[i] ?? Number.NaN;
}

function pointAt(points: readonly Point[], i: number): Point {
  return points[i] ?? { x: Number.NaN, y: Number.NaN };
}

/** `p` reflected through `centre`. */
function mirror(centre: Point, p: Point): Point {
  return { x: 2 * centre.x - p.x, y: 2 * centre.y - p.y };
}

/**
 * Write the strip for `joints` into `out` (sized by `allocateStrip(joints.length - 1)`) and
 * return the centre line's length in pixels. The half width tapers from `shoulderHalf` to
 * `wristHalf` along the arm. Smooth mode pinches the inner side of a tight bend to 0.9 times the
 * local radius so the strip never folds over itself; straight mode mitres each joint so both
 * segments keep their full width.
 */
export function writeStrip(
  out: StripArrays,
  joints: readonly Point[],
  shoulderHalf: number,
  wristHalf: number,
  smooth: boolean,
): number {
  const n = joints.length - 1;
  const { xs, ys, cum, samples } = buildPath(joints, smooth);
  const total = at(cum, samples) || 1;
  const { position, uv, dist, seg, half } = out;
  for (let g = 0; g <= samples; g++) {
    const i = Math.min(Math.floor(g / SUBDIV), n - 1);
    const t = (g - i * SUBDIV) / SUBDIV;
    const ga = Math.max(g - 1, 0);
    const gb = Math.min(g + 1, samples);
    let tx = at(xs, gb) - at(xs, ga);
    let ty = at(ys, gb) - at(ys, ga);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;
    const u = at(cum, g) / total;
    const hm = shoulderHalf + (wristHalf - shoulderHalf) * u;
    let plus = hm;
    let minus = hm;
    if (g > 0 && g < samples) {
      const ax = at(xs, g) - at(xs, g - 1);
      const ay = at(ys, g) - at(ys, g - 1);
      const bx = at(xs, g + 1) - at(xs, g);
      const by = at(ys, g + 1) - at(ys, g);
      const la = Math.hypot(ax, ay) || 1e-6;
      if (!smooth && g % SUBDIV === 0) {
        const k = 1 / Math.max((nx * -ay + ny * ax) / la, 0.4);
        plus *= k;
        minus *= k;
      } else if (smooth) {
        const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
        if (Math.abs(turn) > 1e-6) {
          const radius = (at(cum, g + 1) - at(cum, g - 1)) / 2 / Math.abs(turn);
          if (turn > 0) plus = Math.min(plus, 0.9 * radius);
          else minus = Math.min(minus, 0.9 * radius);
        }
      }
    }
    const v = 2 * g;
    const x = at(xs, g);
    const y = at(ys, g);
    position[2 * v] = x - nx * minus;
    position[2 * v + 1] = y - ny * minus;
    position[2 * v + 2] = x + nx * plus;
    position[2 * v + 3] = y + ny * plus;
    uv[2 * v] = u;
    uv[2 * v + 1] = -1;
    uv[2 * v + 2] = u;
    uv[2 * v + 3] = 1;
    dist[v] = dist[v + 1] = at(cum, g);
    seg[v] = seg[v + 1] = i + t;
    half[v] = half[v + 1] = hm;
  }
  return total;
}
