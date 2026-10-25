/**
 * The engine seam: noise gate, the funcs_v2 boot
 * load and the save guard — real wasm where possible, a scripted evaluate for
 * engine faults (no real input reaches an internal error). Trap containment
 * itself is the wrapper's, tested in libs/ts/weal-engine.
 */

import { evaluate } from "@astra/weal-engine";
import { describe, expect, test } from "vitest";

import {
  checkNewSave,
  GUARD_ROLLS,
  isBareAtom,
  isInternalError,
  loadValidatedFuncs,
  passesNoiseGate,
  runEngine,
} from "./engine";

const SEED = new Uint8Array(32).fill(77);

/**
 * A saved source that type-checks but fails to evaluate. The engine never
 * serializes one (a save stores a value it already computed), but a stored
 * row can still hold one, and it is the shape that would break every roll.
 */
const EVAL_FAILS = "1 / 0";

describe("passesNoiseGate (which errors are visible)", () => {
  test("die tokens pass", () => {
    expect(passesNoiseGate("d20", [])).toBe(true);
    expect(passesNoiseGate("4d6kh3", [])).toBe(true);
    expect(passesNoiseGate("roll 2d8 pls", [])).toBe(true);
  });

  test("let/match as words pass; embedded in a word they don't", () => {
    expect(passesNoiseGate("let x", [])).toBe(true);
    expect(passesNoiseGate("match x", [])).toBe(true);
    expect(passesNoiseGate("lets go matches", [])).toBe(false);
  });

  test("operator characters pass", () => {
    for (const src of ["xyzzy + 1", "a - b", "2 * 3", "x < y", "f(", "xs["]) {
      expect(passesNoiseGate(src, [])).toBe(true);
    }
  });

  test("a saved name as a word passes; only with saves loaded", () => {
    expect(passesNoiseGate("smite", ["smite"])).toBe(true);
    expect(passesNoiseGate("smite", [])).toBe(false);
    expect(passesNoiseGate("smiten", ["smite"])).toBe(false);
  });

  test("bare chat noise stays silent", () => {
    expect(passesNoiseGate("lol", [])).toBe(false);
    expect(passesNoiseGate("brb", [])).toBe(false);
    expect(passesNoiseGate("good morning", [])).toBe(false);
  });
});

describe("isBareAtom", () => {
  test("lone atoms are bare; anything more isn't", () => {
    expect(isBareAtom(":p")).toBe(true);
    expect(isBareAtom(":kebab-case")).toBe(true);
    expect(isBareAtom(":p ")).toBe(false);
    expect(isBareAtom("dl([:p])")).toBe(false);
    expect(isBareAtom("p")).toBe(false);
  });
});

describe("runEngine", () => {
  test("passes an ok result through (real wasm, seeded)", () => {
    const outcome = runEngine("2d6", [], SEED);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.value.displays[0]?.kind).toBe("die");
  });

  test("passes an engine error through", () => {
    const outcome = runEngine("xyzzy + 1", [], SEED);
    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.stage).toBe("type");
  });

  test("a paren bomb is a parse error (the nesting cap), and the next roll works", () => {
    const outcome = runEngine(`${"(".repeat(2000)}1${")".repeat(2000)}`, [], SEED);
    expect(outcome.kind === "error" && outcome.error.stage).toBe("parse");
    expect(runEngine("2d6", [], SEED).kind).toBe("ok");
  });
});

