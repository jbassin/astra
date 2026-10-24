/**
 * The player-key party roster (`query-party`): every party member, as a PC row or a
 * companion row. Builders return plain data; the server renders the markdown.
 */
import {
  BridgeError,
  type BridgeToolHandlers,
  type PartyCompanionRow,
  type PartyPcRow,
  QueryPartyParams,
  type QueryPartyResult,
} from "@astra/portal-shared";

import {
  actorHeroPoints,
  actorHp,
  actorLevel,
  documentOwnership,
  familiarMasterId,
  firstItemName,
  liveSystem,
  OWNER_LEVEL,
  partyMemberUuids as partyMemberUuidsOf,
  type Pf2eSource,
  sourceOf,
  sourceSystem,
} from "../pf2e";
import { fullPool } from "./playerSummary";

/** `query-party` (0028 S2/D28-4) — resolves the party actor(s) by `type === "party"`
 * AT QUERY TIME (never hardcoded, spec Verified footprint), unions every resolved
 * party's `system.details.members` uuid refs (pf2e allows multiple parties; this
 * world has one), then splits each resolved member into a full PC row (`type ===
 * "character"`) or a labeled minimal companion row (anything else — the live world's
 * familiar Othello is the verified case). A member uuid that no longer resolves
 * (stale reference) is skipped, not a failure — one dangling ref shouldn't sink the
 * whole roster. Zero party actors in the world is the one hard failure (typed
 * `not-found`, per the spec's adversarial-pass answer on a missing/renamed party). */
async function handleQueryParty(rawParams: unknown): Promise<QueryPartyResult> {
  QueryPartyParams.parse(rawParams);
  const parties = Array.from(game.actors.values()).filter((a) => a.type === "party");
  if (parties.length === 0) {
    throw new BridgeError("not-found", "no party actor found in this world");
  }

  const memberUuids = new Set<string>();
  let partyName: string | undefined;
  for (const party of parties) {
    partyName ??= party.name;
    for (const uuid of partyMemberUuidsOf(sourceSystem(sourceOf(party)))) memberUuids.add(uuid);
  }

  const pcs: PartyPcRow[] = [];
  const companions: PartyCompanionRow[] = [];
  for (const uuid of memberUuids) {
    const doc = await fromUuid(uuid);
    if (!doc) continue; // a stale member reference — skip, never fail the whole roster
    if (doc.type === "character") {
      pcs.push(buildPartyPcRow(doc));
    } else {
      companions.push(buildPartyCompanionRow(doc));
    }
  }
  return { partyName, pcs, companions };
}

/** Best-effort owner-player-name resolution (D28-4's roster row) — an OWNER-level
 * (3) `ownership` entry (excluding the special `"default"` key) resolved against
 * `game.users`, skipping the GM's own OWNER grant (every document carries one). Omits
 * the field entirely rather than guessing when nothing resolves. */
function resolveOwnerPlayer(src: Pf2eSource): string | undefined {
  for (const [userId, level] of documentOwnership(src)) {
    if (userId === "default" || level !== OWNER_LEVEL) continue;
    const user = game.users.get(userId);
    if (user && !user.isGM) return user.name;
  }
  return undefined;
}

function buildPartyPcRow(doc: FoundryDocumentLike): PartyPcRow {
  const src = sourceOf(doc);
  const source = sourceSystem(src);
  // A PC's hp.max exists only on the live side; the source fallback covers a test double
  // or a document with no prepared `system`. Hero points and level come from the source.
  const live = liveSystem(doc);
  const hp = (live && actorHp(live)) ?? actorHp(source);
  return {
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    level: actorLevel(source),
    hp: fullPool(hp),
    heroPoints: fullPool(actorHeroPoints(source)),
    ancestry: firstItemName(src, "ancestry"),
    className: firstItemName(src, "class"),
    ownerPlayer: resolveOwnerPlayer(src),
  };
}

function buildPartyCompanionRow(doc: FoundryDocumentLike): PartyCompanionRow {
  const master = familiarMasterId(sourceSystem(sourceOf(doc)));
  const masterActor = master !== undefined ? game.actors.get(master) : undefined;
  return {
    uuid: doc.uuid,
    id: doc.id,
    name: doc.name,
    type: doc.type ?? "unknown",
    master: masterActor?.name,
  };
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const partyHandlers = {
  "query-party": handleQueryParty,
} satisfies Partial<BridgeToolHandlers>;
