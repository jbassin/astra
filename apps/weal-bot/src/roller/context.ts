/**
 * Evaluation context + builtins + the `Cmd` accumulator — TS port of `ast.rs`'s
 * `Context`/`Cmd` and the builtin dispatch. `Context` is immutable (every mutator
 * returns a fresh instance), mirroring faerrin's by-value `Context`.
 */

import {
  dieFromBase,
  dieFromSequence,
  dieMax,
  dieMin,
  dieTakeHighest,
  dieTakeLowest,
  RollError,
} from "./die";
import { resFromJson, resToJson } from "./serde";
import type { Die, Display, Res } from "./types";
import { resToDisp } from "./utils";

/** The side-channel an evaluation fills: things to roll/plot/save/lazy-roll. */
export interface Cmd {
  display: Display[];
  plot: Die[];
  lazy: [string, Die][];
  save: [string, string][];
}

export function newCmd(): Cmd {
  return { display: [], plot: [], lazy: [], save: [] };
}

const BUILTINS = [
  "d",
  "id",
  "take-highest",
  "take-lowest",
  "roll",
  "plot",
  "lazy-roll",
  "save",
  "max",
  "min",
] as const;

export class Context {
  private readonly env: Map<string, Res>;

  // Not a TS parameter property — Node's `--experimental-strip-types` (R3, 0022 S5)
  // only erases types, it doesn't emit code, so a parameter property (which needs a
  // real `this.x = x` assignment generated) throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`
  // when Node runs this file directly. See [[secrets.ts]]'s SecretRef (S4).
  private constructor(env: Map<string, Res>) {
    this.env = env;
  }

  /** `Context::new` — seed from saved `funcs` (name → serde-JSON payload) + builtins. */
  static create(init: [string, string][]): Context {
    const env = new Map<string, Res>();
    for (const [name, payload] of init) env.set(name, resFromJson(payload));
    for (const b of BUILTINS) env.set(b, { k: "Builtin", name: b });
    return new Context(env);
  }

  prune(idents: string[]): Context {
    const env = new Map<string, Res>();
    for (const [k, v] of this.env) if (idents.includes(k)) env.set(k, v);
    return new Context(env);
  }

  combine(rhs: Context): Context {
    const env = new Map(this.env);
    for (const [k, v] of rhs.env) env.set(k, v);
    return new Context(env);
  }

  get(key: string): Res | undefined {
    return this.env.get(key);
  }

  set(key: string, value: Res): Context {
    const env = new Map(this.env);
    env.set(key, value);
    return new Context(env);
  }

  /** The captured env entries (used by the serde codec to serialize a closure). */
  entries(): [string, Res][] {
    return [...this.env];
  }

  /** Rebuild a context from decoded env entries (used by the serde codec). */
  static fromEntries(entries: [string, Res][]): Context {
    return new Context(new Map(entries));
  }

  dispatchBuiltin(func: string, args: Res[], cmd: Cmd): Res {
    switch (func) {
      case "id":
        return this.id(args);
      case "d":
        return this.d(args);
      case "take-highest":
        return this.takeHighest(args);
      case "take-lowest":
        return this.takeLowest(args);
      case "roll":
        return this.roll(args, cmd);
      case "plot":
        return this.plot(args, cmd);
      case "lazy-roll":
        return this.lazyRoll(args, cmd);
      case "save":
        return this.save(args, cmd);
      case "max":
        return this.max(args);
      case "min":
        return this.min(args);
      default:
        throw new RollError("Builtin doesn't exist!");
    }
  }

  private id(args: Res[]): Res {
    if (args.length > 0) {
      return args[0]!;
    }
    throw new RollError("Expected at least 1 argument");
  }

  private d(args: Res[]): Res {
    if (args.length === 1) {
      const a = args[0]!;
      if (a.k === "Number") return { k: "Die", die: dieFromBase(1, a.n) };
      if (a.k === "List") return { k: "Die", die: dieFromSequence(1, numList(a.items)) };
      throw new RollError("Can only make die from number or list of numbers");
    }
    if (args.length === 2) {
      const count = args[0]!;
      const second = args[1]!;
      if (count.k !== "Number") {
        throw new RollError("Can only make die from number or list of numbers");
      }
      if (count.n < 1) throw new RollError("Cannot have negative count");
      if (second.k === "Number") return { k: "Die", die: dieFromBase(count.n, second.n) };
      if (second.k === "List") {
        return { k: "Die", die: dieFromSequence(count.n, numList(second.items)) };
      }
      throw new RollError("Can only make die from number or list of numbers");
    }
    throw new RollError("Expected 1 or 2 arguments");
  }

  private roll(args: Res[], cmd: Cmd): Res {
    for (const a of args) {
      const d = resToDisp(a);
      if (d !== null) cmd.display.push(d);
    }
    return { k: "Unit" };
  }

  private plot(args: Res[], cmd: Cmd): Res {
    for (const a of args) {
      const d = resToDisp(a);
      if (d !== null && d.k === "Die") cmd.plot.push(d.die);
    }
    return { k: "Unit" };
  }

  private save(args: Res[], cmd: Cmd): Res {
    if (args.length !== 2) throw new RollError("Expected exactly 2 arguments!");
    const sigil = args[0]!;
    if (sigil.k !== "Sigil") throw new RollError("First argument must be a sigil!");
    const payload = args[1]!;
    cmd.save.push([sigil.s, resToJson(payload)]);
    return { k: "Unit" };
  }

  private takeHighest(args: Res[]): Res {
    return this.take(args, dieTakeHighest);
  }

  private takeLowest(args: Res[]): Res {
    return this.take(args, dieTakeLowest);
  }

  private take(args: Res[], build: (collect: number, die: Die) => Die): Res {
    if (args.length !== 2) throw new RollError("Expected exactly 2 arguments");
    const collect = args[0]!;
    if (collect.k !== "Number") throw new RollError("First argument must be a number");
    if (collect.n < 1) throw new RollError("Collection count must be greater than 0");
    const die = args[1]!;
    if (die.k !== "Die") throw new RollError("Second argument must be a die");
    return { k: "Die", die: build(collect.n, die.die) };
  }

  private max(args: Res[]): Res {
    if (args.length === 0) throw new RollError("Expected multiple arguments");
    const nums = args.filter((x): x is Extract<Res, { k: "Number" }> => x.k === "Number");
    if (nums.length === 0) throw new RollError("max() must be called on numbers");
    return { k: "Number", n: Math.max(...nums.map((x) => x.n)) };
  }

  private min(args: Res[]): Res {
    if (args.length === 0) throw new RollError("Expected multiple arguments");
    const nums = args.filter((x): x is Extract<Res, { k: "Number" }> => x.k === "Number");
    // faerrin's error text says "max()" here too — kept verbatim.
    if (nums.length === 0) throw new RollError("max() must be called on numbers");
    return { k: "Number", n: Math.min(...nums.map((x) => x.n)) };
  }

  private lazyRoll(args: Res[], cmd: Cmd): Res {
    for (const x of args) {
      if (x.k !== "List" || x.items.length <= 1) continue;
      const [name, die] = x.items;
      if (name?.k === "Sigil" && die?.k === "Die") cmd.lazy.push([name.s, die.die]);
    }
    return { k: "Unit" };
  }
}

// `dieMax`/`dieMin` are re-exported for the parity harness's property tests.
export { dieMax, dieMin };

function numList(items: Res[]): number[] {
  return items.map((x) => {
    if (x.k !== "Number") throw new RollError("Can only use list of numbers!");
    return x.n;
  });
}
