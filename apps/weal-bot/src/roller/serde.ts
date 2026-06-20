/**
 * serde-compatible JSON codec for the roller AST/values. Matches Rust `serde_json`'s
 * default externally-tagged enum representation **byte-for-byte**, so:
 *   - faerrin's saved `funcs` payloads round-trip exactly (the parity-codec test), and
 *   - the `save` builtin emits payloads faerrin's bot could have written.
 *
 * Encoding rules (serde externally-tagged): unit variant → bare string (`"Add"`);
 * newtype variant → `{"Variant": value}`; tuple variant → `{"Variant": [..]}`;
 * struct → `{field: ..}`. Object key order follows insertion order (matches
 * `JSON.stringify`); captured-env keys are sorted for determinism.
 */

import { Context } from "./context";
import type { Atom, BinOpr, Die, Expr, Res, UnOpr } from "./types";

type Json = unknown;

function single(j: Json): [string, Json] {
  const o = j as Record<string, Json>;
  const key = Object.keys(o)[0];
  if (key === undefined) throw new SyntaxError("expected a tagged object");
  return [key, o[key]];
}

// --- encode --------------------------------------------------------------------------

export function dieToJsonValue(d: Die): Json {
  switch (d.k) {
    case "Constant":
      return { Constant: d.c };
    case "Base":
      return { Base: [d.count, d.base] };
    case "Seq":
      return { Seq: [d.count, d.values] };
    case "BinOp":
      return { BinOp: [dieToJsonValue(d.lhs), d.opr, dieToJsonValue(d.rhs)] };
    case "TakeHighest":
      return { TakeHighest: [d.collect, dieToJsonValue(d.die)] };
    case "TakeLowest":
      return { TakeLowest: [d.collect, dieToJsonValue(d.die)] };
  }
}

export function atomToJsonValue(a: Atom): Json {
  switch (a.k) {
    case "Number":
      return { Number: a.n };
    case "Ident":
      return { Ident: a.s };
    case "Sigil":
      return { Sigil: a.s };
    case "Die":
      return { Die: dieToJsonValue(a.die) };
    case "List":
      return { List: a.items.map(exprToJsonValue) };
    case "FuncCall":
      return { FuncCall: [exprToJsonValue(a.callee), a.args.map(exprToJsonValue)] };
    case "Func":
      return { Func: [a.name, a.params, exprToJsonValue(a.body)] };
  }
}

export function exprToJsonValue(e: Expr): Json {
  switch (e.k) {
    case "Atom":
      return { Atom: atomToJsonValue(e.atom) };
    case "UnOp":
      return { UnOp: [e.op, exprToJsonValue(e.expr)] };
    case "BinOp":
      return { BinOp: [exprToJsonValue(e.lhs), e.op, exprToJsonValue(e.rhs)] };
    case "Assign":
      return { Assign: [e.ident, exprToJsonValue(e.value), exprToJsonValue(e.next)] };
  }
}

function resToJsonValue(r: Res): Json {
  switch (r.k) {
    case "Unit":
      return "Unit";
    case "Number":
      return { Number: r.n };
    case "Sigil":
      return { Sigil: r.s };
    case "List":
      return { List: r.items.map(resToJsonValue) };
    case "Die":
      return { Die: dieToJsonValue(r.die) };
    case "Builtin":
      return { Builtin: r.name };
    case "Func":
      return {
        Func: [r.name, { env: ctxEnvToJsonValue(r.ctx) }, r.params, exprToJsonValue(r.body)],
      };
  }
}

function ctxEnvToJsonValue(ctx: Context): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, v] of ctx.entries().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    out[k] = resToJsonValue(v);
  }
  return out;
}

export const exprToJson = (e: Expr): string => JSON.stringify(exprToJsonValue(e));
export const resToJson = (r: Res): string => JSON.stringify(resToJsonValue(r));

// --- decode --------------------------------------------------------------------------

