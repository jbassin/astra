/**
 * Roller AST + value types — a faithful TS port of faerrin's `mouth/crates/roller`
 * (`ast.rs`, `die.rs`). Discriminated unions mirror the Rust enums one-to-one so the
 * parity harness can compare ASTs and the serde codec ([[serde.ts]]) can round-trip
 * the byte-exact JSON faerrin wrote into the `funcs` table.
 *
 * Number note: Rust uses `isize` (64-bit). JS `number` is float64 (exact to 2^53);
 * the dice domain is tiny so this is faithful in practice. Integer division must use
 * `Math.trunc` to match Rust's toward-zero truncation (see `binOprModify`).
 */

// --- operators (ast.rs BinOpr / UnOpr) ----------------------------------------------

export type BinOpr = "Add" | "Sub" | "Mul" | "Div" | "Semi" | "Dot";
export type UnOpr = "Neg";

/** `BinOpr::modify` — note `Semi` returns rhs, `Dot` returns lhs, `Div` truncates. */
export function binOprModify(op: BinOpr, lhs: number, rhs: number): number {
  switch (op) {
    case "Add":
      return lhs + rhs;
    case "Sub":
      return lhs - rhs;
    case "Mul":
      return lhs * rhs;
    case "Div":
      return Math.trunc(lhs / rhs);
    case "Semi":
      return rhs;
    case "Dot":
      return lhs;
  }
}

/** `impl Display for BinOpr` — used verbatim in die `repr()` strings. */
export function binOprDisplay(op: BinOpr): string {
  switch (op) {
    case "Add":
      return "+";
    case "Sub":
      return "-";
    case "Mul":
      return "×";
    case "Div":
      return "÷";
    case "Semi":
      return ";";
    case "Dot":
      return ".";
  }
}

// --- Die (die.rs) -------------------------------------------------------------------

export type Die =
  | { k: "Constant"; c: number }
  | { k: "Base"; count: number; base: number }
  | { k: "Seq"; count: number; values: number[] }
  | { k: "BinOp"; lhs: Die; opr: BinOpr; rhs: Die }
  | { k: "TakeHighest"; collect: number; die: Die }
  | { k: "TakeLowest"; collect: number; die: Die };

// --- AST (ast.rs Atom / Expr) -------------------------------------------------------

export type Atom =
  | { k: "Number"; n: number }
  | { k: "Ident"; s: string }
  | { k: "Sigil"; s: string }
  | { k: "Die"; die: Die }
  | { k: "List"; items: Expr[] }
  | { k: "FuncCall"; callee: Expr; args: Expr[] }
  | { k: "Func"; name: string | null; params: string[]; body: Expr };

export type Expr =
  | { k: "Atom"; atom: Atom }
  | { k: "UnOp"; op: UnOpr; expr: Expr }
  | { k: "BinOp"; lhs: Expr; op: BinOpr; rhs: Expr }
  | { k: "Assign"; ident: string; value: Expr; next: Expr };

// --- runtime values (ast.rs Res / Display) ------------------------------------------

import type { Context } from "./context";

export type Res =
  | { k: "Unit" }
  | { k: "Number"; n: number }
  | { k: "Sigil"; s: string }
  | { k: "List"; items: Res[] }
  | { k: "Die"; die: Die }
  | { k: "Func"; name: string | null; ctx: Context; params: string[]; body: Expr }
  | { k: "Builtin"; name: string };

export type Display =
  | { k: "Number"; n: number }
  | { k: "List"; items: Display[] }
  | { k: "Die"; die: Die };
