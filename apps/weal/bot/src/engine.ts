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
 *   id order, each put through the save guard after the rows kept before it;
 *   a refused row is skipped with a WARN naming it, so one bad save never
 *   breaks the other rolls.
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
type EngineOutcome = { kind: "ok"; value: WealOk } | { kind: "error"; error: WealErr };

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

/**
 * Load `funcs_v2` rows (already in id order), keeping each row only if the
 * save guard ({@link checkNewSave}) would accept it today, appended after the
 * rows kept before it. So a stored row gets exactly the check a new save gets:
 *
 * - it must load the way every roll loads it (`mode:"run"`, so the engine
 *   parses, type-checks AND evaluates the saves list; `mode:"check"` never
 *   evaluates a save, so `1 / 0` would pass it and then fail every roll);
 * - it must not break one of the {@link GUARD_ROLLS} for everyone. A row that
 *   loads cleanly can still do that: `kh = 3` (from before the guard existed)
 *   breaks every `kh` roll, and a row named `save` blocks every later save;
 * - using it must not hit an engine fault, which would page on every use.
 *
 * A refused row is skipped with one WARN naming it; every other row and roll
 * keeps working. Returns the runtime save list; the engine consumes it in
 * order, so a later row of the same name wins.
 *
 * Cost: each row costs one guard check (about ten evaluations), and each
 * evaluation re-loads the rows kept before it, so boot is quadratic in the
 * row count. Each evaluation is fuel-bounded and cheap at campaign scale.
 */
export function loadValidatedFuncs(
  rows: readonly FuncV2[],
  hooks?: EngineHooks,
): [string, string][] {
  const valid: [string, string][] = [];
  for (const row of rows) {
    const check = checkNewSave(row.name, row.source, valid, hooks);
    if (check.ok) {
      valid.push([row.name, row.source]);
    } else {
      const { stage, message } = check.error;
      // A skipped row is handled, so WARN; an engine fault is an engine bug, and
      // ERROR is how an operator hears of one (it pages Discord, Class A).
      log.emit({
        severityText: isInternalError(check.error) ? "ERROR" : "WARN",
        body: `skipping saved weal source: funcs_v2 row ${row.id} (${row.name}): ${check.kind} \`${check.probe}\`: ${stage}: ${message}`,
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

type SaveCheck = { ok: true } | ({ ok: false } & SaveRefusal);

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
 * The boot load ({@link loadValidatedFuncs}) runs this same check on every
 * stored row, in id order, so a save accepted here is kept across restarts.
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
