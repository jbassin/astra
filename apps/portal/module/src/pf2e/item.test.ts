import { describe, expect, it } from "vitest";

import {
  entryPreparedType,
  entrySlot,
  entrySlots,
  entryTradition,
  featCategory,
  itemAcBonus,
  itemBulk,
  itemDamage,
  itemDescription,
  itemEquipped,
  itemLevel,
  itemPrice,
  itemQuantity,
  itemRarity,
  itemRunes,
  itemTraits,
  liveSystem,
  type Pf2eSource,
  type Pf2eSystem,
  sourceItems,
  sourceOf,
  spellBaseRank,
  spellcastingEntryDc,
  spellLocation,
} from ".";
import { fixtureDocument } from "./testFixtures";

const weapon = fixtureDocument("item");
const spell = fixtureDocument("spell");
const feat = fixtureDocument("feat");
const pc = fixtureDocument("pc");
const pcItems = sourceItems(sourceOf(pc));
const byName = (name: string): Pf2eSource => {
  const item = pcItems.find((i) => i.name === name);
  if (!item) throw new Error(`no ${name} in the pc fixture`);
  return item;
};

/** Brands a hand-written item source, for the shape-edge tests. */
function itemWith(system: unknown): Pf2eSource {
  return { system } as unknown as Pf2eSource;
}

describe("item accessors", () => {
  it("read a weapon's stored fields", () => {
    const src = sourceOf(weapon);
    expect(itemLevel(src)).toBe(0);
    expect(itemTraits(src)).toEqual(["two-hand-d12"]);
    expect(itemRarity(src)).toBe("common");
    expect(itemDescription(src)).toMatch(/^<p>This broad-bladed sword/);
    expect(itemPrice(src)).toEqual({ gp: 4 });
    expect(itemBulk(src)).toBe(1);
    expect(itemQuantity(src)).toBe(1);
    expect(itemEquipped(src)).toEqual({ carryType: "held", invested: undefined });
    expect(itemRunes(src)).toEqual({
      potency: 0,
      striking: 0,
      resilient: undefined,
      property: [],
    });
    expect(itemDamage(src)).toEqual({ dice: 1, die: "d8", damageType: "slashing" });
    expect(itemAcBonus(src)).toBeUndefined();
  });

  it("read the stored price and bulk, not the live normalized ones", () => {
    const live = liveSystem(weapon) as Pf2eSystem<"live">;
    // The live side normalizes price into every denomination; the source keeps the stored one.
    expect((live.price as { value: unknown }).value).toEqual({ pp: 0, gp: 4, sp: 0, cp: 0 });
    expect(itemPrice(sourceOf(weapon))).toEqual({ gp: 4 });
  });

  it("read armor, worn gear and consumables from the pc fixture", () => {
    expect(itemAcBonus(byName("Breastplate"))).toBe(4);
    expect(itemRunes(byName("Breastplate"))?.resilient).toBe(0);
    expect(itemEquipped(byName("Healer's Gloves"))).toEqual({ carryType: "worn", invested: true });
    expect(itemQuantity(byName("Healing Potion (Lesser)"))).toBe(4);
    expect(itemBulk(byName("Healing Potion (Lesser)"))).toBe(0.1);
  });

  it("tolerate missing and wrong-shaped fields", () => {
    expect(itemPrice(itemWith({ price: { value: { gp: "4", sp: 5 } } }))).toEqual({ sp: 5 });
    expect(itemPrice(itemWith({ price: { value: null } }))).toBeUndefined();
    expect(itemDamage(itemWith({ damage: { dice: 1 } }))).toBeUndefined();
    expect(itemRunes(itemWith({ runes: { property: ["flaming", 2] } }))?.property).toEqual([
      "flaming",
    ]);
    expect(itemTraits(itemWith({ traits: { value: "x" } }))).toBeUndefined();
    expect(itemLevel(itemWith(null))).toBeUndefined();
    expect(itemEquipped(itemWith({}))).toBeUndefined();
  });
});

describe("feat accessors", () => {
  it("read the feat's category and its own level, not the level it was taken at", () => {
    const src = sourceOf(feat);
    expect(src.name).toBe("Healing Hands");
    expect(featCategory(src)).toBe("class");
    expect(itemLevel(src)).toBe(1);
    expect((src.system as { level: { taken: number } }).level.taken).toBe(2);
  });
});

describe("spell accessors", () => {
  it("read the location and the base rank, ignoring heightenedLevel", () => {
    const src = sourceOf(spell);
    expect(spellLocation(src)).toBe("x5lFsoMiPepDzIix");
    expect(spellBaseRank(src)).toBe(1);
    expect(itemTraits(src)).toEqual(["healing", "manipulate", "vitality"]);
    expect(spellBaseRank(itemWith({}))).toBe(0);
  });
});

describe("spellcasting entry accessors", () => {
  const prepared = byName("Cleric Spells");
  const innate = byName("Cleric Font");

  it("read tradition and prepared type", () => {
    expect(entryTradition(prepared)).toBe("divine");
    expect(entryPreparedType(prepared)).toBe("prepared");
    expect(entryPreparedType(innate)).toBe("innate");
  });

  it("entrySlots lists every slotN in key order with its prepared copies", () => {
    const slots = entrySlots(prepared);
    expect(slots.map((s) => s.rank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const slot3 = slots[3];
    expect(slot3?.max).toBe(3);
    // Holy Light is prepared twice at rank 3.
    expect(slot3?.prepared.filter((p) => p.id === "G3FjGFAgfLELIRgr")).toHaveLength(2);
    expect(entrySlots(itemWith({ slots: { slotx: {}, other: {}, slot2: null } }))).toEqual([
      { rank: 2, value: undefined, max: undefined, prepared: [] },
    ]);
  });

  it("entrySlot looks one rank up", () => {
    expect(entrySlot(prepared, 1)).toMatchObject({ rank: 1, value: 0, max: 3 });
    expect(entrySlot(prepared, 99)).toBeUndefined();
  });

  it("spellcastingEntryDc prefers the live entry, then the live actor, then the source", () => {
    const liveActor = liveSystem(pc);
    const liveEntry = liveSystem(pc.items?.get(String(prepared._id)));
    // The fixture's live entry keeps spelldc.dc at 0, as pf2e does: the actor DC wins.
    expect(spellcastingEntryDc(prepared, liveEntry, liveActor)).toBe(26);
    const tree = (v: Record<string, unknown>): Pf2eSystem<"live"> => v as Pf2eSystem<"live">;
    expect(spellcastingEntryDc(prepared, tree({ spelldc: { dc: 30 } }), liveActor)).toBe(30);
    expect(spellcastingEntryDc(prepared, undefined, undefined)).toBe(0);
    expect(spellcastingEntryDc(itemWith({}), undefined, undefined)).toBeUndefined();
  });
});
