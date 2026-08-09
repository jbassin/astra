// @astra/weal-engine — the typed ESM wrapper over the committed
// wasm-bindgen artifact (spec 0032 D32-11/D32-13).
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

const gen = require("../gen/weal_engine.js") as GenModule;

/** The D32-11 error stages. */
export type WealStage = "parse" | "type" | "eval" | "fuel" | "prelude";

/** The D32-11 goodness bands (null = one-face support / non-die display). */
export type WealGoodness = "crit" | "good" | "okay" | "bad" | "fumble";

export type WealSpan = { start: number; end: number };

/** The sampled top-level value of a die display. */
export type WealValue = {
  t: "num" | "dec" | "float" | "str" | "atom" | "unit" | "text";
  v: string;
};

export type WealDieDisplay = {
  kind: "die";
  renderText: string;
  headline: string;
  value: WealValue;
  goodness: WealGoodness | null;
  /** EVERY sampled NdM face — kept, dropped, and chain draws: [sides, face]. */
  standardDice: [number, number][];
};

export type WealValueDisplay = {
  kind: "value";
  renderText: string;
  headline: string;
};

export type WealDisplay = WealDieDisplay | WealValueDisplay;

export type WealPlot = {
  pngBase64: string;
  title: string;
  /** Null for non-numeric (atom/str) faces. */
  mean: string | null;
  std: string | null;
};

export type WealSave = { name: string; source: string };

export type WealOk = {
  ok: true;
  displays: WealDisplay[];
  plots: WealPlot[];
  saves: WealSave[];
  warnings: string[];
};

export type WealErr = {
  ok: false;
  stage: WealStage;
  message: string;
  span: WealSpan | null;
  preludeName: string | null;
};

export type WealResult = WealOk | WealErr;

/**
 * Run (or `mode:"check"`-validate) one weal v2 source against the saves
 * list, with host-supplied entropy.
 *
 * @param source  the message text
 * @param saves   `[name, source]` pairs in id order (D32-17 boot order)
 * @param seed    32 bytes of host entropy (fixed in tests → deterministic)
 * @param budget  interpreter-step budget; 0 = the engine default (D32-12)
 * @param mode    `"run"` = full pipeline; `"check"` = parse+type only
 *
 * A wasm trap (post-`stage:"fuel"` residue — e.g. a stack overflow the
 * in-engine depth cap could not intercept) is caught here and synthesized
 * into `{ok:false, stage:"fuel"}` per the D32-11 wrapper pin.
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
    return {
      ok: false,
      stage: "fuel",
      message: `engine trap: ${message}`,
      span: null,
      preludeName: null,
    };
  }
}
