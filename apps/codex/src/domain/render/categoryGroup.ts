/**
 * D29-26 — which page-shape group a category belongs to. `category` is a
 * free string on `CodexEntity` (the join owns the authoritative list,
 * `entity.ts`'s own file comment) — this is P2's own small, closed mapping
 * from that string to one of the five rendering groups the spec names.
 */
export type CategoryGroup = "creature" | "hazard" | "spell" | "equipment" | "feat" | "generic";

const EQUIPMENT_CATEGORIES: ReadonlySet<string> = new Set([
  "weapon",
  "armor",
  "shield",
  "equipment",
  "consumable",
  "treasure",
]);

export function categoryGroupOf(category: string): CategoryGroup {
  if (category === "creature") return "creature";
  if (category === "hazard") return "hazard";
  if (category === "spell") return "spell";
  if (category === "feat") return "feat";
  if (EQUIPMENT_CATEGORIES.has(category)) return "equipment";
  return "generic";
}
