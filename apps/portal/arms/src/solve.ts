export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Pose a chain of `segments` equal rigid segments from `anchor` to `target`; returns the
 * `segments + 1` joint positions, shoulder first.
 *
 * The joints lie on a circular arc, so every joint bends by the same angle `theta`. That makes
 * the pose a pure function of the two end points: every client draws the same arm, and for two
 * segments it is the ordinary two-bone elbow solution. A chain of n segments of length `length`,
 * each turning by theta, spans `length * sin(n * theta / 2) / sin(theta / 2)`, which falls from
 * `n * length` at theta = 0 to 0 at theta = 2 * pi / n, so bisection finds theta.
 *
 * A target beyond reach straightens the arm and stretches every segment equally, so the arm
 * never comes off the hand.
 */
export function solve(
  anchor: Point,
  target: Point,
  segments: number,
  length: number,
  bend: 1 | -1,
): Point[] {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const distance = Math.max(Math.hypot(dx, dy), 0.001);
  let theta = 0;
  let segment = length;
  if (distance >= segments * length) {
    segment = distance / segments;
  } else {
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
  const joints: Point[] = [{ x: anchor.x, y: anchor.y }];
  let angle = Math.atan2(dy, dx) - (bend * (segments - 1) * theta) / 2;
  let previous: Point = anchor;
  for (let k = 1; k < segments; k++) {
    previous = {
      x: previous.x + segment * Math.cos(angle),
      y: previous.y + segment * Math.sin(angle),
    };
    joints.push(previous);
    angle += bend * theta;
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
