/**
 * Item accessors: physical items, feats, spells and spellcasting entries. Every one reads an
 * item's stored source (`Pf2eSource`, as embedded in an actor's `toObject()` or returned by
 * an item's own `toObject()`), except {@link spellcastingEntryDc}, which also needs the live
 * side because pf2e derives the entry DC.
 */
import {
  at,
  numberOrUndefined,
  type Pf2eSource,
  type Pf2eSystem,
  record,
  recordOrUndefined,
  stringOrUndefined,
  stringsOrUndefined,
} from "./data";

function sys(item: Pf2eSource): Readonly<Record<string, unknown>> {
  return record(item.system);
}

// --- any item ---------------------------------------------------------------------------

/** `system.level.value`: an item's or feat's own level (not the level a feat was taken at). */
export function itemLevel(item: Pf2eSource): number | undefined {
  return numberOrUndefined(at(sys(item), "level.value"));
}

/** `system.traits.value`, string entries only; `undefined` when it is not an array. */
export function itemTraits(item: Pf2eSource): string[] | undefined {
  return stringsOrUndefined(at(sys(item), "traits.value"));
}

/** `system.traits.rarity`. */
export function itemRarity(item: Pf2eSource): string | undefined {
  return stringOrUndefined(at(sys(item), "traits.rarity"));
}

/** `system.description.value` (HTML). */
export function itemDescription(item: Pf2eSource): string | undefined {
  return stringOrUndefined(at(sys(item), "description.value"));
}

// --- physical items ---------------------------------------------------------------------

export const PRICE_DENOMINATIONS = ["pp", "gp", "sp", "cp"] as const;
export type Denomination = (typeof PRICE_DENOMINATIONS)[number];

/** The stored `system.price.value` coins (`{gp: 4}`), numeric denominations only. The live
 * side normalizes this into a coins instance with every denomination present. */
export function itemPrice(item: Pf2eSource): Partial<Record<Denomination, number>> | undefined {
  const value = at(sys(item), "price.value");
  if (!value || typeof value !== "object") return undefined;
  const coins: Partial<Record<Denomination, number>> = {};
  for (const denom of PRICE_DENOMINATIONS) {
    const n = (value as Record<string, unknown>)[denom];
    if (typeof n === "number") coins[denom] = n;
  }
  return coins;
}

/** The stored `system.bulk.value` (`0.1` is light bulk). */
export function itemBulk(item: Pf2eSource): number | undefined {
  return numberOrUndefined(at(sys(item), "bulk.value"));
}

/** `system.quantity`. */
export function itemQuantity(item: Pf2eSource): number | undefined {
  return numberOrUndefined(sys(item).quantity);
}

export interface Pf2eEquipped {
  readonly carryType?: string;
  readonly invested?: boolean;
}

/** `system.equipped`: carry type (`"held"`, `"worn"`, `"stowed"`, ...) and, for an
 * investable item, whether it is invested (`null` in source means "not investable"). */
export function itemEquipped(item: Pf2eSource): Pf2eEquipped | undefined {
  const equipped = recordOrUndefined(sys(item).equipped);
  if (!equipped) return undefined;
  return {
    carryType: stringOrUndefined(equipped.carryType),
    invested: typeof equipped.invested === "boolean" ? equipped.invested : undefined,
  };
}

export interface Pf2eRunes {
  readonly potency?: number;
  readonly striking?: number;
  readonly resilient?: number;
  readonly property: readonly string[];
}

/** `system.runes`: a weapon's potency and striking, an armor's potency and resilient, and
 * either one's property rune slugs. */
export function itemRunes(item: Pf2eSource): Pf2eRunes | undefined {
  const runes = recordOrUndefined(sys(item).runes);
  if (!runes) return undefined;
  return {
    potency: numberOrUndefined(runes.potency),
    striking: numberOrUndefined(runes.striking),
    resilient: numberOrUndefined(runes.resilient),
    property: stringsOrUndefined(runes.property) ?? [],
  };
}

export interface Pf2eDamage {
  readonly dice: number;
  readonly die: string;
  readonly damageType?: string;
}

/** A weapon's base `system.damage` (`{dice: 1, die: "d8", damageType: "slashing"}`). */
export function itemDamage(item: Pf2eSource): Pf2eDamage | undefined {
  const d = recordOrUndefined(sys(item).damage);
  if (!d || typeof d.dice !== "number" || typeof d.die !== "string") return undefined;
  return { dice: d.dice, die: d.die, damageType: stringOrUndefined(d.damageType) };
}

