/**
 * Scannerless recursive-descent parser — TS port of `roller/src/parser.rs` (faerrin's
 * `nom` combinators), feeding the Pratt climber ([[pratt.ts]]). The structure mirrors
 * the Rust functions 1:1 (`raw_number`, `single_die`/`multi_die`, `v_ident`, `sigil`,
 * `list`, `func_call`, `anon_func`, `atom`, `assign`, `func`, `expr_v`, `expr`) so the
 * parity harness can compare ASTs against the Rust impl.
 *
 * Note: faerrin parses only `dN` / `NdN` dice literals — `d{1,2,3}` seq dice are a
 * *repr*, constructed via the `d` builtin on a list, never input syntax.
 */

import { dieFromBase } from "./die";
import { type Pratt, parsePratt } from "./pratt";
import type { Atom, BinOpr, Expr, UnOpr } from "./types";

/** Backtracking sentinel — thrown on a failed alternative; callers restore `pos`. */
const FAIL = Symbol("parse-fail");

class Cursor {
  pos = 0;
  constructor(readonly s: string) {}

  skipWs(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos] as string)) this.pos++;
  }

  /** `delimited(multispace0, f, multispace0)`. */
  ws<T>(f: () => T): T {
    this.skipWs();
    const v = f();
    this.skipWs();
    return v;
  }

  char(c: string): string {
    if (this.s[this.pos] === c) {
      this.pos++;
      return c;
    }
    throw FAIL;
  }

  charIn(set: string): string {
    const ch = this.s[this.pos];
    if (ch !== undefined && set.includes(ch)) {
      this.pos++;
      return ch;
    }
    throw FAIL;
  }

  tag(t: string): string {
    if (this.s.startsWith(t, this.pos)) {
      this.pos += t.length;
      return t;
    }
    throw FAIL;
  }

  alt<T>(...fs: (() => T)[]): T {
    for (const f of fs) {
      const p = this.pos;
      try {
        return f();
      } catch (e) {
        if (e !== FAIL) throw e;
        this.pos = p;
      }
    }
    throw FAIL;
  }

  optional<T>(f: () => T): T | null {
    const p = this.pos;
    try {
      return f();
    } catch (e) {
      if (e !== FAIL) throw e;
      this.pos = p;
      return null;
    }
  }

  many0<T>(f: () => T): T[] {
    const out: T[] = [];
    for (;;) {
      const p = this.pos;
      try {
        out.push(f());
        if (this.pos === p) break; // guard against zero-width loops
      } catch (e) {
        if (e !== FAIL) throw e;
        this.pos = p;
        break;
      }
    }
    return out;
  }

  many1<T>(f: () => T): T[] {
    const out = this.many0(f);
    if (out.length === 0) throw FAIL;
    return out;
  }

  /** `separated_list0(',', inner)` then an optional trailing comma, delimited by `l`/`r`, ws-wrapped. */
  commaList<T>(l: string, inner: () => T, r: string): T[] {
    return this.ws(() => {
      this.char(l);
      const items: T[] = [];
      const first = this.optional(inner);
      if (first !== null) {
        items.push(first);
        for (;;) {
          const got = this.optional(() => {
            this.char(",");
            return inner();
          });
          if (got === null) break;
          items.push(got);
        }
      }
      this.optional(() => this.char(",")); // trailing comma
      this.char(r);
      return items;
    });
  }
}

// --- lexical atoms ------------------------------------------------------------------

function rawNumber(c: Cursor): number {
  const digits = c.many1(() => {
    const d = c.charIn("0123456789");
    c.many0(() => c.char("_"));
    return d;
  });
  return Number.parseInt(digits.join(""), 10);
}

function number(c: Cursor): Atom {
  return c.ws(() => ({ k: "Number", n: rawNumber(c) }));
}

function singleDie(c: Cursor): Atom {
  c.alt(
    () => c.char("d"),
    () => c.char("D"),
  );
  return { k: "Die", die: dieFromBase(1, rawNumber(c)) };
}

function multiDie(c: Cursor): Atom {
  const count = rawNumber(c);
  c.alt(
    () => c.char("d"),
    () => c.char("D"),
  );
  const base = rawNumber(c);
  if (count < 1) throw FAIL;
  return { k: "Die", die: dieFromBase(count, base) };
}

function die(c: Cursor): Atom {
  return c.ws(() =>
    c.alt(
      () => singleDie(c),
      () => multiDie(c),
    ),
  );
}

/** `lower_alpha1` + `(alphanumeric1 | '-')*`, returning the recognized span (no ws). */
function identSpan(c: Cursor): string {
  const start = c.pos;
  // lower_alpha1: one or more lowercase letters
  if (!/[a-z]/.test(c.s[c.pos] ?? "")) throw FAIL;
  while (/[a-z]/.test(c.s[c.pos] ?? "")) c.pos++;
  // (alphanumeric1 | '-')* — alnum runs or single dashes
  for (;;) {
    if (/[A-Za-z0-9]/.test(c.s[c.pos] ?? "")) {
      while (/[A-Za-z0-9]/.test(c.s[c.pos] ?? "")) c.pos++;
    } else if (c.s[c.pos] === "-") {
      c.pos++;
    } else break;
  }
  return c.s.slice(start, c.pos);
}