export function dieFromJsonValue(j: Json): Die {
  const [key, val] = single(j);
  const arr = val as Json[];
  switch (key) {
    case "Constant":
      return { k: "Constant", c: val as number };
    case "Base":
      return { k: "Base", count: arr[0] as number, base: arr[1] as number };
    case "Seq":
      return { k: "Seq", count: arr[0] as number, values: arr[1] as number[] };
    case "BinOp":
      return {
        k: "BinOp",
        lhs: dieFromJsonValue(arr[0]),
        opr: arr[1] as BinOpr,
        rhs: dieFromJsonValue(arr[2]),
      };
    case "TakeHighest":
      return { k: "TakeHighest", collect: arr[0] as number, die: dieFromJsonValue(arr[1]) };
    case "TakeLowest":
      return { k: "TakeLowest", collect: arr[0] as number, die: dieFromJsonValue(arr[1]) };
    default:
      throw new SyntaxError(`unknown Die variant ${key}`);
  }
}

function atomFromJsonValue(j: Json): Atom {
  const [key, val] = single(j);
  const arr = val as Json[];
  switch (key) {
    case "Number":
      return { k: "Number", n: val as number };
    case "Ident":
      return { k: "Ident", s: val as string };
    case "Sigil":
      return { k: "Sigil", s: val as string };
    case "Die":
      return { k: "Die", die: dieFromJsonValue(val) };
    case "List":
      return { k: "List", items: (val as Json[]).map(exprFromJsonValue) };
    case "FuncCall":
      return {
        k: "FuncCall",
        callee: exprFromJsonValue(arr[0]),
        args: (arr[1] as Json[]).map(exprFromJsonValue),
      };
    case "Func":
      return {
        k: "Func",
        name: arr[0] as string | null,
        params: arr[1] as string[],
        body: exprFromJsonValue(arr[2]),
      };
    default:
      throw new SyntaxError(`unknown Atom variant ${key}`);
  }
}

export function exprFromJsonValue(j: Json): Expr {
  const [key, val] = single(j);
  const arr = val as Json[];
  switch (key) {
    case "Atom":
      return { k: "Atom", atom: atomFromJsonValue(val) };
    case "UnOp":
      return { k: "UnOp", op: arr[0] as UnOpr, expr: exprFromJsonValue(arr[1]) };
    case "BinOp":
      return {
        k: "BinOp",
        lhs: exprFromJsonValue(arr[0]),
        op: arr[1] as BinOpr,
        rhs: exprFromJsonValue(arr[2]),
      };
    case "Assign":
      return {
        k: "Assign",
        ident: arr[0] as string,
        value: exprFromJsonValue(arr[1]),
        next: exprFromJsonValue(arr[2]),
      };
    default:
      throw new SyntaxError(`unknown Expr variant ${key}`);
  }
}

function resFromJsonValue(j: Json): Res {
  if (j === "Unit") return { k: "Unit" };
  const [key, val] = single(j);
  const arr = val as Json[];
  switch (key) {
    case "Number":
      return { k: "Number", n: val as number };
    case "Sigil":
      return { k: "Sigil", s: val as string };
    case "List":
      return { k: "List", items: (val as Json[]).map(resFromJsonValue) };
    case "Die":
      return { k: "Die", die: dieFromJsonValue(val) };
    case "Builtin":
      return { k: "Builtin", name: val as string };
    case "Func": {
      const envObj = (arr[1] as { env: Record<string, Json> }).env;
      const entries: [string, Res][] = Object.entries(envObj).map(([k, v]) => [
        k,
        resFromJsonValue(v),
      ]);
      return {
        k: "Func",
        name: arr[0] as string | null,
        ctx: Context.fromEntries(entries),
        params: arr[2] as string[],
        body: exprFromJsonValue(arr[3]),
      };
    }
    default:
      throw new SyntaxError(`unknown Res variant ${key}`);
  }
}

export const resFromJson = (s: string): Res => resFromJsonValue(JSON.parse(s));
