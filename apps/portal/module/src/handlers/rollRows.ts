/**
 * One `query-rolls` row per qualifying chat message: the parsed dice, the check name, the
 * outcome and DC pf2e recorded, the origin item and the modifier breakdown.
 */
import { type RollDieRow, type RollModifierRow, type RollRow } from "@astra/portal-shared";

import {
  liveFlags,
  type Pf2eFlags,
  type Pf2eRollContext,
  rollModifierName,
  rollModifiers,
  rollOriginUuid,
} from "../pf2e";

interface ParsedRollDieResult {
  result?: unknown;
  discarded?: unknown;
}

interface ParsedRollTerm {
  class?: unknown;
  faces?: unknown;
  results?: unknown;
}

interface ParsedRollJson {
  formula?: unknown;
  total?: unknown;
  terms?: unknown;
}

/** D28-12 — parses the stored serialized-Roll JSON string (`client/dice/roll.mjs#
 * toJSON`: `{class, formula, total, evaluated, terms[]}`) — everything needed for
 * a markdown row is already in the stored JSON, this NEVER re-evaluates the roll.
 * A malformed/unparseable string (shouldn't happen for a write-validated
 * `evaluated===true` roll, but this module never trusts stored data blindly)
 * returns `undefined` rather than throwing — the caller skips that roll's row. */
function parseRollJson(
  roll: unknown,
): { formula?: string; total?: number; dice: RollDieRow[] } | undefined {
  let parsed: ParsedRollJson;
  try {
    if (typeof roll === "string") {
      parsed = JSON.parse(roll) as ParsedRollJson;
    } else if (roll !== null && typeof roll === "object") {
      // LIVE `game.messages` documents hydrate `rolls` into Roll INSTANCES — the
      // serialized-JSON-strings shape exists only in stored source data (found at the
      // 0028 S4 live gate: every page row silently failed to build). Round-tripping
      // through JSON.stringify invokes the instances' own toJSON() recursively,
      // producing exactly the stored shape either way.
      parsed = JSON.parse(JSON.stringify(roll)) as ParsedRollJson;
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
  const terms = Array.isArray(parsed.terms) ? (parsed.terms as ParsedRollTerm[]) : [];
  const dice: RollDieRow[] = [];
  for (const term of terms) {
    if (term.class !== "Die" || typeof term.faces !== "number") continue;
    const rawResults = Array.isArray(term.results) ? (term.results as ParsedRollDieResult[]) : [];
    const results = rawResults
      .filter((r): r is ParsedRollDieResult & { result: number } => typeof r.result === "number")
      .map((r) => ({ result: r.result, discarded: r.discarded === true ? true : undefined }));
    dice.push({ faces: term.faces, results });
  }
  return {
    formula: typeof parsed.formula === "string" ? parsed.formula : undefined,
    total: typeof parsed.total === "number" ? parsed.total : undefined,
    dice,
  };
}

/** Strips HTML down to plain text and takes a short leading fragment — the
 * module-side fallback when `flags.pf2e.modifierName` is absent (a plain `/roll`
 * or an older pf2e message shape). The server owns full HTML->markdown rendering
 * (D28-6); this is only ever a short derived LABEL, never shipped as prose. */
function deriveCheckNameFromFlavor(flavor: string | undefined): string | undefined {
  if (!flavor) return undefined;
  const stripped = flavor
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (stripped.length === 0) return undefined;
  return stripped.length > 120 ? `${stripped.slice(0, 120)}…` : stripped;
}

/** Defensive cap on `RollRow.modifiers` — a pathological message (e.g. a
 * synthetic/malicious flag payload) can't bloat a row past this many entries. */
const MAX_ROLL_MODIFIERS = 12;

/** Player-feedback fast-follow to 0028 — the roll modifier breakdown (e.g. an
 * occultism check's intelligence/proficiency/item/status/circumstance bonuses).
 * Reads `flags.pf2e.modifiers`, an array of serialized `ModifierPF2e#toObject()`
 * objects (verified against the live container's `pf2e.mjs`: the class at
 * `pf2e.mjs:43599` declares `label`/`modifier`/`type`/`enabled`/`ignored` as own
 * fields, `toObject()` at `:43696` includes all of them; the serialization site
 * that writes this exact array onto the chat message is `pf2e.mjs:24070`,
 * `modifiers: check.modifiers.map((m) => m.toObject())`). Filtered to the
 * **enabled AND non-ignored** subset — the same breakdown pf2e's own chat card
 * shows (mirrors an existing in-repo pf2e usage at `pf2e.mjs:70134`:
 * `modifiers.filter((modifier) => modifier.enabled)`, extended here with the
 * `ignored` prong since `applyAdjustments` can independently set `ignored: true`
 * on an otherwise-enabled modifier, e.g. a suppressed adjustment). Fail-soft:
 * skips any entry missing a string `label`/numeric `modifier`, never throws;
 * `undefined` (not `[]`) when no entry qualifies, including a message with no
 * modifiers flag at all (a plain `/roll` or an older pf2e message shape). */
function buildRollModifiers(flags: Pf2eFlags): RollModifierRow[] | undefined {
  const modifiers = rollModifiers(flags);
  if (!modifiers) return undefined;
  const rows: RollModifierRow[] = [];
  for (const m of modifiers) {
    if (rows.length >= MAX_ROLL_MODIFIERS) break;
    if (!m.enabled || m.ignored) continue;
    if (m.label === undefined || m.modifier === undefined) continue;
    rows.push({ label: m.label, value: m.modifier, type: m.type });
  }
  return rows.length > 0 ? rows : undefined;
}

/** Builds one `query-rolls` row from a qualifying `ChatMessage` — `undefined` when
 * the message's first roll doesn't parse (skipped, never fails the whole page).
 * `originItemName` resolves `flags.pf2e.origin.uuid` (verified `pf2e.mjs`'s
 * `Item#getOriginData`: `{actor, uuid, type, rollOptions}` — NO name field is ever
 * stored, so this is the one per-row `fromUuid` call D28-12's shape requires;
 * bounded by the page `limit`, never the full scanned history). */
export async function buildRollRow(
  msg: FoundryChatMessage,
  context: Pf2eRollContext | undefined,
): Promise<RollRow | undefined> {
  const rollJson = msg.rolls[0];
  if (!rollJson) return undefined;
  const parsedRoll = parseRollJson(rollJson);
  if (!parsedRoll) return undefined;

  const flags = liveFlags(msg);
  const checkName = rollModifierName(flags) ?? deriveCheckNameFromFlavor(msg.flavor);
  const originUuid = rollOriginUuid(flags);
  let originItemName: string | undefined;
  if (originUuid) {
    const originDoc = await fromUuid(originUuid).catch(() => null);
    originItemName = originDoc?.name;
  }

  const outcome =
    context?.outcome === "criticalFailure" ||
    context?.outcome === "failure" ||
    context?.outcome === "success" ||
    context?.outcome === "criticalSuccess"
      ? context.outcome
      : undefined;

  return {
    id: msg.id,
    timestamp: msg.timestamp,
    speakerAlias: msg.speaker?.alias,
    speakerActorId: msg.speaker?.actor,
    checkName,
    rollType: context?.type ?? "roll",
    outcome,
    dcValue: context?.dc?.visible === true ? context.dc.value : undefined,
    formula: parsedRoll.formula ?? "",
    total: parsedRoll.total ?? 0,
    dice: parsedRoll.dice,
    originItemName,
    modifiers: buildRollModifiers(flags),
  };
}
