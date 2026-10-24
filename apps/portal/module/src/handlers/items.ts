/**
 * Item tools: author an item (`create-item`) and the player-facing item lookup
 * (`query-item`), which only shows what a player could see in Foundry.
 */
import {
  CreateItemParams,
  type CreateItemResult,
  QueryItemParams,
  type QueryItemResult,
  type BridgeToolHandlers,
} from "@astra/portal-shared";

import {
  itemAcBonus,
  itemBulk,
  itemDamage,
  itemDescription,
  itemLevel,
  itemPrice,
  itemRarity,
  itemTraits,
  partyMemberUuids as partyMemberUuidsOf,
  type Pf2eSource,
  PRICE_DENOMINATIONS,
  sourceItems,
  sourceOf,
  sourceSystem,
} from "../pf2e";
import { BridgeHandlerError, byRankThenName, DEFAULT_SEARCH_LIMIT, matchRank } from "./shared";
import {
  auditLog,
  collectRuleWarnings,
  createChecked,
  createEmbeddedChecked,
  resolveBasePayload,
  withStamp,
  writeGate,
} from "./writes";

/** `create-item` (spec 0026 S2/D-1/D-6/D-7) — hand-authors a new item from scratch or
 * clones+patches a compendium base, either as a standalone world item or embedded
 * directly on an actor (`actorId`). `rulesSelections` pre-seeds
 * `flags.pf2e.rulesSelections` (the ChoiceSet-modal-avoidance pass-through, spec
 * Verified footprint). Only the actor-embedded path gets a RE read-back — a world
 * item has no owner, so pf2e never instantiates its rule elements at all. */
async function handleCreateItem(rawParams: unknown): Promise<CreateItemResult> {
  const params = CreateItemParams.parse(rawParams);
  try {
    writeGate(1);

    const base = await resolveBasePayload(params.baseUuid, {
      name: params.name,
      system: params.system,
      img: params.img,
    });
    const payload: Record<string, unknown> = base ?? {
      name: params.name,
      type: params.type,
      ...(params.system !== undefined ? { system: params.system } : {}),
      ...(params.img !== undefined ? { img: params.img } : {}),
    };
    payload.flags = withStamp(
      payload.flags,
      "create-item",
      params.rulesSelections !== undefined
        ? { pf2e: { rulesSelections: params.rulesSelections } }
        : undefined,
    );
    const sentSystem = payload.system as Record<string, unknown> | undefined;

    let created: FoundryDocumentLike;
    let warnings: string[] = [];
    if (params.actorId !== undefined) {
      const actor = game.actors.get(params.actorId);
      if (!actor) {
        throw new BridgeHandlerError("not-found", `actor not found: ${params.actorId}`);
      }
      const [item] = await createEmbeddedChecked(actor, "Item", [payload]);
      if (!item) {
        throw new BridgeHandlerError("foundry-error", "item creation returned no document");
      }
      created = item;
      warnings = collectRuleWarnings(item.name, sentSystem, item);
    } else {
      // World items have no owning actor, so pf2e's data-prep (which instantiates
      // rule elements) never runs on them — there is nothing to read back (D-7).
      const docClass = getDocumentClass("Item");
      created = await createChecked(docClass, payload);
    }

    const result: CreateItemResult = {
      uuid: created.uuid,
      id: created.id,
      name: created.name,
      warnings,
    };
    auditLog("create-item", params, `ok (${created.id})`);
    return result;
  } catch (err) {
    auditLog("create-item", params, `denied/failed: ${String(err)}`);
    throw err;
  }
}

/** `CONST.DOCUMENT_OWNERSHIP_LEVELS` string-key values, verified `common/
 * constants.mjs:372-397`. World/embedded document `ownership` fields already carry
 * the NUMERIC form directly (see `resolveOwnerPlayer`'s `OWNER_LEVEL = 3` in `./party.ts`) —
 * only a compendium PACK's `ownership` config (`CompendiumCollection#CONFIG_FIELD`,
 * `client/documents/collections/compendium-collection.mjs:99-104`) stores these as
 * STRING level names, hence this lookup table. */
const OWNERSHIP_LEVEL_VALUES: Record<string, number> = {
  INHERIT: -1,
  NONE: 0,
  LIMITED: 1,
  OBSERVER: 2,
  OWNER: 3,
};
const OBSERVER_LEVEL = 2;

