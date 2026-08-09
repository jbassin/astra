/**
 * The engine seam (spec 0032 D32-14/D32-17): noise gate, panic containment,
 * and the funcs_v2 boot-validation algorithm — real wasm where possible, an
 * injected throwing evaluate for the panic path (the real engine can't be made
 * to panic on demand).
 */

import { describe, expect, test } from "vitest";

import { isBareAtom, loadValidatedFuncs, passesNoiseGate, runEngine } from "./engine";

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
