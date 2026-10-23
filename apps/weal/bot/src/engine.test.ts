/**
 * The engine seam (spec 0032 D32-14/D32-17): noise gate, panic containment,
 * and the funcs_v2 boot-validation algorithm — real wasm where possible, an
 * injected throwing evaluate for the panic path (the real engine can't be made
 * to panic on demand).
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

describe("passesNoiseGate (D32-14)", () => {
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

  test("contains a throw: fault outcome + re-instantiation, never a rethrow", () => {
    let reinstantiated = 0;
    const outcome = runEngine("d20", [], SEED, {
      evaluateFn: () => {
        throw new Error("wasm trap: unreachable");
      },
      reinstantiateFn: () => {
        reinstantiated += 1;
      },
    });
    expect(outcome).toEqual({ kind: "fault" });
    expect(reinstantiated).toBe(1);
  });
});

describe("loadValidatedFuncs (the D32-17 boot algorithm, real wasm)", () => {
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
});

/** `save(:adv, || 2d20kh1)` as the engine serializes it (WEAL-2's reported macro). */
const NULLARY_ADV = "|| kh(pool(2, d20), 1)";

describe("checkNewSave (the save guard, real wasm)", () => {
  test("the reported macro passes the boot check but fails every run", () => {
    // The blind spot the guard closes: boot validation never evaluates saves.
    expect(loadValidatedFuncs([{ id: 1, name: "adv", source: NULLARY_ADV }])).toEqual([
      ["adv", NULLARY_ADV],
    ]);
    const outcome = runEngine("d6", [["adv", NULLARY_ADV]], SEED);
    expect(outcome.kind).toBe("error");
  });

  test("the reported macro is refused at the trivial roll, naming itself", () => {
    const check = checkNewSave("adv", NULLARY_ADV, []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.kind).toBe("rolls");
    expect(check.probe).toBe("d20");
    expect(check.error?.stage).toBe("prelude");
    expect(check.error?.preludeName).toBe("adv");
    expect(check.shadowsBuiltin).toBe(false);
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

  test("nullary macros that load but fail on use are refused (kind `use`)", () => {
    for (const source of ["|| 3", "|| d20 + 7", "let f() = explode(d6, 1); f"]) {
      const check = checkNewSave("atk", source, []);
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.kind).toBe("use");
      expect(check.probe).toBe("atk + 1");
      expect(check.error !== null && isInternalError(check.error)).toBe(true);
    }
  });

  test("a function whose body hits an internal error is refused on call", () => {
    const check = checkNewSave("hit", "let g() = 3; |y| g() + y", []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.kind).toBe("use");
    expect(check.probe).toBe("hit(1)");
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
    const bad = checkNewSave("bonus", NULLARY_ADV, saves);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error?.preludeName).toBe("bonus");
  });

  test("a roll already broken by an earlier save doesn't block an unrelated save", () => {
    // `kh` was shadowed before the guard existed: `kh` rolls fail with or without `bonus`.
    expect(checkNewSave("bonus", "3", [["kh", "3"]])).toEqual({ ok: true });
  });

  test("a contained engine fault refuses the save (error null) and re-instantiates", () => {
    let reinstantiated = 0;
    const check = checkNewSave("bonus", "3", [], {
      evaluateFn: () => {
        throw new Error("wasm trap: unreachable");
      },
      reinstantiateFn: () => {
        reinstantiated += 1;
      },
    });
    expect(check).toEqual({
      ok: false,
      kind: "use",
      probe: "bonus + 1",
      error: null,
      shadowsBuiltin: false,
    });
    expect(reinstantiated).toBeGreaterThan(0);
  });
});

describe("isInternalError (pinned against the real wasm)", () => {
  test("a checker/interpreter disagreement is internal; ordinary errors aren't", () => {
    const internal = runEngine("x + 1", [["x", "|| 3"]], SEED);
    expect(internal.kind === "error" && isInternalError(internal.error)).toBe(true);
    for (const source of ["xyzzy + 1", "1 / 0", "10000d10000"]) {
      const outcome = runEngine(source, [], SEED);
      expect(outcome.kind === "error" && isInternalError(outcome.error)).toBe(false);
    }
  });
});
