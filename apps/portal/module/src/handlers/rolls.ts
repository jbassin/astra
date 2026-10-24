/**
 * The player-key roll history (`query-rolls`): public chat rolls only, newest first,
 * with cursor pagination.
 */
import {
  QueryRollsParams,
  type QueryRollsResult,
  type RollDieRow,
  type RollModifierRow,
  type RollRow,
  type BridgeToolHandlers,
} from "@astra/portal-shared";

import {
  liveFlags,
  type Pf2eFlags,
  type Pf2eRollContext,
  rollContext,
  rollModifierName,
  rollModifiers,
  rollOriginUuid,
} from "../pf2e";
import { resolveByName } from "./shared";

/** D28-3's non-negotiable public-only privacy filter, baked in module-side — never
 * a param. Three prongs, the third the adversarial B1 backstop: `whisper.length
 * === 0 ∧ blind !== true ∧ flags.pf2e.context.secret !== true`. With the
 * GM-toggleable world setting `metagame_secretChecks` ON, pf2e skips the forced
 * gmroll/blindroll rewrite for secret checks (`pf2e.mjs:23942`) — a secret
 * Perception/Stealth check can land with `whisper=[]`/`blind=false` while
 * `flags.pf2e.context.secret === true` remains the only marker; prongs 1-2 alone
 * would leak it. */
function isPublicRollMessage(
  msg: FoundryChatMessage,
  context: Pf2eRollContext | undefined,
): boolean {
  return msg.whisper.length === 0 && msg.blind !== true && context?.secret !== true;
}

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
async function buildRollRow(
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

/** D28-13's actor-filter resolution for `query-rolls`' `actor` param: a uuid/bare-
 * id resolves directly to that world actor id; anything else resolves BY NAME the
 * same way `query-player` does ({@link resolveByName} — exact-then-unambiguous-
 * prefix, typed `ambiguous-name`/`not-found` on failure). */
function resolveActorFilterId(raw: string): string {
  if (raw.includes(".")) {
    const segments = raw.split(".");
    const id = segments.at(-1);
    return id && id.length > 0 ? id : raw;
  }
  const direct = game.actors.get(raw);
  if (direct) return direct.id;
  return resolveByName(Array.from(game.actors.values()), raw).id;
}

function decodeRollsCursor(raw: string): { timestamp: number; id: string } | undefined {
  const idx = raw.indexOf(":");
  if (idx === -1) return undefined;
  const timestamp = Number(raw.slice(0, idx));
  const id = raw.slice(idx + 1);
  if (!Number.isFinite(timestamp) || id.length === 0) return undefined;
  return { timestamp, id };
}

function encodeRollsCursor(c: { timestamp: number; id: string }): string {
  return `${c.timestamp}:${c.id}`;
}

/** Newest-first-with-`_id`-tiebreak total order (D28-10) — `compareRowsDesc(a,b) <
 * 0` means `a` sorts BEFORE `b` (newer, or same-timestamp-and-greater-id). Cursor
 * semantics are defined directly against this same comparator ({@link
 * isAfterCursor}) so the two can never drift out of sync. */
function compareRowsDesc(
  a: { timestamp: number; id: string },
  b: { timestamp: number; id: string },
): number {
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  return b.id.localeCompare(a.id);
}

/** True when `row` sorts strictly AFTER `cursor` in {@link compareRowsDesc}'s
 * newest-first order — i.e. it belongs on the page immediately following the one
 * `cursor` was the last row of. Value-based (not an array-index lookup), so a
 * cursor still resumes correctly even if the exact message it names no longer
 * exists between calls. */
function isAfterCursor(
  row: { timestamp: number; id: string },
  cursor: { timestamp: number; id: string },
): boolean {
  if (row.timestamp !== cursor.timestamp) return row.timestamp < cursor.timestamp;
  return row.id.localeCompare(cursor.id) < 0;
}

const DEFAULT_ROLLS_LIMIT = 20;

function toEpochMs(value: number | string): number {
  return typeof value === "number" ? value : Date.parse(value);
}

/** `query-rolls` (0028 S3/D28-3/D28-10/D28-12) — filters `game.messages.contents`
 * (verified uncapped, D28-10) down to public roll messages, newest-first with
 * `(timestamp,_id)` cursor pagination. The D28-3 privacy filter is unconditional;
 * every other filter (`actor`/`type`/`outcome`/`since`/`until`) composes with it
 * and with each other. */
async function handleQueryRolls(rawParams: unknown): Promise<QueryRollsResult> {
  const params = QueryRollsParams.parse(rawParams);
  const messages = game.messages;
  const totalMessages = messages.size;

  const actorFilterId = params.actor !== undefined ? resolveActorFilterId(params.actor) : undefined;
  const sinceMs = params.since !== undefined ? toEpochMs(params.since) : undefined;
  const untilMs = params.until !== undefined ? toEpochMs(params.until) : undefined;
  const cursor = params.cursor !== undefined ? decodeRollsCursor(params.cursor) : undefined;

  const qualifying: Array<{ msg: FoundryChatMessage; context: Pf2eRollContext | undefined }> = [];
  for (const msg of messages.contents) {
    if (!Array.isArray(msg.rolls) || msg.rolls.length === 0) continue;
    const context = rollContext(liveFlags(msg));
    if (!isPublicRollMessage(msg, context)) continue;
    if (sinceMs !== undefined && msg.timestamp < sinceMs) continue;
    if (untilMs !== undefined && msg.timestamp > untilMs) continue;
    if (actorFilterId !== undefined) {
      const speakerActor = msg.speaker?.actor;
      const contextActor = context?.actor;
      if (speakerActor !== actorFilterId && contextActor !== actorFilterId) continue;
    }
    const rollType = context?.type ?? "roll";
    if (params.type !== undefined && rollType !== params.type) continue;
    if (params.outcome !== undefined && context?.outcome !== params.outcome) continue;
    qualifying.push({ msg, context });
  }

  qualifying.sort((a, b) => compareRowsDesc(a.msg, b.msg));
  const afterCursor = cursor ? qualifying.filter((q) => isAfterCursor(q.msg, cursor)) : qualifying;

  const limit = params.limit ?? DEFAULT_ROLLS_LIMIT;
  const page = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > limit;

  const rows: RollRow[] = [];
  for (const { msg, context } of page) {
    const row = await buildRollRow(msg, context);
    if (row) rows.push(row);
  }

  const lastPageMsg = page.at(-1)?.msg;
  const nextCursor =
    hasMore && lastPageMsg
      ? encodeRollsCursor({ timestamp: lastPageMsg.timestamp, id: lastPageMsg.id })
      : undefined;

  return { rows, totalMessages, hasMore, nextCursor };
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const rollHandlers = {
  "query-rolls": handleQueryRolls,
} satisfies Partial<BridgeToolHandlers>;
