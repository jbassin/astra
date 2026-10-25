// @astra/weal-engine — the typed ESM wrapper over the committed
// wasm-bindgen artifact.
//
// The generated glue in ../gen is CommonJS (gen/package.json pins
// {"type":"commonjs"}); `module.createRequire` loads it from ESM without
// Node-ESM parsing or vitest's transform touching it. `gen/` is a COMMITTED
// build product — regenerate with `just weal-engine-build`, never by hand.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type GenModule = {
  evaluate(
    source: string,
    savesJson: string,
    seed: Uint8Array,
    budget: number,
    mode: string,
  ): string;
};

// By package name (the `./gen/*` export), not `../gen/`: bundled into an app's
// dist-server/, this module no longer sits beside gen/, but the app's node_modules link
// still resolves the package.
const GLUE_SPECIFIER = "@astra/weal-engine/gen/weal_engine.js";

let gen = require(GLUE_SPECIFIER) as GenModule;

/**
 * Drop and re-require the CommonJS glue, re-instantiating the wasm module from
 * the committed bytes (the glue reads + instantiates at require time).
 * {@link evaluate} calls this itself after a caught wasm trap — post-trap
 * engine state is undefined — so callers never need to; it also
 * serves as the memory high-water release.
 */
export function reinstantiate(): void {
  delete require.cache[require.resolve(GLUE_SPECIFIER)];
  gen = require(GLUE_SPECIFIER) as GenModule;
}

// The JSON contract's types are generated from the Rust response shapes
// (`libs/rust/weal-engine/src/api.rs`, via ts-rs) into ../gen/weal_api.d.ts by
// `just weal-engine-build`; the crate's `ts_bindings_are_current` test fails
// when that file lags the Rust. The error stages: `parse`/`type`/`eval`/
// `fuel`/`prelude` are the player's (their source, their saves, their budget);
// `internal` is the engine's own fault — an invariant violation the engine
// reports, or a wasm trap this wrapper caught (message prefix `engine trap:`).
import type { WealDisplay, WealResult } from "../gen/weal_api";

export type {
  WealDisplay,
  WealErr,
  WealGoodness,
  WealOk,
  WealPlot,
  WealResult,
  WealSave,
  WealSpan,
  WealStage,
  WealValue,
  WealValueKind,
} from "../gen/weal_api";

/**
 * One engine builtin, from the crate's builtin registry
 * (`libs/rust/weal-engine/src/prelude.rs`), generated into
 * ../gen/weal_builtins.json by `just weal-engine-build`.
 */
export interface WealBuiltin {
  name: string;
  /** Curried arity (`roll` is variadic when called directly). */
  arity: number;
  /** One per overload; `a` and `b` stand for any type. */
  signatures: string[];
  /** The player guide's one-line description (markdown). */
  doc: string;
}

/** Every engine builtin, in registry order. */
export const BUILTINS: readonly WealBuiltin[] =
  require("@astra/weal-engine/gen/weal_builtins.json") as WealBuiltin[];

const BUILTIN_NAMES: ReadonlySet<string> = new Set(BUILTINS.map((b) => b.name));

/**
 * Whether a builtin owns `name`. Saves share the builtins' namespace, so a
 * save under such a name shadows the builtin for every later roll.
 */
export function isBuiltin(name: string): boolean {
  return BUILTIN_NAMES.has(name);
}

/** A rolled-die display. */
export type WealDieDisplay = Extract<WealDisplay, { kind: "die" }>;

/** A plain-value display. */
export type WealValueDisplay = Extract<WealDisplay, { kind: "value" }>;

/**
 * Run (or `mode:"check"`-validate) one weal v2 source against the saves
 * list, with host-supplied entropy.
 *
 * @param source  the message text
 * @param saves   `[name, source]` pairs in id order (the boot order)
 * @param seed    32 bytes of host entropy (fixed in tests → deterministic)
 * @param budget  interpreter-step budget; 0 = the engine default
 * @param mode    `"run"` = full pipeline; `"check"` = parse+type only
 *
 * A wasm trap (a Rust panic, or a stack overflow the in-engine
 * depth cap could not intercept) is contained here: the wrapper drops the
 * possibly poisoned instance, re-instantiates the wasm, and returns
 * `{ok:false, stage:"internal"}` with a message starting `engine trap:`. The
 * next call runs on the fresh instance. It throws only if re-instantiation
 * itself fails (the committed glue cannot load).
 */
export function evaluate(
  source: string,
  saves: [string, string][],
  seed: Uint8Array,
  budget: number,
  mode: "run" | "check",
): WealResult {
  try {
    return JSON.parse(
      gen.evaluate(source, JSON.stringify(saves), seed, budget, mode),
    ) as WealResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reinstantiate();
    return {
      ok: false,
      stage: "internal",
      message: `engine trap: ${message}`,
      span: null,
      preludeName: null,
    };
  }
}
