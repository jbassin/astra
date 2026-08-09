// The D32-13 wasm smoke: loads the REAL committed artifact in gen/ and
// proves the seam end-to-end — a stale/corrupt artifact reds CI here
// without cargo in the loop.

import { describe, expect, it } from "vitest";

import { evaluate, reinstantiate } from "./index.js";

// The S5 golden seed (libs/rust/weal-engine/tests/render_goldens.rs).
const seed = new Uint8Array(32).fill(77);

describe("@astra/weal-engine wasm smoke", () => {
  it("rolls seeded 2d6 through the committed wasm", () => {
    const result = evaluate("2d6", [], seed, 0, "run");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.displays).toHaveLength(1);
    const display = result.displays[0];
    if (display === undefined) return;
    expect(display.kind).toBe("die");
    if (display.kind !== "die") return;
    expect(display.standardDice).toHaveLength(2);
    expect(display.renderText).toBe("2d6 ⟪6,1⟫ = 7");
    expect(display.headline).toBe("7");
    expect(display.goodness).toBe("okay");
  });

  it("mode:check validates without executing", () => {
    const result = evaluate("2d6", [], seed, 0, "check");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.displays).toHaveLength(0);
    expect(result.plots).toHaveLength(0);
    expect(result.saves).toHaveLength(0);
  });

  it("type errors carry stage and span across the boundary", () => {
    const result = evaluate('1 + "a"', [], seed, 0, "run");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("type");
    expect(result.span).toEqual({ start: 0, end: 7 });
    expect(result.preludeName).toBeNull();
  });

  it("reinstantiate() swaps in a fresh wasm instance that still evaluates", () => {
    const before = evaluate("2d6", [], seed, 0, "run");
    expect(before.ok).toBe(true);
    reinstantiate();
    const after = evaluate("2d6", [], seed, 0, "run");
    expect(after).toEqual(before); // same fixed seed → identical roll from the fresh instance
  });

  it("prelude errors name the failing save", () => {
    const result = evaluate("d6", [["bad", "1 +"]], seed, 0, "run");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("prelude");
    expect(result.preludeName).toBe("bad");
    expect(result.span).toEqual({ start: 3, end: 3 });
  });
});
