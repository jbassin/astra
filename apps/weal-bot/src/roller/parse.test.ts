/**
 * Parse parity (spec K1 surface 1) — input → AST, compared as serde-JSON against the
 * expected trees from faerrin's `parser.rs` / `eval.rs` tests (translated from their
 * `expect!` s-expr/debug vectors). `parse` wraps results in `Expr`, so atom-level
 * vectors appear under `{"Atom":…}`.
 */

import { describe, expect, test } from "bun:test";
import { parse } from "./parser";
import { exprToJson } from "./serde";

function ast(input: string): string | null {
  const e = parse(input);
  return e === null ? null : exprToJson(e);
}

describe("parse: atoms", () => {
  const cases: [string, string][] = [
    ["55", '{"Atom":{"Number":55}}'],
    ["1_000_000", '{"Atom":{"Number":1000000}}'],
    ["hello", '{"Atom":{"Ident":"hello"}}'],
    ["get-best", '{"Atom":{"Ident":"get-best"}}'],
    [":sigil", '{"Atom":{"Sigil":"sigil"}}'],
    ["d20", '{"Atom":{"Die":{"Base":[1,20]}}}'],
    ["8d6", '{"Atom":{"Die":{"Base":[8,6]}}}'],
    [
      "[1,2,3,4,]",
      '{"Atom":{"List":[{"Atom":{"Number":1}},{"Atom":{"Number":2}},{"Atom":{"Number":3}},{"Atom":{"Number":4}}]}}',
    ],
    [
      "run(1, :test)",
      '{"Atom":{"FuncCall":[{"Atom":{"Ident":"run"}},[{"Atom":{"Number":1}},{"Atom":{"Sigil":"test"}}]]}}',
    ],
    [
      "|first, second,| first + second",
      '{"Atom":{"Func":[null,["first","second"],{"BinOp":[{"Atom":{"Ident":"first"}},"Add",{"Atom":{"Ident":"second"}}]}]}}',
    ],
  ];
  for (const [input, expected] of cases) {
    test(input, () => expect(ast(input)).toBe(expected));
  }
});

describe("parse: failures (faerrin returns None)", () => {
  for (const input of ["Hiya", "_testerman", ""]) {
    test(JSON.stringify(input), () => expect(ast(input)).toBeNull());
  }
});

describe("parse: precedence + associativity", () => {
  test("55 + -35 * 12 (Mul binds tighter; unary neg)", () => {
    expect(ast("55 + -35 * 12")).toBe(
      '{"BinOp":[{"Atom":{"Number":55}},"Add",{"BinOp":[{"UnOp":["Neg",{"Atom":{"Number":35}}]},"Mul",{"Atom":{"Number":12}}]}]}',
    );
  });
  test("(55 + -35) * 12 (group overrides)", () => {
    expect(ast("(55 + -35) * 12")).toBe(
      '{"BinOp":[{"BinOp":[{"Atom":{"Number":55}},"Add",{"UnOp":["Neg",{"Atom":{"Number":35}}]}]},"Mul",{"Atom":{"Number":12}}]}',
    );
  });
});

describe("parse: let..in blocks", () => {
  test("nested let", () => {
    expect(ast("let x = 4 in let y = 6 in x + y")).toBe(
      '{"Assign":["x",{"Atom":{"Number":4}},{"Assign":["y",{"Atom":{"Number":6}},{"BinOp":[{"Atom":{"Ident":"x"}},"Add",{"Atom":{"Ident":"y"}}]}]}]}',
    );
  });
  test("named func + call", () => {
    const src =
      "let test-func(first, second,) = let a = first + second in let b = first - second in a * b in test-func(1, [1, 2, 3])";
    expect(ast(src)).toBe(
      '{"Assign":["test-func",{"Atom":{"Func":["test-func",["first","second"],{"Assign":["a",{"BinOp":[{"Atom":{"Ident":"first"}},"Add",{"Atom":{"Ident":"second"}}]},{"Assign":["b",{"BinOp":[{"Atom":{"Ident":"first"}},"Sub",{"Atom":{"Ident":"second"}}]},{"BinOp":[{"Atom":{"Ident":"a"}},"Mul",{"Atom":{"Ident":"b"}}]}]}]}]}},{"Atom":{"FuncCall":[{"Atom":{"Ident":"test-func"}},[{"Atom":{"Number":1}},{"Atom":{"List":[{"Atom":{"Number":1}},{"Atom":{"Number":2}},{"Atom":{"Number":3}}]}}]]}}]}',
    );
  });
  test("anon func via let", () => {
    const src =
      "let test-func = |first, second| let a = first + second in let b = first - second in a * b in test-func(1, [1, 2, 3])";
    expect(ast(src)).toBe(
      '{"Assign":["test-func",{"Atom":{"Func":[null,["first","second"],{"Assign":["a",{"BinOp":[{"Atom":{"Ident":"first"}},"Add",{"Atom":{"Ident":"second"}}]},{"Assign":["b",{"BinOp":[{"Atom":{"Ident":"first"}},"Sub",{"Atom":{"Ident":"second"}}]},{"BinOp":[{"Atom":{"Ident":"a"}},"Mul",{"Atom":{"Ident":"b"}}]}]}]}]}},{"Atom":{"FuncCall":[{"Atom":{"Ident":"test-func"}},[{"Atom":{"Number":1}},{"Atom":{"List":[{"Atom":{"Number":1}},{"Atom":{"Number":2}},{"Atom":{"Number":3}}]}}]]}}]}',
    );
  });
});
