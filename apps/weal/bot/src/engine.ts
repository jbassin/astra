/**
 * The engine seam — everything between the bot and
 * `@astra/weal-engine`:
 *
 * - {@link runEngine}: one evaluate call. Trap containment is the wrapper's
 *   job: a wasm trap comes back as an ordinary `stage:"internal"` error, and
 *   the wrapper has already re-instantiated the wasm.
 * - {@link passesNoiseGate}: the error-visibility gate, so ordinary chat can
 *   never trigger a visible error reply.
 * - {@link loadValidatedFuncs}: the boot algorithm — `funcs_v2` rows in
 *   id order, each loaded (parsed, type-checked AND evaluated) after the prior
 *   valid rows; a failing row is skipped with a WARN naming it, so one bad
 *   save never breaks the other rolls.
 * - {@link checkNewSave}: the save guard — dry-runs a new save against the
 *   runtime saves list before anything persists it.
 */

import { getLogger } from "@astra/observe";
import { evaluate, isBuiltin, type WealErr, type WealOk } from "@astra/weal-engine";

import type { FuncV2 } from "./db";

const log = getLogger("astra.weal-bot");

/** Injectable engine internals — tests swap in a scripted evaluate. */
export interface EngineHooks {
  evaluateFn?: typeof evaluate;
}

/** A run's outcome: ok, or an engine-reported error (incl. a contained trap). */
export type EngineOutcome = { kind: "ok"; value: WealOk } | { kind: "error"; error: WealErr };

/** Evaluate one source against the saves list. */
export function runEngine(
  source: string,
  saves: [string, string][],
  seed: Uint8Array,
  hooks?: EngineHooks,
): EngineOutcome {
  const result = (hooks?.evaluateFn ?? evaluate)(source, saves, seed, 0, "run");
  if (result.ok) return { kind: "ok", value: result };
  return { kind: "error", error: result };
}

// --- the noise gate -----------------------------------------------------------------

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
 * saved name — so `lol` / `brb` / `:p` chat noise stays silent.
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
 * chat noise, suppressed on the OK path for the same reason as the noise gate.
 */
export function isBareAtom(source: string): boolean {
  return /^:[a-z][a-z0-9-]*$/.test(source);
}

// --- the boot algorithm -------------------------------------------------------------

const ZERO_SEED = new Uint8Array(32);

/** What loading a save runs: nothing of its own, so only the saves list is evaluated. */
const LOAD_PROBE = "()";

/**
 * Load `funcs_v2` rows (already in id order), each appended after the prior
 * valid rows and loaded exactly the way every roll loads it: a `mode:"run"` of
 * a do-nothing source, so the engine parses, type-checks AND evaluates the
 * saves list. (`mode:"check"` never evaluates a save, so a source like `1 / 0`
 * would pass it and then fail every roll.) Failing rows are skipped with a
 * WARN naming them. Returns the runtime save list; the engine consumes it in
 * order, so a later row of the same name wins.
 *
 * Cost: row k re-loads the k-1 valid rows before it, so boot is quadratic in
 * the row count; each load is a fuel-bounded evaluation, cheap at campaign
 * scale.
 */
export function loadValidatedFuncs(
  rows: readonly FuncV2[],
  hooks?: EngineHooks,
): [string, string][] {
  const valid: [string, string][] = [];
  for (const row of rows) {
    const outcome = runEngine(LOAD_PROBE, [...valid, [row.name, row.source]], ZERO_SEED, hooks);
    if (outcome.kind === "ok") {
      valid.push([row.name, row.source]);
    } else {
      const { stage, message } = outcome.error;
      log.emit({
        severityText: "WARN",
        body: `skipping saved weal source: funcs_v2 row ${row.id} (${row.name}): ${stage}: ${message}`,
        attributes: { "weal.save": row.name, "weal.stage": stage },
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
 * — a save that fails to evaluate breaks it (`|| 2d20kh1` once did exactly
 * this, through an engine bug since fixed). The rest cover builtins a save can shadow:
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
 * `name()` is how a macro with no inputs (`|| …`) is used; it runs the body.
 */
function guardUses(name: string): [string, string][] {
  return [
    [`${name} + 1`, `let _ = ${name} + 1; ()`],
    [`${name}(1)`, `let _ = ${name}(1); ()`],
    [`${name}()`, `let _ = ${name}(); ()`],
  ];
}

/**
 * An engine fault (`stage:"internal"`): a well-typed program reached a state
 * the checker should have ruled out, or the wasm trapped. Never the player's
 * own mistake, unlike an ordinary type, eval or fuel error.
 */
export function isInternalError(err: WealErr): boolean {
  return err.stage === "internal";
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
  /** The engine's error (`stage:"internal"` for a `"use"` refusal). */
  error: WealErr;
  /** The name is a builtin's, so the save shadows it. */
  shadowsBuiltin: boolean;
}

export type SaveCheck = { ok: true } | ({ ok: false } & SaveRefusal);

/**
 * Dry-run a new or replacement save before persisting it, so one bad save
 * can't break every later roll. `saves` is
 * the runtime list a later roll will evaluate (`[name, source]` in id order).
 * The candidate list appends the new save last, exactly where the next roll
 * and the next boot will see it, since a new row gets the highest id.
 *
 * Refused when either:
 * 1. a {@link GUARD_ROLLS} roll fails with the save added but passes without
 *    it. A roll that already fails without it is not this save's fault, so it
 *    does not block the save.
 * 2. a {@link guardUses} use of the new name hits an engine fault
 *    (`stage:"internal"`): a macro that loads fine but trips an engine bug
 *    whenever it is used (a checker/interpreter disagreement, the class of bug
 *    that once broke `|| 2d20kh1`). Type, eval and fuel errors don't count:
 *    they say the use doesn't fit (`f + 1` on a function) or reflect the player's own logic
 *    (`|x| x / 0`).
 *
 * Passing (1) also means the save survives a restart: the boot load evaluates
 * the same list in the same order, which `run` already did.
 *
 * Cost: every probe runs under the engine's default fuel, like any message,
 * with a fixed seed. The guard rolls are fixed and cheap, so they cost what
 * loading the saves costs; only the three uses run player code, and they skip
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
  const refuse = (kind: SaveRefusal["kind"], probe: string, error: WealErr): SaveCheck => ({
    ok: false,
    kind,
    probe,
    error,
    shadowsBuiltin: isBuiltin(name),
  });

  for (const roll of GUARD_ROLLS) {
    const outcome = runEngine(roll, after, ZERO_SEED, hooks);
    if (outcome.kind === "ok") continue;
    if (runEngine(roll, before, ZERO_SEED, hooks).kind !== "ok") continue;
    return refuse("rolls", roll, outcome.error);
  }
  for (const [shown, probe] of guardUses(name)) {
    const outcome = runEngine(probe, after, ZERO_SEED, hooks);
    if (outcome.kind === "error" && isInternalError(outcome.error)) {
      return refuse("use", shown, outcome.error);
    }
  }
  return { ok: true };
}
