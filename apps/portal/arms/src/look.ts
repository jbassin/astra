// The look of a shimmering or shattered arm: the per-client animation state, and
// the numbers the shaders are tuned with. Pure functions, no PIXI and no Foundry, so main.ts and
// the bench page (which embeds this file, see benchSync.ts) run the same code.
//
// The logic (shatter.ts) writes `flags.world.ikShatter = { state, since }` on a token; absent means
// a normal arm. main.ts reads it with `parseShatterFlag` (shatter-config.ts) and feeds the state here. `since` is the writer's clock and is never used: clients'
// clocks differ, so each client times the animation from when it sees the change.

export type ShatterState = "shimmer" | "shattered";

/**
 * Whether an `updateToken` change object touches `flags[scope][key]`. Foundry writes an unset as
 * `{"-=key": null}` and a forced replace as `{"==key": value}`, and removing the whole scope as
 * `{"-=scope": null}`; all three count.
 */
export function flagTouched(change: unknown, scope: string, key: string): boolean {
  if (typeof change !== "object" || change === null || !("flags" in change)) return false;
  const flags = change.flags;
  if (typeof flags !== "object" || flags === null) return false;
  if (`-=${scope}` in flags || `==${scope}` in flags) return true;
  const inScope: unknown = Reflect.get(flags, scope);
  if (typeof inScope !== "object" || inScope === null) return false;
  return key in inScope || `-=${key}` in inScope || `==${key}` in inScope;
}

// ---- Tuning ----

/** The numbers the shaders take as uniforms; the bench has a slider for each. */
interface Tune {
  /** How fast the sheen's bands travel toward the hand, in pixels per second. */
  sheenSpeed: number;
  /** How strongly the shimmer shows in the image pass (1 is the designed strength). */
  shimmerGain: number;
  /** Shard (Voronoi cell) size in pixels. */
  shardPx: number;
  /** How long the shatter burst lasts, in seconds. */
  burstLen: number;
  /** Kaleidoscope cell width in pixels (the shimmer's hexagonal cells). */
  kaleidoPx: number;
  /** Seconds between the kaleidoscope's snap turns. */
  snapEvery: number;
  /** How far apart the cells' snaps are spread: 0 snaps them all together, 1 gives each its own time. */
  snapSpread: number;
  /** How strongly a shattered arm shows its frozen kaleidoscope in shards and crack edges, 0..1. */
  glassGain: number;
  /** How much of the arm the crack lines cut away, 0 (nothing) to 1 (fully see-through). */
  crackDark: number;
}

export const DEFAULT_TUNE: Readonly<Tune> = {
  sheenSpeed: 20,
  shimmerGain: 0.4,
  shardPx: 80,
  burstLen: 1,
  crackDark: 0.9,
  kaleidoPx: 100,
  snapEvery: 3,
  snapSpread: 1,
  glassGain: 0.7,
};

/** The live tuning; the module never changes it, the bench's sliders do. */
export const tune: Tune = { ...DEFAULT_TUNE };

/** Copy the tuning into a shader's uniform object. */
export function writeTune(target: Record<string, unknown>): void {
  target.uSheenSpeed = tune.sheenSpeed;
  target.uShimmerGain = tune.shimmerGain;
  target.uShardPx = tune.shardPx;
  target.uBurstLen = tune.burstLen;
  target.uCrackDark = tune.crackDark;
  target.uKaleidoPx = tune.kaleidoPx;
  target.uSnapEvery = tune.snapEvery;
  target.uSnapSpread = tune.snapSpread;
  target.uGlassGain = tune.glassGain;
}

// ---- Animation ----

/** Seconds for the shimmer to ease in or out. */
export const SHIMMER_EASE = 0.4;
/** Seconds for the broken look to take hold, and to heal when the flag clears. */
const BREAK_IN = 0.1;
export const BREAK_OUT = 0.6;
/** `uShatter` for an arm that shattered before this client saw it: the burst is long over. */
export const SETTLED_AGE = 1000;
/** `uShatter` when the arm is not shattered. */
export const NO_AGE = -1;
/** How fast the burst dies away: its strength is exp(-age * BURST_DECAY / burstLen). */
export const BURST_DECAY = 4.2;

/** One arm's animation state on this client. */
export interface Look {
  state: ShatterState | null;
  /** 0..1, linear; `writeLook` smooths it. */
  shimmer: number;
  /** 0..1, linear: how broken the arm looks (1 while shattered). */
  broken: number;
  /** Seconds since this client saw the arm shatter, `SETTLED_AGE` or `NO_AGE`. */
  age: number;
}

/** The look of an arm that is built in `state`: shattered arms are already settled, no burst. */
export function newLook(state: ShatterState | null): Look {
  return {
    state,
    shimmer: state === "shimmer" ? 1 : 0,
    broken: state === "shattered" ? 1 : 0,
    age: state === "shattered" ? SETTLED_AGE : NO_AGE,
  };
}

/** The flag changed: start the burst on a new shatter, end it when the arm is no longer broken. */
export function setLookState(look: Look, state: ShatterState | null): void {
  if (state === look.state) return;
  look.age = state === "shattered" ? 0 : NO_AGE;
  look.state = state;
}

function toward(value: number, target: number, step: number): number {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}

/** Advance the look by `dt` seconds. */
export function stepLook(look: Look, dt: number): void {
  look.shimmer = toward(look.shimmer, look.state === "shimmer" ? 1 : 0, dt / SHIMMER_EASE);
  const target = look.state === "shattered" ? 1 : 0;
  look.broken = toward(look.broken, target, dt / (target > look.broken ? BREAK_IN : BREAK_OUT));
  if (look.state === "shattered") look.age = Math.min(look.age + dt, SETTLED_AGE);
}

/** The burst's strength, 1 at the moment of shattering down to 0 at `len` seconds. */
export function burstOf(age: number, len: number): number {
  return age < 0 || age >= len ? 0 : Math.exp((-age * BURST_DECAY) / len);
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

function quantize(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * 31);
}

/** Pack three 0..1 values into one float, 5 bits each (exact in a 32-bit float). */
export function packFx(shimmer: number, broken: number, burst: number): number {
  return quantize(shimmer) + 32 * quantize(broken) + 1024 * quantize(burst);
}

/** The inverse of `packFx`, as the buffer pass decodes it. */
export function unpackFx(packed: number): { shimmer: number; broken: number; burst: number } {
  return {
    shimmer: (packed % 32) / 31,
    broken: (Math.floor(packed / 32) % 32) / 31,
    burst: Math.floor(packed / 1024) / 31,
  };
}

/**
 * Write the look to an arm's shader uniforms (`uShimmer`, `uShatter`, `uBroken`) and, for an arm
 * with a hand, to the fourth float of its hand params (`packFx`).
 */
export function writeLook(
  look: Look,
  uniforms: Record<string, unknown>,
  handParams: Float32Array | null,
): void {
  const shimmer = smooth(look.shimmer);
  const broken = smooth(look.broken);
  uniforms.uShimmer = shimmer;
  uniforms.uBroken = broken;
  uniforms.uShatter = look.age;
  if (handParams) handParams[3] = packFx(shimmer, broken, burstOf(look.age, tune.burstLen));
}
