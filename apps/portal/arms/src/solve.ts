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
 * `alternate`: joint k turns by +theta, -theta, +theta, ..., so a chain of 3 or more segments
 * zigzags instead of curling. The segments then point one of two ways: a = ceil(n / 2) of them
 * along the first heading and b = floor(n / 2) turned by theta, so the chain spans
 * `length * sqrt(a^2 + b^2 + 2ab cos(theta))`. That falls monotonically from `n * length` at
 * theta = 0 to `|a - b| * length` at theta = pi, and gives theta in closed form. The chain is then
 * rotated so its end points at the target. Two segments give the same pose as `arc`. An odd chain
 * cannot reach closer than one segment: inside that it folds flat and the last segment shortens.
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
  const direction = Math.atan2(dy, dx);
  const reach = distance >= segments * length;
  const segment = reach ? distance / segments : length;
  // Each segment's heading, relative to the anchor-target line.
  const headings: number[] = [];
  if (pattern === "alternate") {
    const a = Math.ceil(segments / 2);
    const b = Math.floor(segments / 2);
    let theta = 0;
    if (!reach && b > 0) {
      const ratio = distance / length;
      const cos = (ratio * ratio - a * a - b * b) / (2 * a * b);
      theta = Math.acos(Math.min(Math.max(cos, -1), 1));
    }
    // The angle of the chain's end, seen from the anchor, before it is rotated onto the target.
    const end = Math.atan2(b * Math.sin(theta), a + b * Math.cos(theta));
    for (let k = 0; k < segments; k++) headings.push(bend * ((k % 2) * theta - end));
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
    for (let k = 0; k < segments; k++) headings.push(bend * (k - (segments - 1) / 2) * theta);
  }
  const joints: Point[] = [{ x: anchor.x, y: anchor.y }];
  let previous: Point = anchor;
  for (let k = 0; k < segments - 1; k++) {
    const angle = direction + (headings[k] ?? 0);
    previous = {
      x: previous.x + segment * Math.cos(angle),
      y: previous.y + segment * Math.sin(angle),
    };
    joints.push(previous);
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
