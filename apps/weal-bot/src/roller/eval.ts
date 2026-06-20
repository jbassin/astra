/**
 * The tree-walking evaluator — TS port of `roller/src/eval.rs`. Produces a {@link Cmd}
 * (the things to roll/plot/save/lazy-roll). Roller-domain failures are thrown as
 * {@link RollError} and surfaced by {@link interpret} as `{ ok: false }` (faerrin's
 * `Result<Cmd, String>`).
 */

import { type Cmd, Context, newCmd } from "./context";
import { dieConst, dieFromBinOp, RollError } from "./die";
import { parse } from "./parser";
import type { BinOpr, Expr, Res } from "./types";
import { resToDisp } from "./utils";

function modBinOp(lhs: Res, op: BinOpr, rhs: Res): Res {
  if (op === "Semi") return rhs;

  if (lhs.k === "Number" && rhs.k === "Number") {
    return { k: "Number", n: applyNum(op, lhs.n, rhs.n) };
  }
  if (lhs.k === "List") {
    return { k: "List", items: lhs.items.map((item) => modBinOp(item, op, rhs)) };
  }
  if (rhs.k === "List") {
    return { k: "List", items: rhs.items.map((item) => modBinOp(lhs, op, item)) };
  }
  if (lhs.k === "Die" && rhs.k === "Die") {
    return { k: "Die", die: dieFromBinOp(lhs.die, op, rhs.die) };
  }
  if (lhs.k === "Die" && rhs.k === "Number") {
    return { k: "Die", die: dieFromBinOp(lhs.die, op, dieConst(rhs.n)) };
  }
  if (lhs.k === "Number" && rhs.k === "Die") {
    return { k: "Die", die: dieFromBinOp(dieConst(lhs.n), op, rhs.die) };
  }
  throw new RollError(`Cannot apply operation: ${lhs.k} ${op} ${rhs.k}`);
}

function applyNum(op: BinOpr, lhs: number, rhs: number): number {
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

function negUnOp(res: Res): Res {
  switch (res.k) {
    case "Number":
      return { k: "Number", n: -res.n };
    case "List":
      return { k: "List", items: res.items.map(negUnOp) };
    case "Sigil":
      throw new RollError(`Cannot negate a sigil: ${JSON.stringify(res.s)}`);
    case "Func":
    case "Builtin":
      throw new RollError("Cannot negate a function");
    case "Die":
      throw new RollError("Cannot negate a die");
    case "Unit":
      throw new RollError("Cannot negate the unit element");
  }
}

function evalExpr(expr: Expr, ctx: Context, cmd: Cmd): Res {
  switch (expr.k) {
    case "Atom":
      return evalAtom(expr.atom, ctx, cmd);
    case "UnOp":
      return negUnOp(evalExpr(expr.expr, ctx, cmd));
    case "BinOp": {
      const { lhs, op, rhs } = expr;
      if (op === "Dot") {
        if (rhs.k === "Atom" && rhs.atom.k === "FuncCall") {
          const args = [lhs, ...rhs.atom.args];
          return evalExpr({ k: "Atom", atom: { ...rhs.atom, args } }, ctx, cmd);
        }
        throw new RollError(`Right hand side of dot expression must be function call ${rhs.k}`);
      }
      return modBinOp(evalExpr(lhs, ctx, cmd), op, evalExpr(rhs, ctx, cmd));
    }
    case "Assign": {
      const value = evalExpr(expr.value, ctx, cmd);
      return evalExpr(expr.next, ctx.set(expr.ident, value), cmd);
    }
  }
}

function evalAtom(atom: Extract<Expr, { k: "Atom" }>["atom"], ctx: Context, cmd: Cmd): Res {
  switch (atom.k) {
    case "Number":
      return { k: "Number", n: atom.n };
    case "Die":
      return { k: "Die", die: atom.die };
    case "Sigil":
      return { k: "Sigil", s: atom.s };
    case "Ident": {
      const res = ctx.get(atom.s);
      if (res === undefined) {
        throw new RollError(`Can't find given variable in context ${JSON.stringify(atom.s)}`);
      }
      return res;
    }
    case "List":
      return { k: "List", items: atom.items.map((x) => evalExpr(x, ctx, cmd)) };
    case "Func": {
      const declIdents = [...atom.params];
      if (atom.name !== null) declIdents.push(atom.name);
      const captured = capturedIdents(atom.body, declIdents);
      return {
        k: "Func",
        name: atom.name,
        ctx: ctx.prune(captured),
        params: atom.params,
        body: atom.body,
      };
    }
    case "FuncCall": {
      const func = evalExpr(atom.callee, ctx, cmd);
      if (func.k === "Builtin") {
        const args = atom.args.map((x) => evalExpr(x, ctx, cmd));
        return ctx.dispatchBuiltin(func.name, args, cmd);
      }
      if (func.k === "Func") {
        const args = atom.args.map((x) => evalExpr(x, ctx, cmd));
        let callCtx = ctx.combine(func.ctx);
        if (func.name !== null) {
          callCtx = callCtx.set(func.name, {
            k: "Func",
            name: func.name,
            ctx: func.ctx,
            params: func.params,
            body: func.body,
          });
        }
        func.params.forEach((param, i) => {
          const arg = args[i];
          if (arg !== undefined) callCtx = callCtx.set(param, arg);
        });
        return evalExpr(func.body, callCtx, cmd);
      }
      throw new RollError(`Called variable isn't a function ${func.k}`);
    }
  }
}

/** `captured_idents` — the free identifiers of `expr` not bound by `declIdents`. */
function capturedIdents(expr: Expr, declIdents: string[]): string[] {
  switch (expr.k) {
    case "Atom": {
      const a = expr.atom;
      switch (a.k) {
        case "Number":
        case "Die":
        case "Sigil":
          return [];
        case "Ident":
          return declIdents.includes(a.s) ? [] : [a.s];
        case "List":
          return a.items.flatMap((e) => capturedIdents(e, declIdents));
        case "Func": {
          const decl = [...declIdents];
          if (a.name !== null) decl.push(a.name);
          decl.push(...a.params);
          return capturedIdents(a.body, decl);
        }
        case "FuncCall":
          return [
            ...a.args.flatMap((e) => capturedIdents(e, declIdents)),
            ...capturedIdents(a.callee, declIdents),
          ];
      }
      break;
    }
    case "UnOp":
      return capturedIdents(expr.expr, declIdents);
    case "BinOp":
      return [...capturedIdents(expr.lhs, declIdents), ...capturedIdents(expr.rhs, declIdents)];
    case "Assign":
      return [
        ...capturedIdents(expr.value, declIdents),
        ...capturedIdents(expr.next, [...declIdents, expr.ident]),
      ];
  }
}

/** The result of evaluating an input — faerrin's `Result<Cmd, String>`. */
export type InterpretResult = { ok: true; cmd: Cmd } | { ok: false; error: string };

/** `interpret` — parse + eval an input into a {@link Cmd}, or an error. */
export function interpret(input: string, init: [string, string][]): InterpretResult {
  const cmd = newCmd();
  const parsed = parse(input);
  if (parsed === null) return { ok: false, error: "Parsing error" };
  let res: Res;
  try {
    res = evalExpr(parsed, Context.create(init), cmd);
  } catch (e) {
    if (e instanceof RollError) return { ok: false, error: e.message };
    throw e;
  }
  const disp = resToDisp(res);
  if (disp !== null) cmd.display.push(disp);
  return { ok: true, cmd };
}
