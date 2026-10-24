/**
 * `query-item`'s visibility rules (D28-5): which world, party-embedded and compendium
 * items a player could see in Foundry, and the uuid fetch that applies them. The bridge
 * runs as GM, so these gates are the only thing keeping GM-hidden items from a player key.
 */
import { BridgeError } from "@astra/portal-shared";

import {
  documentOwnership,
  OBSERVER_LEVEL,
  packOwnershipLevel,
  partyMemberUuids as partyMemberUuidsOf,
  type Pf2eSource,
  sourceOf,
  sourceSystem,
} from "../pf2e";

/** D28-5's world/embedded-item visibility rule: `ownership.default >= OBSERVER(2)`
 * — the same numeric ownership field `resolveOwnerPlayer` (query-party) already
 * reads, just checked against a different threshold/purpose here. */
export function ownershipDefaultVisible(src: Pf2eSource): boolean {
  const level = documentOwnership(src).get("default");
  return level !== undefined && level >= OBSERVER_LEVEL;
}

/** D28-5's compendium pack visibility gate (adversarial B2) — reads the pack's OWN
 * per-role `ownership` config (`pack.ownership.PLAYER`, a string level name; see
 * `types/foundry.d.ts`'s `FoundryCompendiumOwnership` doc comment for the full
 * verified evidence trail and why this is NOT `pack.getUserLevel(game.user)`, which
 * called with the bridge's own GM user always resolves OWNER regardless of the
 * pack's real player-facing config). An absent/unrecognized level defaults to the
 * least-visible reading (`INHERIT`, -1) — fail CLOSED, matching D28-5's "the bridge
 * must not leak GM-hidden content" rationale (the opposite failure direction from
 * D28-2's stats projection, deliberately: a missing derived STAT renders "—"
 * harmlessly, but a missing/malformed PACK ownership config must never default to
 * "visible"). */
export function packVisibleToPlayers(pack: FoundryCompendiumCollection): boolean {
  return packOwnershipLevel(pack.ownership?.PLAYER) >= OBSERVER_LEVEL;
}

/** The set of every `type==="party"` actor's member uuids, across every party in
 * the world (pf2e allows more than one — same union-across-parties posture as
 * `handleQueryParty`, D28-4) — used here only for `query-item`'s embedded-scope
 * membership check, so unlike `handleQueryParty` this never throws when no party
 * actor exists: an item search against zero parties just has zero embedded hits,
 * not a query-time failure. */
export function partyMemberUuids(): Set<string> {
  const memberUuids = new Set<string>();
  for (const party of Array.from(game.actors.values()).filter((a) => a.type === "party")) {
    for (const uuid of partyMemberUuidsOf(sourceSystem(sourceOf(party)))) memberUuids.add(uuid);
  }
  return memberUuids;
}

export interface ResolvedItem {
  doc: FoundryDocumentLike;
  provenance: "world" | "embedded" | "compendium";
  ownerActor?: string;
  pack?: FoundryCompendiumCollection;
}

/** D28-5/D28-13's uuid-or-bare-id item resolution + tri-scope visibility gate —
 * the single choke point every `query-item` uuid fetch goes through. A visibility
 * failure resolves as the SAME typed `not-found` a genuinely-missing uuid would
 * (never a distinct "found but hidden" code) — matching D28-5's uniform "the
 * bridge must not leak GM-hidden content" rationale: a player-key caller can't
 * distinguish "doesn't exist" from "exists but you can't see it" either way. */
export async function resolveItemForFetch(rawUuid: string): Promise<ResolvedItem> {
  const uuid = rawUuid.includes(".") ? rawUuid : `Item.${rawUuid}`;
  const notFound = (): never => {
    throw new BridgeError("not-found", `not found: ${uuid}`);
  };

  if (uuid.startsWith("Compendium.")) {
    const doc = await fromUuid(uuid);
    if (!doc || doc.documentName !== "Item") notFound();
    const packKey = (doc as FoundryDocumentLike).pack;
    const pack =
      typeof packKey === "string"
        ? Array.from(game.packs.values()).find((p) => p.collection === packKey)
        : undefined;
    if (!pack || !packVisibleToPlayers(pack)) notFound();
    return { doc: doc as FoundryDocumentLike, provenance: "compendium", pack };
  }

  const embeddedMatch = /^Actor\.([^.]+)\.Item\.([^.]+)$/.exec(uuid);
  if (embeddedMatch) {
    const actorId = embeddedMatch[1] as string;
    if (!partyMemberUuids().has(`Actor.${actorId}`)) notFound();
    const doc = await fromUuid(uuid);
    if (!doc || doc.documentName !== "Item") notFound();
    const owner = game.actors.get(actorId);
    return { doc: doc as FoundryDocumentLike, provenance: "embedded", ownerActor: owner?.name };
  }

  // World item.
  const doc = await fromUuid(uuid);
  if (!doc || doc.documentName !== "Item") notFound();
  if (!ownershipDefaultVisible(sourceOf(doc as FoundryDocumentLike))) notFound();
  return { doc: doc as FoundryDocumentLike, provenance: "world" };
}
