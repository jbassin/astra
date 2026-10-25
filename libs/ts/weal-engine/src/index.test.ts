// The wasm smoke: loads the REAL committed artifact in gen/ and
// proves the seam end-to-end — a stale/corrupt artifact reds CI here
// without cargo in the loop.

import { createRequire } from "node:module";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BUILTINS,
  evaluate,
  isBuiltin,
  reinstantiate,
  type WealDieDisplay,
  type WealResult,
  type WealStage,
} from "./index.js";

// tsc checks these: the generated gen/weal_api.d.ts resolves to the real contract, not `any`.
expectTypeOf<WealStage>().toEqualTypeOf<
  "parse" | "type" | "eval" | "fuel" | "prelude" | "internal"
>();
expectTypeOf<WealResult["ok"]>().toEqualTypeOf<boolean>();
expectTypeOf<WealDieDisplay["standardDice"]>().toEqualTypeOf<Array<[number, number]>>();

// The golden seed (libs/rust/weal-engine/tests/render_goldens.rs).
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

describe("the builtin registry", () => {
  it("lists exactly the names the committed wasm resolves with no saves", () => {
    expect(BUILTINS.length).toBeGreaterThan(30);
    for (const b of BUILTINS) {
      expect(isBuiltin(b.name)).toBe(true);
      expect(evaluate(b.name, [], seed, 0, "check").ok).toBe(true);
    }
    expect(isBuiltin("smite")).toBe(false);
    expect(evaluate("smite", [], seed, 0, "check").ok).toBe(false);
  });
});

describe("trap containment", () => {
  const glue = (): { evaluate: (...args: unknown[]) => string } =>
    createRequire(import.meta.url)("../gen/weal_engine.js");

  it("an injected trap is reported as internal and the next roll runs on a fresh instance", () => {
    const poisoned = glue();
    const before = evaluate("2d6", [], seed, 0, "run");
    // Simulate a Rust panic: the loaded instance's export traps from now on.
    poisoned.evaluate = () => {
      throw new WebAssembly.RuntimeError("unreachable");
    };
    const trapped = evaluate("2d6", [], seed, 0, "run");
    expect(trapped).toEqual({
      ok: false,
      stage: "internal",
      message: "engine trap: unreachable",
      span: null,
      preludeName: null,
    });
    // The wrapper dropped the poisoned module: the cache holds a new one, and
    // rolls work again without the caller doing anything.
    expect(glue()).not.toBe(poisoned);
    expect(evaluate("2d6", [], seed, 0, "run")).toEqual(before);
  });

  it("a paren bomb is a parse error, not a trap: the nesting cap stops it first", () => {
    const deep = `${"(".repeat(2000)}1${")".repeat(2000)}`;
    const result = evaluate(deep, [], seed, 0, "run");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("parse");
    expect(result.message).toBe("parse error: expression too deeply nested (more than 256 levels)");
    expect(evaluate("2d6", [], seed, 0, "run").ok).toBe(true);
  });
});