function vIdent(c: Cursor): string {
  return c.ws(() => {
    const id = identSpan(c);
    if (id === "let" || id === "in") throw FAIL;
    return id;
  });
}

function ident(c: Cursor): Atom {
  return { k: "Ident", s: vIdent(c) };
}

function sigil(c: Cursor): Atom {
  return c.ws(() => {
    c.char(":");
    return { k: "Sigil", s: identSpan(c) };
  });
}

function list(c: Cursor): Atom {
  return { k: "List", items: c.commaList("[", () => expr(c), "]") };
}

function funcCall(c: Cursor): Atom {
  return c.ws(() => {
    const callee: Expr = c.alt<Expr>(
      () =>
        c.ws(() => {
          c.char("(");
          const e = expr(c);
          c.char(")");
          return e;
        }),
      () => ({ k: "Atom", atom: ident(c) }),
    );
    const args = c.commaList("(", () => expr(c), ")");
    return { k: "FuncCall", callee, args };
  });
}

function anonFunc(c: Cursor): Atom {
  const params = c.commaList("|", () => vIdent(c), "|");
  const body = c.ws(() => expr(c));
  return { k: "Func", name: null, params, body };
}

function atom(c: Cursor): Atom {
  return c.alt<Atom>(
    () => anonFunc(c),
    () => funcCall(c),
    () => list(c),
    () => die(c),
    () => sigil(c),
    () => number(c),
    () => ident(c),
  );
}

// --- operators ----------------------------------------------------------------------

function tagged<T>(c: Cursor, t: string, value: T): T {
  c.tag(t);
  return value;
}

function binOpr(c: Cursor): BinOpr {
  return c.ws(() =>
    c.alt<BinOpr>(
      () => tagged(c, "+", "Add"),
      () => tagged(c, "-", "Sub"),
      () => tagged(c, "*", "Mul"),
      () => tagged(c, "/", "Div"),
      () => tagged(c, ";", "Semi"),
      () => tagged(c, ".", "Dot"),
    ),
  );
}

function unOpr(c: Cursor): UnOpr {
  return c.ws(() => tagged(c, "-", "Neg"));
}

// --- compound forms -----------------------------------------------------------------

function assign(c: Cursor): Expr {
  c.ws(() => c.tag("let"));
  const id = vIdent(c);
  c.ws(() => c.char("="));
  const value = c.ws(() => expr(c));
  c.ws(() => c.tag("in"));
  const next = c.ws(() => expr(c));
  return { k: "Assign", ident: id, value, next };
}

function func(c: Cursor): Expr {
  c.ws(() => c.tag("let"));
  const id = vIdent(c);
  const params = c.commaList("(", () => vIdent(c), ")");
  c.ws(() => c.char("="));
  const value = c.ws(() => expr(c));
  c.ws(() => c.tag("in"));
  const next = c.ws(() => expr(c));
  return {
    k: "Assign",
    ident: id,
    value: { k: "Atom", atom: { k: "Func", name: id, params, body: value } },
    next,
  };
}

function exprV(c: Cursor): Pratt[] {
  const out: Pratt[] = [];

  const prefix = c.optional(() => unOpr(c));
  if (prefix !== null) out.push({ k: "Prefix", op: prefix });

  // val = alt(group, atom); group = alt(func, assign, collection), ws-wrapped.
  const val = c.alt<Pratt>(
    () => ({
      k: "Group",
      expr: c.ws(() =>
        c.alt<Expr>(
          () => func(c),
          () => assign(c),
          () => {
            c.char("(");
            const e = expr(c);
            c.char(")");
            return e;
          },
        ),
      ),
    }),
    () => ({ k: "Atom", atom: c.ws(() => atom(c)) }),
  );
  out.push(val);

  const infix = c.optional(() => binOpr(c));
  if (infix !== null) out.push({ k: "Infix", op: infix });

  const rest = c.optional(() => c.ws(() => exprV(c)));
  if (rest !== null) out.push(...rest);

  return out;
}

function expr(c: Cursor): Expr {
  const tokens = c.ws(() => exprV(c));
  return parsePratt(tokens);
}

/** `parse` — `Some(expr)` only when the whole input is consumed; `null` otherwise. */
export function parse(input: string): Expr | null {
  const c = new Cursor(input);
  try {
    const e = expr(c);
    c.skipWs();
    return c.pos === input.length ? e : null;
  } catch (err) {
    if (err === FAIL) return null;
    if (err instanceof SyntaxError) return null; // pratt leftover/structure failure
    throw err;
  }
}