/** An armor's or shield's `system.acBonus`. */
export function itemAcBonus(item: Pf2eSource): number | undefined {
  return numberOrUndefined(sys(item).acBonus);
}

// --- feats ------------------------------------------------------------------------------

/** `system.category` (`"ancestry"`, `"class"`, `"skill"`, `"general"`, `"classfeature"`, ...).
 * This is the feat's kind, not the slot it occupies (that is `system.location`). */
export function featCategory(item: Pf2eSource): string | undefined {
  return stringOrUndefined(sys(item).category);
}

// --- spells -----------------------------------------------------------------------------

/** `system.location.value`: the id of the spellcasting entry the spell belongs to. */
export function spellLocation(item: Pf2eSource): string | undefined {
  return stringOrUndefined(at(sys(item), "location.value"));
}

/** The spell's base rank, `Number(system.level.value ?? 0)`: 1 for a cantrip, and the
 * unheightened rank for a heightened spell (`location.heightenedLevel` is not read). */
export function spellBaseRank(item: Pf2eSource): number {
  return Number(at(sys(item), "level.value") ?? 0);
}

// --- spellcasting entries ---------------------------------------------------------------

/** `system.tradition.value` (`"arcane"`, `"divine"`, `"occult"`, `"primal"`). */
export function entryTradition(entry: Pf2eSource): string | undefined {
  return stringOrUndefined(at(sys(entry), "tradition.value"));
}

/** `system.prepared.value` (`"prepared"`, `"spontaneous"`, `"innate"`, `"focus"`, ...). */
export function entryPreparedType(entry: Pf2eSource): string | undefined {
  return stringOrUndefined(at(sys(entry), "prepared.value"));
}

export interface Pf2eSlot {
  readonly rank: number;
  readonly value?: number;
  readonly max?: number;
  /** The spells prepared in this slot rank, one row per prepared copy. */
  readonly prepared: readonly { readonly id?: string; readonly expended: boolean }[];
}

function toSlot(rank: number, raw: unknown): Pf2eSlot {
  const slot = record(raw);
  const prepared = Array.isArray(slot.prepared) ? slot.prepared : [];
  return {
    rank,
    value: numberOrUndefined(slot.value),
    max: numberOrUndefined(slot.max),
    prepared: prepared.map((p) => {
      const row = record(p);
      return { id: stringOrUndefined(row.id), expended: row.expended === true };
    }),
  };
}

/** Every `system.slots.slot<N>` of an entry, in stored key order. */
export function entrySlots(entry: Pf2eSource): Pf2eSlot[] {
  const slots: Pf2eSlot[] = [];
  for (const [key, raw] of Object.entries(record(sys(entry).slots))) {
    const match = /^slot(\d+)$/.exec(key);
    if (!match?.[1]) continue;
    slots.push(toSlot(Number(match[1]), raw));
  }
  return slots;
}

/** `system.slots.slot<rank>`, or `undefined` when the entry has no such key. */
export function entrySlot(entry: Pf2eSource, rank: number): Pf2eSlot | undefined {
  const raw = record(sys(entry).slots)[`slot${rank}`];
  return raw ? toSlot(rank, raw) : undefined;
}

/** A spellcasting entry's DC. pf2e derives it onto the entry's statistic instance, so the
 * stored `spelldc.dc` is 0 for a prepared caster and the live entry's own `system` usually
 * is too. Preference: the live entry's `spelldc.dc` when positive, then the live actor's
 * `attributes.spellDC.value` when positive, then the stored `spelldc.dc`. */
export function spellcastingEntryDc(
  entry: Pf2eSource,
  liveEntry: Pf2eSystem<"live"> | undefined,
  liveActor: Pf2eSystem<"live"> | undefined,
): number | undefined {
  const liveEntryDc = at(liveEntry ?? {}, "spelldc.dc");
  if (typeof liveEntryDc === "number" && liveEntryDc > 0) return liveEntryDc;
  const actorSpellDc = at(liveActor ?? {}, "attributes.spellDC.value");
  if (typeof actorSpellDc === "number" && actorSpellDc > 0) return actorSpellDc;
  return numberOrUndefined(at(sys(entry), "spelldc.dc"));
}
