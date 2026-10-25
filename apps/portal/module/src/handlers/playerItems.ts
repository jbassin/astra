/**
 * `query-player`'s `feats` and `inventory` sections: the character's embedded feat and
 * gear items, read from the stored source.
 */
import {
  type PlayerFeatRow,
  type PlayerFeatsSection,
  type PlayerInventoryRow,
  type PlayerInventorySection,
} from "@astra/portal-shared";

import {
  featCategory,
  itemBulk,
  itemEquipped,
  itemLevel,
  itemQuantity,
  itemRunes,
  type Pf2eSource,
  sourceItems,
} from "../pf2e";

const FEAT_CATEGORY_FALLBACK = "other";

/** `query-player`'s `feats` section — grouped by category (`system.category`,
 * e.g. "ancestry"/"class"/"skill"/"general"/"classfeature") with the feat's own level. */
export function buildFeats(src: Pf2eSource): PlayerFeatsSection {
  const feats: PlayerFeatRow[] = sourceItems(src)
    .filter((i) => i.type === "feat")
    .map((f) => ({
      id: String(f._id ?? ""),
      name: typeof f.name === "string" ? f.name : "Unnamed",
      category: featCategory(f) ?? FEAT_CATEGORY_FALLBACK,
      level: itemLevel(f),
    }));
  feats.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.level ?? 0) - (b.level ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return { section: "feats", feats };
}

const INVENTORY_ITEM_TYPES = new Set([
  "weapon",
  "armor",
  "equipment",
  "consumable",
  "backpack",
  "treasure",
  "kit",
  "shield",
  "ammo",
]);

/** `query-player`'s `inventory` section — every embedded item whose type is
 * physical gear, with quantity/bulk/carry-state/runes. Fusion/property runes are
 * summarized as short labels (e.g. "+1 potency", "striking 2") rather than the raw
 * rune source objects. */
export function buildInventory(src: Pf2eSource): PlayerInventorySection {
  const rows: PlayerInventoryRow[] = sourceItems(src)
    .filter((i) => typeof i.type === "string" && INVENTORY_ITEM_TYPES.has(i.type))
    .map((it) => {
      const equipped = itemEquipped(it);
      const runeData = itemRunes(it);
      const runes: string[] = [];
      if (runeData) {
        const { potency, striking, resilient } = runeData;
        if (potency !== undefined && potency > 0) runes.push(`+${potency} potency`);
        if (striking !== undefined && striking > 0) runes.push(`striking ${striking}`);
        if (resilient !== undefined && resilient > 0) runes.push(`resilient ${resilient}`);
        runes.push(...runeData.property);
      }
      return {
        id: String(it._id ?? ""),
        name: typeof it.name === "string" ? it.name : "Unnamed",
        type: String(it.type),
        quantity: itemQuantity(it),
        bulk: itemBulk(it),
        carryType: equipped?.carryType,
        invested: equipped?.invested,
        runes: runes.length > 0 ? runes : undefined,
      };
    });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { section: "inventory", items: rows };
}