describe("loadValidatedFuncs (the funcs_v2 boot load, real wasm)", () => {
  test("valid rows are kept in id order; later rows see earlier saves", () => {
    const rows = [
      { id: 1, name: "bonus", source: "3" },
      { id: 2, name: "smite", source: "|x| x + bonus" }, // references row 1
    ];
    expect(loadValidatedFuncs(rows)).toEqual([
      ["bonus", "3"],
      ["smite", "|x| x + bonus"],
    ]);
  });

  test("a stale row is skipped; the rest still load", () => {
    const rows = [
      { id: 1, name: "bonus", source: "3" },
      { id: 2, name: "bad", source: "1 +" }, // parse error → skipped w/ WARN
      { id: 3, name: "orphan", source: "|x| x + missing" }, // unbound → skipped
      { id: 4, name: "fine", source: "|x| x + bonus" },
    ];
    expect(loadValidatedFuncs(rows)).toEqual([
      ["bonus", "3"],
      ["fine", "|x| x + bonus"],
    ]);
  });

  test("a row invalidated only by a skipped predecessor is also skipped", () => {
    const rows = [
      { id: 1, name: "base", source: "1 +" }, // broken
      { id: 2, name: "user", source: "|x| x + base" }, // depends on the broken row
    ];
    expect(loadValidatedFuncs(rows)).toEqual([]);
  });

  test("no rows → empty list", () => {
    expect(loadValidatedFuncs([])).toEqual([]);
  });

  test("a save that type-checks but fails to evaluate is skipped; every roll keeps working", () => {
    // Before the boot load evaluated saves, `1 / 0` passed it and then failed
    // every roll with a prelude error naming it.
    const rows = [
      { id: 1, name: "bonus", source: "3" },
      { id: 2, name: "zero", source: EVAL_FAILS },
      { id: 3, name: "smite", source: "|x| x + bonus" },
    ];
    const funcs = loadValidatedFuncs(rows);
    expect(funcs).toEqual([
      ["bonus", "3"],
      ["smite", "|x| x + bonus"],
    ]);
    expect(runEngine("d20 + bonus", funcs, SEED).kind).toBe("ok");
    expect(runEngine("smite(1)", funcs, SEED).kind).toBe("ok");
  });

  test("a bad later row of a saved name leaves the earlier good one in place", () => {
    const rows = [
      { id: 1, name: "bonus", source: "3" },
      { id: 2, name: "bonus", source: EVAL_FAILS },
    ];
    expect(loadValidatedFuncs(rows)).toEqual([["bonus", "3"]]);
  });

  test("each row is loaded by a run, after the valid rows before it", () => {
    const calls: { source: string; list: [string, string][]; mode: string }[] = [];
    const spy: typeof evaluate = (source, list, seed, budget, mode) => {
      calls.push({ source, list, mode });
      return evaluate(source, list, seed, budget, mode);
    };
    loadValidatedFuncs(
      [
        { id: 1, name: "a", source: "1" },
        { id: 2, name: "b", source: "2" },
      ],
      { evaluateFn: spy },
    );
    expect(calls).toEqual([
      { source: "()", list: [["a", "1"]], mode: "run" },
      {
        source: "()",
        list: [
          ["a", "1"],
          ["b", "2"],
        ],
        mode: "run",
      },
    ]);
  });
});

/** `save(:adv, || 2d20kh1)` as the engine serializes it (a macro a player reported broken). */
const NULLARY_ADV = "|| kh(pool(2, d20), 1)";

/**
 * The real engine, except that the guard's wrapped use `use` reports an
 * internal error. No real input reaches one since the nullary-macro fix, so this
 * stands in for the next checker/interpreter disagreement.
 */
function internalErrorOn(use: string): typeof evaluate {
  return (source, list, seed, budget, mode) =>
    source === `let _ = ${use}; ()`
      ? {
          ok: false,
          stage: "internal",
          message: "internal error: boom — the checker should have rejected this",
          span: null,
          preludeName: null,
        }
      : evaluate(source, list, seed, budget, mode);
}

