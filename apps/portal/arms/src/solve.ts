export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How the joints of an arm bend: all one way (`arc`) or in turn each way (`alternate`). */
export type BendPattern = "arc" | "alternate";

/**
 * Pose a chain of `segments` equal rigid segments from `anchor` to `target`; returns the
 * `segments + 1` joint positions, shoulder first. The pose is a pure function of its inputs, so
 * every client draws the same arm. A target beyond reach straightens the arm and stretches every
 * segment equally, so the arm never comes off the hand. The last joint is always the target.
 *
 * `arc`: the joints lie on a circular arc, so every joint bends by the same angle `theta`. For two
 * segments it is the ordinary two-bone elbow solution. A chain of n segments of length `length`,
 * each turning by theta, spans `length * sin(n * theta / 2) / sin(theta / 2)`, which falls from
 * `n * length` at theta = 0 to 0 at theta = 2 * pi / n, so bisection finds theta.
 *
 * `alternate`: a zigzag that crosses the anchor-hand line at every segment. The interior joints sit
 * a distance d to alternate sides of the line, so each interior segment crosses it at an angle psi
 * with `sin(psi) = 2d / length`, and the two end segments, which cover only d sideways, lean at
 * half that offset. With L = `length`, the chain spans
 * `L * (2 * sqrt(1 - sin(psi)^2 / 4) + (n - 2) * cos(psi))`. Its derivative is
 * `-L * sin(psi) * (cos(psi) / (2 * sqrt(1 - sin(psi)^2 / 4)) + n - 2)`, and the fraction is at
 * least -1/2 because `1 - sin^2 / 4 >= cos^2`, so for n >= 3 the span falls strictly on [0, pi]:
 * from `n * L` to `(4 - n) * L`. Bisection on that bracket finds psi; a closed form exists only
 * after squaring twice, which brings in a spurious root to rule out. Past psi = pi/2 the interior
 * segments lean back toward the anchor, which is what lets the arm reach close in.
 *
 * Closest reach: one segment for n = 3, and none for n >= 4 (the span reaches 0). A 3-segment arm
 * with the hand nearer than one segment folds flat on the line (psi = pi) and its last segment
 * shortens. Three segments give the same pose as the old equal-turn pattern, and two segments
 * (a single joint) use `arc`.
 */
export function solve(
  anchor: Point,
  target: Point,
  segments: number,
  length: number,
  bend: 1 | -1,
  pattern: BendPattern = "arc",
): Point[] {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const distance = Math.max(Math.hypot(dx, dy), 0.001);
  const reach = distance >= segments * length;
  const segment = reach ? distance / segments : length;
  // Each interior joint as (along, across) the anchor-target line, in units of one segment.
  const frame: [number, number][] = [];
  if (pattern === "alternate" && segments >= 3) {
    const span = (psi: number): number =>
      2 * Math.sqrt(1 - Math.sin(psi) ** 2 / 4) + (segments - 2) * Math.cos(psi);
    let psi = 0;
    if (!reach) {
      const ratio = distance / length;
      let lo = 0;
      let hi = Math.PI;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (span(mid) > ratio) lo = mid;
        else hi = mid;
      }
      psi = (lo + hi) / 2;
    }
    const offset = Math.sin(psi) / 2;
    const end = Math.sqrt(1 - offset * offset);
    for (let k = 1; k < segments; k++) {
      frame.push([end + (k - 1) * Math.cos(psi), (k % 2 === 1 ? -bend : bend) * offset]);
    }
  } else {
    let theta = 0;
    if (!reach) {
      const ratio = distance / length;
      let lo = 0;
      let hi = (2 * Math.PI) / segments;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sin((segments * mid) / 2) / Math.sin(mid / 2) > ratio) lo = mid;
        else hi = mid;
      }
      theta = (lo + hi) / 2;
    }
    let along = 0;
    let across = 0;
    for (let k = 0; k < segments - 1; k++) {
      const heading = bend * (k - (segments - 1) / 2) * theta;
      along += Math.cos(heading);
      across += Math.sin(heading);
      frame.push([along, across]);
    }
  }
  const ux = Math.cos(Math.atan2(dy, dx));
  const uy = Math.sin(Math.atan2(dy, dx));
  const joints: Point[] = [{ x: anchor.x, y: anchor.y }];
  for (const [along, across] of frame) {
    joints.push({
      x: anchor.x + segment * (along * ux - across * uy),
      y: anchor.y + segment * (along * uy + across * ux),
    });
  }
  // The last joint is the target itself, not the sum of rounded steps.
  joints.push({ x: target.x, y: target.y });
  return joints;
}

/**
 * The segment length a new arm gets: the arm is 1.25 times as long as the hand is far from the
 * anchor, so it starts with a visible bend, and a segment is never shorter than `minimum`.
 */
export function defaultLength(
  anchor: Point,
  center: Point,
  segments: number,
  minimum: number,
): number {
  const distance = Math.hypot(center.x - anchor.x, center.y - anchor.y);
  return Math.max(Math.round((1.25 * distance) / segments), minimum);
}
