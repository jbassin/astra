import { describe, expect, it } from "vitest";

import {
  actorAlliance,
  actorBiography,
  actorHeroPoints,
  actorHp,
  actorLanguages,
  actorLevel,
  actorXp,
  familiarMasterId,
  firstItemName,
  isDerivedPcPath,
  liveNumberAt,
  liveSkills,
  liveSystem,
  partyMemberUuids,
  type Pf2eSource,
  type Pf2eSystem,
  sourceItems,
  sourceOf,
  sourceSystem,
} from ".";
import { fixtureDocument } from "./testFixtures";

const pc = fixtureDocument("pc");
const npc = fixtureDocument("npc");
const pcSource = sourceSystem(sourceOf(pc));
const pcLive = liveSystem(pc) as Pf2eSystem<"live">;
const npcSource = sourceSystem(sourceOf(npc));
const npcLive = liveSystem(npc) as Pf2eSystem<"live">;

/** Brands a hand-written object as one side, for the shape-edge tests. */
function tree<S extends "source" | "live">(value: Record<string, unknown>): Pf2eSystem<S> {
  return value as Pf2eSystem<S>;
}

describe("pf2e sides", () => {
  it("sourceOf returns a fresh toObject() and liveSystem the prepared tree", () => {
    expect(sourceOf(pc)).not.toBe(sourceOf(pc));
    expect(pcLive).toBe(pc.system);
    expect(liveSystem(undefined)).toBeUndefined();
  });

  it("sourceSystem and sourceItems tolerate a source with neither", () => {
    const bare = { _id: "x" } as unknown as Pf2eSource;
    expect(sourceSystem(bare)).toEqual({});
    expect(sourceItems(bare)).toEqual([]);
    expect(sourceItems(sourceOf(pc)).map((i) => i.type)).toContain("spellcastingEntry");
  });
});

describe("actor accessors", () => {
  it("actorLevel reads the stored level on either side", () => {
    expect(actorLevel(pcSource)).toBe(8);
    expect(actorLevel(pcLive)).toBe(8);
    expect(actorLevel(npcSource)).toBe(-1);
    expect(actorLevel(tree({ details: { level: { value: "8" } } }))).toBeUndefined();
  });

  it("actorHp: a PC's max exists only live; an NPC stores it", () => {
    expect(actorHp(pcSource)).toEqual({ value: 100, max: undefined, temp: 0 });
    expect(actorHp(pcLive)).toEqual({ value: 100, max: 118, temp: 0 });
    expect(actorHp(npcSource)).toEqual({ value: 6, max: 6, temp: 0 });
    expect(actorHp(npcLive)?.max).toBe(6);
    expect(actorHp(tree({}))).toBeUndefined();
  });

  it("actorXp reads {value, max}", () => {
    expect(actorXp(pcSource)).toEqual({ value: 0, max: 1000 });
    expect(actorXp(npcSource)).toBeUndefined();
  });

  it("actorHeroPoints reads the source; the live value is zeroed by data prep", () => {
    expect(actorHeroPoints(pcSource)).toEqual({ value: 1, max: 3 });
    // The trap the accessor exists for: the live side says 0/0.
    expect(at(pcLive, ["resources", "heroPoints"])).toEqual({ value: 0, max: 0 });
    // A source with a resources block never consults the fallback.
    expect(actorHeroPoints(pcSource, pcLive)).toEqual({ value: 1, max: 3 });
    // Only a source without one (a familiar) falls back.
    expect(
      actorHeroPoints(tree({}), tree({ resources: { heroPoints: { value: 2, max: 3 } } })),
    ).toEqual({ value: 2, max: 3 });
    expect(actorHeroPoints(npcSource)).toBeUndefined();
  });

  it("actorLanguages, actorAlliance and familiarMasterId read stored details", () => {
    expect(actorLanguages(pcSource)).toEqual(["chthonian"]);
    expect(actorLanguages(tree({ details: { languages: { value: ["a", 3, "b"] } } }))).toEqual([
      "a",
      "b",
    ]);
    expect(actorAlliance(pcSource)).toBe("party");
    expect(familiarMasterId(pcSource)).toBeUndefined();
    expect(familiarMasterId(tree({ master: { id: "W2dpWihnH1lli52S" } }))).toBe("W2dpWihnH1lli52S");
  });

  it("partyMemberUuids keeps string uuids only", () => {
    const party = tree<"source">({
      details: { members: [{ uuid: "Actor.a" }, null, 3, { uuid: 7 }, { uuid: "Actor.b" }] },
    });
    expect(partyMemberUuids(party)).toEqual(["Actor.a", "Actor.b"]);
    expect(partyMemberUuids(tree({}))).toEqual([]);
  });

  it("firstItemName finds the first embedded item of a type", () => {
    const src = sourceOf(pc);
    expect(firstItemName(src, "ancestry")).toBe("Elf");
    expect(firstItemName(src, "class")).toBe("Cleric");
    expect(firstItemName(src, "deity")).toBe("The Judge of Ages");
    expect(firstItemName(src, "vehicle")).toBeUndefined();
  });

  it("liveNumberAt reads derived stats that the source lacks", () => {
    expect(liveNumberAt(pcLive, "attributes.ac.value")).toBe(25);
    expect(liveNumberAt(pcLive, "saves.will.dc")).toBe(27);
    expect(liveNumberAt(pcLive, "abilities.wis.mod")).toBe(4);
    expect(liveNumberAt(pcLive, "attributes.spellDC.value")).toBe(26);
    expect(liveNumberAt(pcLive, "attributes.nope.value")).toBeUndefined();
    expect(liveNumberAt(undefined, "attributes.ac.value")).toBeUndefined();
    // The PC source has `abilities: null` and no totals.
    expect(pcSource.abilities).toBeNull();
  });

  it("liveSkills returns the live totals and lore skills, skipping non-objects", () => {
    const skills = liveSkills(pcLive);
    expect(skills.find((s) => s.slug === "religion")).toEqual({
      slug: "religion",
      label: "Religion",
      rank: 3,
      value: 18,
      dc: 28,
      lore: false,
    });
    expect(skills.find((s) => s.slug === "scribing")?.lore).toBe(true);
    expect(liveSkills(tree({ skills: { a: null, b: 3, c: { rank: 1 } } }))).toEqual([
      { slug: "c", label: undefined, rank: 1, value: undefined, dc: undefined, lore: false },
    ]);
    expect(liveSkills(undefined)).toEqual([]);
  });

  it("actorBiography applies pf2e's visibility defaults when a flag is missing", () => {
    const bio = actorBiography(pcSource);
    expect(bio.appearance).toBe("");
    expect(bio.visible("appearance")).toBe(true);
    expect(bio.visible("backstory")).toBe(false);
    const toggled = actorBiography(
      tree({
        details: {
          biography: { backstory: "x", visibility: { backstory: true, appearance: "yes" } },
        },
      }),
    );
    expect(toggled.backstory).toBe("x");
    expect(toggled.visible("backstory")).toBe(true);
    expect(toggled.visible("appearance")).toBe(true);
    expect(actorBiography(tree({})).visible("campaign")).toBe(false);
  });

  it("isDerivedPcPath matches the derived PC paths on segment boundaries", () => {
    expect(isDerivedPcPath("system.saves.fortitude.value")).toBe(true);
    expect(isDerivedPcPath("system.attributes.ac")).toBe(true);
    expect(isDerivedPcPath("system.perceptionFoo")).toBe(false);
    expect(isDerivedPcPath("system.details.level.value")).toBe(false);
  });
});

function at(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((cur, key) => (cur as Record<string, unknown>)[key], value);
}
