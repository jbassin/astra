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
 * - {@link checkNewSave}: the save guard — dry-runs a new save against the
 *   runtime saves list before anything persists it.
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

// --- the save guard ------------------------------------------------------------------

/**
 * Rolls every player relies on; a new save must not break any of them. Every
 * roll runs against the whole runtime saves list, and the engine re-loads that
 * list (parse, type-check AND evaluate each save, in order) on every message.
 * So the first, trivial roll reproduces exactly what any later roll does first
 * — a save that fails to evaluate breaks it. That is the case the boot check
 * misses: `mode:"check"` never evaluates a save, so `|| 2d20kh1` passes boot
 * and then fails every `run`. The rest cover builtins a save can shadow:
 * saves and builtins share one namespace (a saved function can act as a die
 * suffix), so `save(:kh, 3)` breaks every `kh` roll and `save(:save, 3)` breaks
 * saving itself — including the re-save that would fix it.
 */
export const GUARD_ROLLS: readonly string[] = [
  "d20",
  "2d20kh1 + 1",
  "2d20kl1",
  "d6e1",
  "d6r1",
  "plot(d6)",
  "save(:x, 1)",
];

/**
 * Ways a player uses a saved name, as `[what the player would type, what the
 * guard evaluates]`. The `let _ = …; ()` wrapper evaluates the use but
 * displays nothing, so the engine never computes a distribution for it (that
 * is what makes showing a huge die slow); a heavy save stays cheap to check.
 */
function guardUses(name: string): [string, string][] {
  return [
    [`${name} + 1`, `let _ = ${name} + 1; ()`],
    [`${name}(1)`, `let _ = ${name}(1); ()`],
  ];
}

/**
 * An engine "internal error": a well-typed program reached a state the checker
 * should have ruled out (the engine prefixes these messages; `stage` is
 * `"eval"`). Never the player's own mistake, unlike an ordinary type, eval or
 * fuel error.
 */
export function isInternalError(err: WealErr): boolean {
  return err.stage === "eval" && err.message.startsWith("internal error:");
}

/** Why {@link checkNewSave} refused a save. */
export interface SaveRefusal {
  /**
   * `"rolls"`: with the save in place, one of {@link GUARD_ROLLS} fails for
   * everyone. `"use"`: using the save itself hits an engine internal error.
   */
  kind: "rolls" | "use";
  /** The roll or use that failed, as a player would type it. */
  probe: string;
  /** The engine's error; null when the engine faulted (a contained panic). */
  error: WealErr | null;
  /** The name is a builtin's, so the save shadows it. */
  shadowsBuiltin: boolean;
}

export type SaveCheck = { ok: true } | ({ ok: false } & SaveRefusal);

/**
 * Dry-run a new or replacement save before persisting it (WEAL-2). `saves` is
 * the runtime list a later roll will evaluate (`[name, source]` in id order).
 * The candidate list appends the new save last, exactly where the next roll
 * and the next boot will see it, since a new row gets the highest id.
 *
 * Refused when either:
 * 1. a {@link GUARD_ROLLS} roll fails with the save added but passes without
 *    it. A roll that already fails without it is not this save's fault, so it
 *    does not block the save.
 * 2. a {@link guardUses} use of the new name hits an engine internal error or
 *    fault. This catches nullary macros such as `|| d20 + 7`, which load fine
 *    but fail on every use. Type, eval and fuel errors don't count: they say
 *    the use doesn't fit (`f + 1` on a function) or reflect the player's own
 *    logic (`|x| x / 0`).
 *
 * Passing (1) also means the save survives a restart: the boot check
 * re-type-checks the same list in the same order, which `run` already did.
 *
 * Cost: every probe runs under the engine's default fuel, like any message,
 * with a fixed seed. The guard rolls are fixed and cheap, so they cost what
 * loading the saves costs; only the two uses run player code, and they skip
 * the distribution work. A check costs about one ordinary roll per probe.
 */
export function checkNewSave(
  name: string,
  source: string,
  saves: readonly [string, string][],
  hooks?: EngineHooks,
): SaveCheck {
  const before: [string, string][] = [...saves];
  const after: [string, string][] = [...saves, [name, source]];
  const refuse = (kind: SaveRefusal["kind"], probe: string, outcome: EngineOutcome): SaveCheck => ({
    ok: false,
    kind,
    probe,
    error: outcome.kind === "error" ? outcome.error : null,
    shadowsBuiltin: isBuiltinName(name, hooks),
  });

  for (const roll of GUARD_ROLLS) {
    const outcome = runEngine(roll, after, ZERO_SEED, hooks);
    if (outcome.kind === "ok") continue;
    if (runEngine(roll, before, ZERO_SEED, hooks).kind !== "ok") continue;
    return refuse("rolls", roll, outcome);
  }
  for (const [shown, probe] of guardUses(name)) {
    const outcome = runEngine(probe, after, ZERO_SEED, hooks);
    if (outcome.kind === "fault") return refuse("use", shown, outcome);
    if (outcome.kind === "error" && isInternalError(outcome.error)) {
      return refuse("use", shown, outcome);
    }
  }
  return { ok: true };
}

/** A bare name type-checks with no saves exactly when a builtin owns it. */
function isBuiltinName(name: string, hooks?: EngineHooks): boolean {
  try {
    return (hooks?.evaluateFn ?? evaluate)(name, [], ZERO_SEED, 0, "check").ok;
  } catch {
    return false;
  }
}
