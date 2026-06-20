/**
 * Operator-precedence climbing — TS port of `roller/src/pratt_parser.rs` (the faerrin
 * `pratt` crate usage). The parser flattens an expression into a `Pratt[]` token stream
 * (prefix / atom / group / infix); this climbs it into an `Expr`.
 *
 * Binding powers use the matklad (lbp, rbp) encoding of faerrin's `Affix` table:
 *   Semi=Prec1 Left, Add/Sub=Prec3 Left, Mul/Div=Prec4 Left, Dot=Prec5 Right,
 *   Neg=Prec6 Prefix. Left-assoc → (2p, 2p+1); Right-assoc → (2p+1, 2p); Prefix → 2p.
 * This reproduces faerrin's parse trees exactly (verified against its parser tests).
 */

import type { Atom, BinOpr, Expr, UnOpr } from "./types";

export type Pratt =
  | { k: "Prefix"; op: UnOpr }
  | { k: "Infix"; op: BinOpr }
  | { k: "Atom"; atom: Atom }
  | { k: "Group"; expr: Expr };

const PREC: Record<BinOpr, number> = { Semi: 1, Dot: 5, Add: 3, Sub: 3, Mul: 4, Div: 4 };
const RIGHT_ASSOC: Record<BinOpr, boolean> = {
  Semi: false,
  Add: false,
  Sub: false,
  Mul: false,
  Div: false,
  Dot: true,
};

function infixBp(op: BinOpr): [number, number] {
  const p = PREC[op];
  return RIGHT_ASSOC[op] ? [2 * p + 1, 2 * p] : [2 * p, 2 * p + 1];
}

const PREFIX_RBP = 2 * 6; // UnOpr::Neg = Precedence(6)

export function parsePratt(tokens: Pratt[]): Expr {
  let i = 0;

  function nud(): Expr {
    const t = tokens[i++];
    if (t === undefined) throw new SyntaxError("unexpected end of expression");
    switch (t.k) {
      case "Prefix":
        return { k: "UnOp", op: t.op, expr: expr(PREFIX_RBP) };
      case "Atom":
        return { k: "Atom", atom: t.atom };
      case "Group":
        return t.expr;
      case "Infix":
        throw new SyntaxError("infix operator in operand position");
    }
  }

  function expr(minBp: number): Expr {
    let left = nud();
    for (;;) {
      const t = tokens[i];
      if (t === undefined || t.k !== "Infix") break;
      const [lbp, rbp] = infixBp(t.op);
      if (lbp < minBp) break;
      i++;
      left = { k: "BinOp", lhs: left, op: t.op, rhs: expr(rbp) };
    }
    return left;
  }

  const result = expr(0);
  // The `pratt` crate consumes the whole token stream or errors; a leftover token
  // (e.g. two adjacent groups with no infix between) is a parse failure.
  if (i !== tokens.length) throw new SyntaxError("unconsumed pratt tokens");
  return result;
}