/** D28-5's world/embedded-item visibility rule: `ownership.default >= OBSERVER(2)`
 * — the same numeric ownership field `resolveOwnerPlayer` (query-party) already
 * reads, just checked against a different threshold/purpose here. */
function ownershipDefaultVisible(raw: Record<string, unknown>): boolean {
  const ownership = raw.ownership as Record<string, unknown> | undefined;
  const level = ownership?.default;
  return typeof level === "number" && level >= OBSERVER_LEVEL;
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
function packVisibleToPlayers(pack: FoundryCompendiumCollection): boolean {
  const level = pack.ownership?.PLAYER;
  const numeric = typeof level === "string" ? (OWNERSHIP_LEVEL_VALUES[level] ?? -1) : -1;
  return numeric >= OBSERVER_LEVEL;
}

/** The set of every `type==="party"` actor's member uuids, across every party in
 * the world (pf2e allows more than one — same union-across-parties posture as
 * `handleQueryParty`, D28-4) — used here only for `query-item`'s embedded-scope
 * membership check, so unlike `handleQueryParty` this never throws when no party
 * actor exists: an item search against zero parties just has zero embedded hits,
 * not a query-time failure. */
function partyMemberUuids(): Set<string> {
  const memberUuids = new Set<string>();
  for (const party of Array.from(game.actors.values()).filter((a) => a.type === "party")) {
    for (const uuid of partyMemberUuidsOf(sourceSystem(sourceOf(party)))) memberUuids.add(uuid);
  }
  return memberUuids;
}

/** D28-5's small pf2e-item read projection, shared by every `query-item` detail
 * fetch — a hand-picked list of display fields (the same narrow read-side
 * exception posture as D28-2), never a modeled write schema. Every field is
 * fail-soft (a missing/wrong-shaped source path is simply omitted). */
function extractItemDetailFields(src: Pf2eSource): {
  level?: number;
  traits?: string[];
  rarity?: string;
  price?: string;
  bulk?: number;
  damage?: string;
  ac?: number;
  description?: string;
} {
  const traits = itemTraits(src);
  const description = itemDescription(src);
  return {
    level: itemLevel(src),
    traits: traits && traits.length > 0 ? traits : undefined,
    rarity: itemRarity(src),
    price: formatItemPrice(src),
    bulk: itemBulk(src),
    damage: formatItemDamage(src),
    ac: itemAcBonus(src),
    description: description !== undefined && description.length > 0 ? description : undefined,
  };
}

/** Formats every non-zero denomination of the stored price, highest first, e.g. "4 gp"
 * or "1 pp, 5 gp" (the Argyle fixture's "Bastard Sword" stores `{"value":{"gp":4}}`). */
function formatItemPrice(src: Pf2eSource): string | undefined {
  const coins = itemPrice(src);
  if (!coins) return undefined;
  const parts: string[] = [];
  for (const denom of PRICE_DENOMINATIONS) {
    const n = coins[denom];
    if (n !== undefined && n > 0) parts.push(`${n} ${denom}`);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** A weapon's base damage formula, e.g. "1d8 slashing". */
function formatItemDamage(src: Pf2eSource): string | undefined {
  const d = itemDamage(src);
  if (!d) return undefined;
  const type = d.damageType !== undefined ? ` ${d.damageType}` : "";
  return `${d.dice}${d.die}${type}`;
}

interface ResolvedItem {
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
async function resolveItemForFetch(rawUuid: string): Promise<ResolvedItem> {
  const uuid = rawUuid.includes(".") ? rawUuid : `Item.${rawUuid}`;
  const notFound = (): never => {
    throw new BridgeHandlerError("not-found", `not found: ${uuid}`);
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
  if (!ownershipDefaultVisible((doc as FoundryDocumentLike).toObject())) notFound();
  return { doc: doc as FoundryDocumentLike, provenance: "world" };
}

function buildItemDetail(resolved: ResolvedItem): {
  uuid: string;
  id: string;
  name: string;
  type: string;
  provenance: "world" | "embedded" | "compendium";
  ownerActor?: string;
  pack?: string;
  packLabel?: string;
} & ReturnType<typeof extractItemDetailFields> {
  const src = sourceOf(resolved.doc);
  return {
    uuid: resolved.doc.uuid,
    id: resolved.doc.id,
    name: resolved.doc.name,
    type: resolved.doc.type ?? "item",
    provenance: resolved.provenance,
    ownerActor: resolved.ownerActor,
    pack: resolved.pack?.collection,
    packLabel: resolved.pack?.metadata.label,
    ...extractItemDetailFields(src),
  };
}

interface ItemHitRow {
  uuid: string;
  id: string;
  name: string;
  type: string;
  provenance: "world" | "embedded" | "compendium";
  ownerActor?: string;
  pack?: string;
  packLabel?: string;
}

type ItemHitCandidate = ItemHitRow & { _rank: number };

/** D28-5's tri-scope name search, merged/ranked/truncated the same way as
 * `search-compendium`/`search-world` ({@link matchRank}/{@link byRankThenName}). */
async function searchItemsByName(name: string, limit: number | undefined): Promise<ItemHitRow[]> {
  const needle = name.toLowerCase();
  const rows: ItemHitCandidate[] = [];

  // World items — same ownership.default >= OBSERVER gate as the uuid-fetch path.
  for (const item of game.items.values()) {
    const rank = matchRank(item.name, needle);
    if (rank === undefined) continue;
    if (!ownershipDefaultVisible(item.toObject())) continue;
    rows.push({
      uuid: item.uuid,
      id: item.id,
      name: item.name,
      type: item.type ?? "item",
      provenance: "world",
      _rank: rank,
    });
  }

  // Party-member-embedded items — iterate each party member's OWN stored item
  // list (raw source objects, not Document instances; same `raw.items` surface
  // `buildInventory` reads), never a separate world-item-style collection.
  for (const memberUuid of partyMemberUuids()) {
    const memberDoc = await fromUuid(memberUuid);
    if (!memberDoc) continue;
    for (const it of sourceItems(sourceOf(memberDoc))) {
      const itemName = typeof it.name === "string" ? it.name : "";
      const rank = matchRank(itemName, needle);
      if (rank === undefined) continue;
      const itemId = String(it._id ?? "");
      rows.push({
        uuid: `Actor.${memberDoc.id}.Item.${itemId}`,
        id: itemId,
        name: itemName,
        type: typeof it.type === "string" ? it.type : "item",
        provenance: "embedded",
        ownerActor: memberDoc.name,
        _rank: rank,
      });
    }
  }

  // Compendium items — only packs a player-role user could actually see
  // (D28-5's B2 gate), restricted to Item-type packs.
  const itemPacks = Array.from(game.packs.values()).filter(
    (p) => p.metadata.type === "Item" && packVisibleToPlayers(p),
  );
  for (const pack of itemPacks) {
    const index = await pack.getIndex({ fields: ["img"] });
    for (const entry of index.values()) {
      const rank = matchRank(entry.name, needle);
      if (rank === undefined) continue;
      rows.push({
        uuid: entry.uuid,
        id: entry._id,
        name: entry.name,
        type: entry.type ?? pack.metadata.type,
        provenance: "compendium",
        pack: pack.collection,
        packLabel: pack.metadata.label,
        _rank: rank,
      });
    }
  }

  rows.sort(byRankThenName);
  return rows.slice(0, limit ?? DEFAULT_SEARCH_LIMIT).map(({ _rank, ...row }) => row);
}

/** `query-item` (0028 S3/D28-5/D28-13) — an id/uuid fetch renders ONE item's full
 * detail; a name search returns a provenance-labeled hit LIST (never a single
 * item, even when exactly one hit matches — D28-5's adversarial-pass answer on
 * cross-scope name collisions, e.g. a world "Dagger" AND an embedded "Dagger"). */
async function handleQueryItem(rawParams: unknown): Promise<QueryItemResult> {
  const params = QueryItemParams.parse(rawParams);
  if (params.uuid !== undefined) {
    const resolved = await resolveItemForFetch(params.uuid);
    return { kind: "item", item: buildItemDetail(resolved) };
  }
  const hits = await searchItemsByName(params.name as string, params.limit);
  return { kind: "hits", hits };
}

/** This module's handlers, keyed by tool name; `./index.ts` assembles them into
 * `TOOL_HANDLERS`. */
export const itemHandlers = {
  "create-item": handleCreateItem,
  "query-item": handleQueryItem,
} satisfies Partial<BridgeToolHandlers>;
