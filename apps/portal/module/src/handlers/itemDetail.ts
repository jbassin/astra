/**
 * `query-item`'s detail projection: the display fields of one resolved item, read from
 * its stored source and formatted for the wire.
 */
import {
  itemAcBonus,
  itemBulk,
  itemDamage,
  itemDescription,
  itemLevel,
  itemPrice,
  itemRarity,
  itemTraits,
  type Pf2eSource,
  PRICE_DENOMINATIONS,
  sourceOf,
} from "../pf2e";
import { type ResolvedItem } from "./itemAccess";

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

export function buildItemDetail(resolved: ResolvedItem): {
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
