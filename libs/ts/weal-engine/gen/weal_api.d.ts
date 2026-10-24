// Generated from libs/rust/weal-engine/src/api.rs by ts-rs; do not edit.
// Regenerate with `just weal-engine-build`.

export type WealSpan = { start: number, end: number, };

export type WealGoodness = "fumble" | "bad" | "okay" | "good" | "crit";

export type WealValueKind = "num" | "dec" | "float" | "str" | "atom" | "unit" | "text";

export type WealValue = { t: WealValueKind, v: string, };

export type WealDisplay = { "kind": "die", renderText: string, headline: string, value: WealValue, 
/**
 * Null for a one-face support.
 */
goodness: WealGoodness | null, 
/**
 * Every sampled NdM face (kept, dropped, and chain draws) as `[sides, face]`.
 */
standardDice: Array<[number, number]>, } | { "kind": "value", renderText: string, headline: string, };

export type WealPlot = { pngBase64: string, title: string, 
/**
 * Null for non-numeric (atom/str) faces.
 */
mean: string | null, std: string | null, };

export type WealSave = { name: string, source: string, };

export type WealOk = { ok: true, displays: Array<WealDisplay>, plots: Array<WealPlot>, saves: Array<WealSave>, 
/**
 * Reserved; always empty.
 */
warnings: Array<string>, };

export type WealStage = "parse" | "type" | "eval" | "fuel" | "prelude" | "internal";

export type WealErr = { ok: false, stage: WealStage, message: string, span: WealSpan | null, 
/**
 * The failing save's name, for `stage:"prelude"`.
 */
preludeName: string | null, };

export type WealResult = WealOk | WealErr;
