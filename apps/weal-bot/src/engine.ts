/**
 * The engine seam (spec 0032 D32-14/D32-17) — everything between the bot and
 * `@astra/weal-engine`:
 *
 * - {@link runEngine}: one evaluate call with **panic containment** — a thrown
 *   error (wasm trap the wrapper's own catch didn't synthesize, glue corruption,
 *   …) becomes a `fault` result, a WARN log (NEVER an ERROR — the Class-A SigNoz
 *   rule pages Discord on ERROR), a `weal.v2.errors{stage:"panic"}` count, and a
 *   wasm **re-instantiation** (post-panic engine state is undefined).
 * - {@link passesNoiseGate}: D32-14's error-visibility gate, so ordinary chat
 *   can never trigger a visible error reply.
 * - {@link loadValidatedFuncs}: the D32-17 boot algorithm — `funcs_v2` rows in
 *   id order, each `mode:"check"`-validated against the prior valid rows; a
 *   failing row is skipped with a WARN naming it (never pages, never crashes).
 */

import { getLogger, lazyCounter } from "@astra/observe";
import {
  evaluate,
  reinstantiate,
  type WealErr,
  type WealOk,
  type WealResult,
} from "@astra/weal-engine";

import type { FuncV2 } from "./db";

const log = getLogger("astra.weal-bot");
const errorsCounter = lazyCounter("astra.weal-bot", "weal.v2.errors", {
  description: "weal v2 engine errors, by stage (incl. panic)",
});

/** Injectable engine internals — tests swap in a throwing evaluate (D32-14). */
export interface EngineHooks {
  evaluateFn?: typeof evaluate;
  reinstantiateFn?: () => void;
}

/** A run's outcome: ok / an engine-reported error / a contained panic. */
export type EngineOutcome =
  | { kind: "ok"; value: WealOk }
  | { kind: "error"; error: WealErr }
  | { kind: "fault" };

/**
 * Evaluate one source against the saves list, containing any throw (panic).
 * Never throws.
 */
export function runEngine(
  source: string,
  saves: [string, string][],
  seed: Uint8Array,
  hooks?: EngineHooks,
): EngineOutcome {
  const evaluateFn = hooks?.evaluateFn ?? evaluate;
  let result: WealResult;
  try {
    result = evaluateFn(source, saves, seed, 0, "run");
  } catch (err) {
    errorsCounter.add(1, { stage: "panic" });
    log.emit({
      severityText: "WARN",
      body: `weal engine panic (contained, re-instantiating): ${err instanceof Error ? err.message : String(err)}`,
    });
    (hooks?.reinstantiateFn ?? reinstantiate)();
    return { kind: "fault" };
  }
  if (result.ok) return { kind: "ok", value: result };
  return { kind: "error", error: result };
}

// --- the D32-14 noise gate -----------------------------------------------------------

/** A die token anywhere not glued to a preceding word char (`d20`, `4d6kh3`). */
const DIE_TOKEN_RE = /(^|[^a-zA-Z0-9_])\d*d\d/;
/** `let` / `match` as whole words. */
const KEYWORD_RE = /\b(?:let|match)\b/;
/** Any operator-ish character weal chat plausibly means as code. */
const OPERATOR_RE = /[+\-*/<>=!([]/;
/** Ident-shaped words, for the saved-name check. */
const WORD_RE = /[a-z][a-zA-Z0-9_]*/g;

/**
 * Should a non-parse engine error be VISIBLE for this source? True when the
 * source contains a die token, `let`/`match`, an operator, or a word matching a
 * saved name — so `lol` / `brb` / `:p` chat noise stays silent (D32-14).
 */
export function passesNoiseGate(source: string, savedNames: readonly string[]): boolean {
  if (DIE_TOKEN_RE.test(source)) return true;
  if (KEYWORD_RE.test(source)) return true;
  if (OPERATOR_RE.test(source)) return true;
  if (savedNames.length === 0) return false;
  const names = new Set(savedNames);
  for (const word of source.match(WORD_RE) ?? []) {
    if (names.has(word)) return true;
  }
  return false;
}

/**
 * A lone atom literal (`:p`) — evaluates fine (atoms are displayable) but is
 * chat noise, suppressed on the OK path per the D32-14 gate's intent.
 */
export function isBareAtom(source: string): boolean {
  return /^:[a-z][a-z0-9-]*$/.test(source);
}

// --- the D32-17 boot algorithm -------------------------------------------------------

const ZERO_SEED = new Uint8Array(32);

/**
 * Validate `funcs_v2` rows (already in id order) via `mode:"check"`, each
 * against the prior valid rows. Failing rows are skipped with a WARN naming
 * them. Returns the runtime save list (latest-per-name wins downstream, by map
 * overwrite at consumption — the engine consumes `[name, source]` in order).
 */
export function loadValidatedFuncs(
  rows: readonly FuncV2[],
  hooks?: EngineHooks,
): [string, string][] {
  const evaluateFn = hooks?.evaluateFn ?? evaluate;
  const valid: [string, string][] = [];
  for (const row of rows) {
    const res = evaluateFn(row.source, valid, ZERO_SEED, 0, "check");
    if (res.ok) {
      valid.push([row.name, row.source]);
    } else {
      log.emit({
        severityText: "WARN",
        body: `skipping stale funcs_v2 row ${row.id} (${row.name}): ${res.stage}: ${res.message}`,
      });
    }
  }
  return valid;
}
