import { describe, expect, it } from "vitest";

import { followMotionPreference, type MotionLoop } from "./motion";

/** A MediaQueryList stand-in whose `matches` the test flips. */
function fakeMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    set(next: boolean) {
      this.matches = next;
      for (const cb of listeners) cb();
    },
    listenerCount: () => listeners.size,
  };
}

function recordingLoop(): MotionLoop & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    start: () => calls.push("start"),
    stop: () => calls.push("stop"),
    renderStill: () => calls.push("still"),
  };
}

describe("followMotionPreference", () => {
  it("animates as before for a viewer with no reduced-motion preference", () => {
    const loop = recordingLoop();
    followMotionPreference(loop, fakeMedia(false) as unknown as MediaQueryList);
    expect(loop.calls).toEqual(["start"]);
  });

  it("animates where matchMedia is missing", () => {
    const loop = recordingLoop();
    followMotionPreference(loop, undefined);
    expect(loop.calls).toEqual(["start"]);
  });

  it("stops on one still frame when the viewer prefers reduced motion", () => {
    const loop = recordingLoop();
    followMotionPreference(loop, fakeMedia(true) as unknown as MediaQueryList);
    expect(loop.calls).toEqual(["stop", "still"]);
  });

  it("follows a change to the preference, and stops listening on cleanup", () => {
    const loop = recordingLoop();
    const media = fakeMedia(false);
    const cleanup = followMotionPreference(loop, media as unknown as MediaQueryList);
    media.set(true);
    media.set(false);
    expect(loop.calls).toEqual(["start", "stop", "still", "start"]);
    cleanup();
    expect(media.listenerCount()).toBe(0);
  });
});
