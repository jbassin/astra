import { describe, expect, it } from "vitest";

import {
  BREAK_OUT,
  burstOf,
  DEFAULT_TUNE,
  flagTouched,
  NO_AGE,
  newLook,
  packFx,
  SETTLED_AGE,
  SHIMMER_EASE,
  setLookState,
  stepLook,
  tune,
  unpackFx,
  writeLook,
  writeTune,
} from "./look";

const touched = (change: unknown): boolean => flagTouched(change, "world", "ikShatter");

describe("flagTouched", () => {
  it("sees a set", () => {
    expect(touched({ flags: { world: { ikShatter: { state: "shimmer" } } } })).toBe(true);
  });

  it("sees an unset", () => {
    expect(touched({ flags: { world: { "-=ikShatter": null } } })).toBe(true);
  });

  it("sees a forced replace and the whole scope going", () => {
    expect(touched({ flags: { world: { "==ikShatter": {} } } })).toBe(true);
    expect(touched({ flags: { "-=world": null } })).toBe(true);
  });

  it("ignores other keys, other scopes and other changes", () => {
    expect(touched({ flags: { world: { ikArm: {} } } })).toBe(false);
    expect(touched({ flags: { other: { ikShatter: {} } } })).toBe(false);
    expect(touched({ x: 1 })).toBe(false);
    expect(touched({ flags: null })).toBe(false);
    expect(touched(null)).toBe(false);
  });

  it("tells the arm flag from the shatter flag", () => {
    const change = { flags: { world: { ikArm: { segments: 3 } } } };
    expect(flagTouched(change, "world", "ikArm")).toBe(true);
    expect(touched(change)).toBe(false);
  });
});

describe("the look", () => {
  it("starts an arm built shattered already settled, with no burst", () => {
    const look = newLook("shattered");
    expect(look).toMatchObject({ broken: 1, shimmer: 0, age: SETTLED_AGE });
    expect(burstOf(look.age, DEFAULT_TUNE.burstLen)).toBe(0);
  });

  it("starts a normal arm plain and a shimmering one lit", () => {
    expect(newLook(null)).toMatchObject({ broken: 0, shimmer: 0, age: NO_AGE });
    expect(newLook("shimmer").shimmer).toBe(1);
  });

  it("eases the shimmer in over SHIMMER_EASE seconds", () => {
    const look = newLook(null);
    setLookState(look, "shimmer");
    stepLook(look, SHIMMER_EASE / 2);
    expect(look.shimmer).toBeCloseTo(0.5);
    stepLook(look, SHIMMER_EASE);
    expect(look.shimmer).toBe(1);
  });

  it("starts the burst when it sees a shatter, and counts its age", () => {
    const look = newLook("shimmer");
    setLookState(look, "shattered");
    expect(look.age).toBe(0);
    stepLook(look, 0.25);
    expect(look.age).toBeCloseTo(0.25);
    expect(look.shimmer).toBeLessThan(1);
  });

  it("does not restart the burst when the state does not change", () => {
    const look = newLook("shattered");
    setLookState(look, "shattered");
    expect(look.age).toBe(SETTLED_AGE);
  });

  it("heals smoothly when the flag clears, with no burst", () => {
    const look = newLook("shattered");
    setLookState(look, null);
    expect(look.age).toBe(NO_AGE);
    stepLook(look, BREAK_OUT / 2);
    expect(look.broken).toBeCloseTo(0.5);
    stepLook(look, BREAK_OUT);
    expect(look.broken).toBe(0);
  });

  it("takes hold of the broken look at once and lets the shimmer go over its ease", () => {
    const look = newLook("shimmer");
    setLookState(look, "shattered");
    stepLook(look, SHIMMER_EASE);
    expect(look.broken).toBe(1);
    expect(look.shimmer).toBe(0);
  });
});

describe("burstOf", () => {
  it("is 1 at the start, falls, and is 0 from the end of the burst", () => {
    expect(burstOf(0, 1)).toBe(1);
    expect(burstOf(0.5, 1)).toBeLessThan(burstOf(0.1, 1));
    expect(burstOf(1, 1)).toBe(0);
    expect(burstOf(NO_AGE, 1)).toBe(0);
    expect(burstOf(SETTLED_AGE, 1)).toBe(0);
  });

  it("stretches with the burst length", () => {
    expect(burstOf(1, 2)).toBeCloseTo(burstOf(0.5, 1));
  });
});

describe("packFx", () => {
  it("round trips to the nearest 1/31", () => {
    const back = unpackFx(packFx(0.5, 1, 0.2));
    expect(back.shimmer).toBeCloseTo(0.5, 1);
    expect(back.broken).toBe(1);
    expect(back.burst).toBeCloseTo(0.2, 1);
  });

  it("clamps and stays an exact integer in a 32-bit float", () => {
    const packed = packFx(2, -1, 1);
    expect(Math.fround(packed)).toBe(packed);
    expect(unpackFx(packed)).toEqual({ shimmer: 1, broken: 0, burst: 1 });
  });
});

describe("writing to the shader", () => {
  it("writes the look to the uniforms and the hand's fourth float", () => {
    const uniforms: Record<string, unknown> = {};
    const hand = new Float32Array(4);
    writeLook(newLook("shattered"), uniforms, hand);
    expect(uniforms).toEqual({ uShimmer: 0, uBroken: 1, uShatter: SETTLED_AGE });
    expect(unpackFx(hand[3] ?? 0)).toEqual({ shimmer: 0, broken: 1, burst: 0 });
  });

  it("copies the tuning", () => {
    const uniforms: Record<string, unknown> = {};
    writeTune(uniforms);
    expect(uniforms).toEqual({
      uSheenSpeed: tune.sheenSpeed,
      uShimmerGain: tune.shimmerGain,
      uShardPx: tune.shardPx,
      uBurstLen: tune.burstLen,
      uCrackDark: tune.crackDark,
      uKaleidoPx: tune.kaleidoPx,
      uSnapEvery: tune.snapEvery,
      uSnapSpread: tune.snapSpread,
      uGlassGain: tune.glassGain,
    });
  });
});
