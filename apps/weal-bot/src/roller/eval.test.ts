/**
 * Eval parity (spec K1 surface 1, value side) — `interpret` results compared against
 * faerrin's `eval.rs` `expect!` vectors. Display values are simplified to plain
 * numbers/arrays for comparison; errors compared by message.
 */

import { describe, expect, test } from "vitest";

import { dieRepr } from "./die";
import { interpret } from "./eval";
import type { Display } from "./types";

function simplify(d: Display): unknown {
  switch (d.k) {
    case "Number":
      return d.n;
    case "List":
      return d.items.map(simplify);
    case "Die":
      return { die: dieRepr(d.die) };
  }
}

function disp(input: string): unknown[] {
  const r = interpret(input, []);
  if (!r.ok) throw new Error(`interpret failed: ${r.error}`);
  return r.cmd.display.map(simplify);
}

function err(input: string): string {
  const r = interpret(input, []);
  if (r.ok) throw new Error("expected an error");
  return r.error;
}

describe("eval: atoms + exprs", () => {
  test("number", () => expect(disp("55")).toEqual([55]));
  test("underscored number", () => expect(disp("1_000_000")).toEqual([1000000]));
  test("sigil → no display", () => expect(disp(":sigil")).toEqual([]));
  test("anon func → no display", () => expect(disp("|first, second,| first + second")).toEqual([]));
  test("list", () => expect(disp("[1,2,3,4,]")).toEqual([[1, 2, 3, 4]]));
  test("precedence", () => expect(disp("55 + -35 * 12")).toEqual([-365]));
  test("group", () => expect(disp("(55 + -35) * 12")).toEqual([240]));
});

describe("eval: errors", () => {
  test("unbound ident", () =>
    expect(err("hello")).toBe('Can\'t find given variable in context "hello"'));
  test("parse error (uppercase)", () => expect(err("Hiya")).toBe("Parsing error"));
  test("unbound dashed ident", () =>
    expect(err("get-best")).toBe('Can\'t find given variable in context "get-best"'));
  test("parse error (underscore)", () => expect(err("_testerman")).toBe("Parsing error"));
  test("unbound call", () =>
    expect(err("run(1, :test)")).toBe('Can\'t find given variable in context "run"'));
});

describe("eval: blocks", () => {
  test("two lets", () => expect(disp("let x = 4 in let y = 6 in x + y")).toEqual([10]));
  test("nested let value", () =>
    expect(disp("let x = let a = 4 * 6 in let b = 22 in a * b in let y = 6 in x + y")).toEqual([
      534,
    ]));
  test("grouped nested let value", () =>
    expect(disp("let x = (let a = 4 * 6 in let b = 22 in a * b) in let y = 6 in x + y")).toEqual([
      534,
    ]));
  test("named func with list-broadcast", () =>
    expect(
      disp(
        "let test-func(first, second,) = let a = first + second in let b = first - second in a * b in test-func(1, [1, 2, 3])",
      ),
    ).toEqual([
      [
        [0, -2, -4],
        [0, -3, -6],
        [0, -4, -8],
      ],
    ]));
  test("anon func with list-broadcast", () =>
    expect(
      disp(
        "let test-func = |first, second| let a = first + second in let b = first - second in a * b in test-func(1, [1, 2, 3])",
      ),
    ).toEqual([
      [
        [0, -2, -4],
        [0, -3, -6],
        [0, -4, -8],
      ],
    ]));
});

describe("eval: builtins", () => {
  test("id(1)", () => expect(disp("id(1)")).toEqual([1]));
  test("id() error", () => expect(err("id()")).toBe("Expected at least 1 argument"));
  test("id(1, 2, 3)", () => expect(disp("id(1, 2, 3)")).toEqual([1]));
});