describe("checkNewSave (the save guard, real wasm)", () => {
  test("a save that fails to evaluate fails every run it is part of", () => {
    // What the guard keeps out of the list (and the boot load skips).
    const outcome = runEngine("d6", [["bad", EVAL_FAILS]], SEED);
    expect(outcome.kind === "error" && outcome.error.stage).toBe("prelude");
  });

  test("such a save is refused at the trivial roll, naming itself", () => {
    const check = checkNewSave("bad", EVAL_FAILS, []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.kind).toBe("rolls");
    expect(check.probe).toBe("d20");
    expect(check.error?.stage).toBe("prelude");
    expect(check.error?.preludeName).toBe("bad");
    expect(check.shadowsBuiltin).toBe(false);
  });

  test("the reported nullary macro loads, rolls and is accepted", () => {
    expect(loadValidatedFuncs([{ id: 1, name: "adv", source: NULLARY_ADV }])).toEqual([
      ["adv", NULLARY_ADV],
    ]);
    expect(runEngine("d6", [["adv", NULLARY_ADV]], SEED).kind).toBe("ok");
    const outcome = runEngine("adv() + adv()", [["adv", NULLARY_ADV]], SEED);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    // Each call rolls its own 2d20: four standard dice.
    const display = outcome.value.displays[0];
    expect(display?.kind === "die" ? display.standardDice : []).toHaveLength(4);
    expect(checkNewSave("adv", NULLARY_ADV, [])).toEqual({ ok: true });
  });

  test("ordinary saves pass: values, dice, functions, die suffixes", () => {
    for (const [name, source] of [
      ["bonus", "3"],
      ["adv", "kh(pool(2, d20), 1)"],
      ["smite", "|n| sum(pool(n, d8)) + 5"],
      ["pow", "|die, n| explode(die, n)"],
      ["greet", '"hi"'],
    ] as const) {
      expect(checkNewSave(name, source, [])).toEqual({ ok: true });
    }
  });

  test("a function that fails on its own logic is the player's business, not refused", () => {
    expect(checkNewSave("oops", "|x| x / 0", [])).toEqual({ ok: true });
  });

  test("a huge die save stays cheap to check (uses skip the distribution)", () => {
    const started = performance.now();
    expect(checkNewSave("big", "pool(1000, d1000)", [])).toEqual({ ok: true });
    // Showing `big` takes ~2 s for the distribution; the wrapped uses take ~ms.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("shadowing a die-suffix builtin with a non-function is refused", () => {
    const check = checkNewSave("kh", "3", []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.kind).toBe("rolls");
    expect(check.probe).toBe("2d20kh1 + 1");
    expect(check.error?.stage).toBe("type");
    expect(check.shadowsBuiltin).toBe(true);
  });

  test("shadowing `save` is refused (it would block every later save, even the fix)", () => {
    const check = checkNewSave("save", "3", []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.probe).toBe("save(:x, 1)");
  });

  test("redefining a suffix with a function of the right shape is allowed", () => {
    expect(checkNewSave("kh", "|p, n| kh(p, n)", [])).toEqual({ ok: true });
  });

  test("nullary macros pass, and the guard calls them with `()`", () => {
    for (const source of ["|| 3", "|| d20 + 7", "let f() = explode(d6, 1); f"]) {
      const probes: string[] = [];
      const spy: typeof evaluate = (src, list, seed, budget, mode) => {
        probes.push(src);
        return evaluate(src, list, seed, budget, mode);
      };
      expect(checkNewSave("atk", source, [], { evaluateFn: spy })).toEqual({ ok: true });
      expect(probes).toContain("let _ = atk(); ()");
    }
  });

  test("a macro whose use hits an internal error is refused (kind `use`)", () => {
    for (const [source, use] of [
      ["|| d20 + 7", "atk()"],
      ["|y| y + 1", "atk(1)"],
      ["d20 + 7", "atk + 1"],
    ] as const) {
      const check = checkNewSave("atk", source, [], { evaluateFn: internalErrorOn(use) });
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.kind).toBe("use");
      expect(check.probe).toBe(use);
      expect(check.error !== null && isInternalError(check.error)).toBe(true);
    }
  });

  test("a replacement is checked against every other save, appended last", () => {
    const saves: [string, string][] = [
      ["bonus", "3"],
      ["smite", "|x| x + bonus"],
    ];
    const seen: [string, string][][] = [];
    const spy: typeof evaluate = (source, list, seed, budget, mode) => {
      seen.push(list);
      return evaluate(source, list, seed, budget, mode);
    };
    expect(checkNewSave("bonus", "5", saves, { evaluateFn: spy })).toEqual({ ok: true });
    // Every run probe saw the whole list plus the replacement at the end.
    const runs = seen.filter((list) => list.length === 3);
    expect(runs.length).toBeGreaterThanOrEqual(GUARD_ROLLS.length);
    for (const list of runs) expect(list).toEqual([...saves, ["bonus", "5"]]);
    // And a bad replacement is refused even though the old one was fine.
    const bad = checkNewSave("bonus", EVAL_FAILS, saves);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error?.preludeName).toBe("bonus");
  });

  test("a roll already broken by an earlier save doesn't block an unrelated save", () => {
    // `kh` was shadowed before the guard existed: `kh` rolls fail with or without `bonus`.
    expect(checkNewSave("bonus", "3", [["kh", "3"]])).toEqual({ ok: true });
  });

  test("an engine fault on every probe refuses the save at the first use", () => {
    const trapped = {
      ok: false,
      stage: "internal",
      message: "engine trap: unreachable",
      span: null,
      preludeName: null,
    } as const;
    const check = checkNewSave("bonus", "3", [], { evaluateFn: () => trapped });
    // Every guard roll fails with and without the save, so only the uses decide.
    expect(check).toEqual({
      ok: false,
      kind: "use",
      probe: "bonus + 1",
      error: trapped,
      shadowsBuiltin: false,
    });
  });
});

describe("isInternalError", () => {
  test("stage internal is internal; ordinary errors aren't", () => {
    // No real input reaches an engine internal error since the nullary-macro fix; the
    // stage is the engine's contract (`api.rs`), pinned by its own tests.
    expect(
      isInternalError({
        ok: false,
        stage: "internal",
        message: "internal error: boom",
        span: null,
        preludeName: null,
      }),
    ).toBe(true);
    // The input that used to hit the nullary-macro bug is now an ordinary type error.
    const nullary = runEngine("x + 1", [["x", "|| 3"]], SEED);
    expect(nullary.kind === "error" && nullary.error.stage).toBe("type");
    for (const source of ["xyzzy + 1", "1 / 0", "10000d10000"]) {
      const outcome = runEngine(source, [], SEED);
      expect(outcome.kind === "error" && isInternalError(outcome.error)).toBe(false);
    }
  });
});
