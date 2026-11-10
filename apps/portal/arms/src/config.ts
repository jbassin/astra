import type { BendPattern, Point } from "./solve";

/** The flag lives in the "world" scope, which Foundry accepts whether or not this module is on. */
export const FLAG_SCOPE = "world";
export const FLAG_KEY = "ikArm";

export const MAX_SEGMENTS = 12;

/** One arm, as read from `flags.world.ikArm` on a token document. */
export interface ArmConfig {
  /** Canvas point the shoulder is pinned to. */
  readonly anchor: Point;
  /** Number of rigid segments; 2 is an upper arm and a forearm. */
  readonly segments: number;
  /** Length of one segment in pixels; `null` means "fit it to the token when the arm is built". */
  readonly length: number | null;
  /** Which way the joints bend. */
  readonly bend: 1 | -1;
  /** `arc` bends every joint the same way; `alternate` bends them in turn each way (a zigzag). */
  readonly bendPattern: BendPattern;
  /** Arm thickness at the shoulder and at the wrist, in grid squares. */
  readonly shoulderWidth: number;
  readonly wristWidth: number;
  readonly fill: number;
  readonly outline: number;
  /** Outline thickness in pixels. */
  readonly outlineWidth: number;
  /** Third colour, for shaders that use one (`uColorC`). */
  readonly glow: number;
  /** Name of the fragment shader (shaders.ts); an unknown name draws `flat`. */
  readonly shader: string;
  /** Lay the arm along a smooth curve through the joints, rather than straight segments. */
  readonly smooth: boolean;
  /** Draw a disc over each joint, in the fill and outline colours. */
  readonly rings: boolean;
}

export const DEFAULTS = {
  segments: 2,
  length: null,
  bend: 1,
  bendPattern: "arc",
  shoulderWidth: 0.7,
  wristWidth: 0.4,
  fill: 0x2b2433,
  outline: 0xc9a45c,
  outlineWidth: 5,
  glow: 0xe0457b,
  shader: "flat",
  smooth: true,
  rings: false,
} as const satisfies Omit<ArmConfig, "anchor">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positive(value: unknown, fallback: number): number {
  const n = finite(value);
  return n !== null && n > 0 ? n : fallback;
}

/**
 * Validate a token's raw flag. A flag is hand-editable world data, so every field is checked:
 * without a usable anchor there is no arm (`null`), and any other bad field falls back to its
 * default.
 */
export function parseArmFlag(flag: unknown): ArmConfig | null {
  if (!isRecord(flag) || !isRecord(flag.anchor)) return null;
  const x = finite(flag.anchor.x);
  const y = finite(flag.anchor.y);
  if (x === null || y === null) return null;
  const segments = finite(flag.segments);
  const length = finite(flag.length);
  const bend = finite(flag.bend);
  return {
    anchor: { x, y },
    segments:
      segments === null
        ? DEFAULTS.segments
        : Math.min(Math.max(Math.round(segments), 1), MAX_SEGMENTS),
    length: length !== null && length > 0 ? length : null,
    bend: bend !== null && bend < 0 ? -1 : 1,
    bendPattern: flag.bendPattern === "alternate" ? "alternate" : "arc",
    shoulderWidth: positive(flag.shoulderWidth, DEFAULTS.shoulderWidth),
    wristWidth: positive(flag.wristWidth, DEFAULTS.wristWidth),
    fill: finite(flag.fill) ?? DEFAULTS.fill,
    outline: finite(flag.outline) ?? DEFAULTS.outline,
    outlineWidth: finite(flag.outlineWidth) ?? DEFAULTS.outlineWidth,
    glow: finite(flag.glow) ?? DEFAULTS.glow,
    shader: typeof flag.shader === "string" && flag.shader !== "" ? flag.shader : DEFAULTS.shader,
    smooth: typeof flag.smooth === "boolean" ? flag.smooth : DEFAULTS.smooth,
    rings: typeof flag.rings === "boolean" ? flag.rings : DEFAULTS.rings,
  };
}
