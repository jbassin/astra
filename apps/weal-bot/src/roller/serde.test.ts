/**
 * serde codec parity (the strongest gate) — round-trips the **real Rust-produced**
 * `funcs` payloads from faerrin's live `mouth.db` through `resFromJson → resToJson`.
 * Byte-exact equality proves the AST/value codec matches Rust `serde_json` (and so the
 * TS bot can read every macro the Rust bot ever saved). These are committed fixtures,
 * not a DB read — the test stays hermetic (spec W12).
 */

import { describe, expect, test } from "bun:test";
import { resFromJson, resToJson } from "./serde";

// Captured verbatim from `select name, payload from funcs` on the live mouth.db.
const FUNCS_PAYLOADS: Record<string, string> = {
  adv: '{"Func":["adv",{"env":{"take-highest":{"Builtin":"take-highest"}}},[],{"Atom":{"FuncCall":[{"Atom":{"Ident":"take-highest"}},[{"Atom":{"Number":1}},{"Atom":{"Die":{"Base":[2,20]}}}]]}}]}',
  dis: '{"Func":["dis",{"env":{"take-lowest":{"Builtin":"take-lowest"}}},[],{"Atom":{"FuncCall":[{"Atom":{"Ident":"take-lowest"}},[{"Atom":{"Number":1}},{"Atom":{"Die":{"Base":[2,20]}}}]]}}]}',
  bless:
    '{"Func":["waow",{"env":{}},["x"],{"BinOp":[{"Atom":{"Ident":"x"}},"Add",{"Atom":{"Die":{"Base":[1,4]}}}]}]}',
  "healing-word":
    '{"Func":["healing-word",{"env":{"max":{"Builtin":"max"}}},["lvl"],{"Assign":["base",{"BinOp":[{"Atom":{"Die":{"Base":[2,4]}}},"Add",{"Atom":{"Number":8}}]},{"Assign":["upcast",{"BinOp":[{"Atom":{"FuncCall":[{"Atom":{"Ident":"max"}},[{"Atom":{"Number":0}},{"BinOp":[{"UnOp":["Neg",{"Atom":{"Number":1}}]},"Mul",{"BinOp":[{"Atom":{"Number":2}},"Sub",{"Atom":{"Ident":"lvl"}}]}]}]]}},"Mul",{"BinOp":[{"Atom":{"Die":{"Base":[2,4]}}},"Add",{"Atom":{"Number":1}}]}]},{"BinOp":[{"Atom":{"Ident":"base"}},"Add",{"Atom":{"Ident":"upcast"}}]}]}]}]}',
  "d-c":
    '{"Func":[null,{"env":{}},[],{"BinOp":[{"Atom":{"Die":{"Base":[1,10]}}},"Add",{"Atom":{"Number":1}}]}]}',
  "d-f":
    '{"Func":[null,{"env":{}},[],{"BinOp":[{"Atom":{"Die":{"Base":[1,10]}}},"Add",{"Atom":{"Number":3}}]}]}',
  "d-s":
    '{"Func":[null,{"env":{}},[],{"BinOp":[{"Atom":{"Die":{"Base":[1,10]}}},"Add",{"Atom":{"Number":0}}]}]}',
  "d-q":
    '{"Func":[null,{"env":{}},[],{"BinOp":[{"Atom":{"Die":{"Base":[1,10]}}},"Add",{"Atom":{"Number":1}}]}]}',
};

describe("serde: round-trip real funcs payloads (byte-exact vs Rust serde_json)", () => {
  for (const [name, payload] of Object.entries(FUNCS_PAYLOADS)) {
    test(name, () => {
      expect(resToJson(resFromJson(payload))).toBe(payload);
    });
  }
});
