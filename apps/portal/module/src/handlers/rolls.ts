/**
 * The player-key roll history (`query-rolls`): public chat rolls only, newest first,
 * with cursor pagination. Rows are built in `./rollRows`; the page order and cursor live
 * in `./rollsCursor`.
 */
import {
  type BridgeToolHandlers,
  QueryRollsParams,
  type QueryRollsResult,
  type RollRow,
} from "@astra/portal-shared";

import { liveFlags, type Pf2eRollContext, rollContext } from "../pf2e";
import { buildRollRow } from "./rollRows";
import {
  compareRowsDesc,
  decodeRollsCursor,
  encodeRollsCursor,
  isAfterCursor,
} from "./rollsCursor";
import { resolveByName } from "./shared";

/** The non-negotiable public-only privacy filter, baked in module-side — never
 * a param. Three prongs, the third a backstop for pf2e's own secret rolls: `whisper.length
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

/** The actor-filter resolution for `query-rolls`' `actor` param: a uuid/bare-
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

const DEFAULT_ROLLS_LIMIT = 20;

function toEpochMs(value: number | string): number {
  return typeof value === "number" ? value : Date.parse(value);
}

/** `query-rolls` — filters `game.messages.contents`
 * (verified uncapped) down to public roll messages, newest-first with
 * `(timestamp,_id)` cursor pagination. The privacy filter is unconditional;
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
