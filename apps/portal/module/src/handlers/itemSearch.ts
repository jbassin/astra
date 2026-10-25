/**
 * `query-item`'s name search: hits across world items, party-member items and visible
 * compendium packs, each labeled with where it came from.
 */
import { sourceItems, sourceOf } from "../pf2e";
import { ownershipDefaultVisible, packVisibleToPlayers, partyMemberUuids } from "./itemAccess";
import { byRankThenName, DEFAULT_SEARCH_LIMIT, matchRank } from "./shared";

export interface ItemHitRow {
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

/** The tri-scope name search, merged/ranked/truncated the same way as
 * `search-compendium`/`search-world` ({@link matchRank}/{@link byRankThenName}). */
export async function searchItemsByName(
  name: string,
  limit: number | undefined,
): Promise<ItemHitRow[]> {
  const needle = name.toLowerCase();
  const rows: ItemHitCandidate[] = [];

  // World items — same ownership.default >= OBSERVER gate as the uuid-fetch path.
  for (const item of game.items.values()) {
    const rank = matchRank(item.name, needle);
    if (rank === undefined) continue;
    if (!ownershipDefaultVisible(sourceOf(item))) continue;
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
  // (the pack visibility gate), restricted to Item-type packs.
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
