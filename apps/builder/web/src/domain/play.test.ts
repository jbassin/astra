import { describe, expect, it } from "vitest";

import { type Answers, PlayState, TRACKER_KEY } from "./character";
import { CONTENT } from "./content";
import { buildCharacter } from "./engine";
import {
  currentHp,
  leftOf,
  slotTracker,
  spellTracker,
  type Tracker,
  trackersOf,
  withHp,
  withLeft,
  withSpent,
} from "./play";

const DONE = { name: "Test", look: "Plain.", personality: "Calm." };
const T: Tracker = { id: "use-rage", label: "Rage", max: 3, unit: "use" };

describe("Hit Points", () => {
  it("are full until marked, and held to 0..max however they were saved", () => {
    expect(currentHp(20, undefined)).toBe(20);
    expect(currentHp(20, {})).toBe(20);
    expect(currentHp(20, { hp: 7 })).toBe(7);
    expect(currentHp(20, { hp: 400 })).toBe(20);
    expect(currentHp(20, { hp: -3 })).toBe(0);
  });

  it("are stored only below the maximum", () => {
    expect(withHp({}, 20, 12)).toEqual({ hp: 12 });
    expect(withHp({ hp: 12 }, 20, 25)).toEqual({});
    expect(withHp({ hp: 12 }, 20, -4)).toEqual({ hp: 0 });
    expect(withHp({ spent: { "use-rage": 1 } }, 20, 20)).toEqual({ spent: { "use-rage": 1 } });
  });
});

describe("trackers", () => {
  it("count what is used, held to 0..max, and drop a tracker back at nothing used", () => {
    expect(leftOf(T, undefined)).toBe(3);
    expect(leftOf(T, { spent: { "use-rage": 2 } })).toBe(1);
    expect(leftOf(T, { spent: { "use-rage": 99 } })).toBe(0);
    expect(withSpent({}, T, 2)).toEqual({ spent: { "use-rage": 2 } });
    expect(withSpent({ spent: { "use-rage": 2 } }, T, 0)).toEqual({});
    expect(withSpent({}, T, 9)).toEqual({ spent: { "use-rage": 3 } });
    expect(withLeft({}, T, 1)).toEqual({ spent: { "use-rage": 2 } });
    expect(withLeft({ spent: { "use-rage": 2 } }, T, 3)).toEqual({});
  });

  it("keep other marks when one changes", () => {
    const play = withSpent({ hp: 5, spent: { slots: 1 } }, T, 1);
    expect(play).toEqual({ hp: 5, spent: { slots: 1, "use-rage": 1 } });
  });
});

describe("every tracker of every character", () => {
  const ids = new Set<string>();
  let most = 0;
  let slotBlocks = 0;
  for (const cls of Object.values(CONTENT.classes)) {
    for (const sp of Object.values(CONTENT.species)) {
      for (const bg of cls.backgrounds) {
        const answers: Answers = {
          archetype: cls.archetype,
          classId: cls.id,
          speciesId: sp.id,
          backgroundId: bg,
          ...DONE,
        };
        const c = buildCharacter(answers);
        const trackers = trackersOf(c);
        most = Math.max(most, trackers.length);
        slotBlocks = Math.max(slotBlocks, c.spellcasting.filter((b) => slotTracker(b)).length);
        const seen = new Set<string>();
        for (const t of trackers) {
          ids.add(t.id);
          expect(seen.has(t.id), `${cls.id} ${sp.id} ${bg}: ${t.id} twice`).toBe(false);
          seen.add(t.id);
          expect(t.max).toBeGreaterThan(0);
        }
      }
    }
  }

  it("have ids that fit the saved key pattern", () => {
    expect(ids.size).toBeGreaterThan(20);
    for (const id of ids) expect(TRACKER_KEY.test(id), id).toBe(true);
  });

  it("stay under the saved key limit, and only one block has spell slots", () => {
    expect(most).toBeLessThanOrEqual(60);
    expect(slotBlocks).toBeLessThanOrEqual(1);
  });

  it("make a play state the server accepts when everything is used", () => {
    const c = buildCharacter({
      archetype: "mage",
      classId: "wizard",
      speciesId: "human",
      backgroundId: "sage",
      ...DONE,
    });
    let play = {};
    for (const t of trackersOf(c)) play = withSpent(play, t, t.max);
    expect(PlayState.safeParse(play).success).toBe(true);
  });

  it("name a spell tracker only for a spell with free casts and no cost", () => {
    const c = buildCharacter({
      archetype: "scoundrel",
      classId: "ranger",
      speciesId: "human",
      backgroundId: "wayfarer",
      ...DONE,
    });
    const spells = c.spellcasting.flatMap((b) => [...b.cantrips, ...b.spells]);
    const marks = spells.map((s) => spellTracker(s)?.id);
    expect(marks).toContain("cast-hunters-mark");
    expect(spells.filter((s) => s.level === 0 && spellTracker(s))).toEqual([]);
    expect(c.spellcasting.map((b) => slotTracker(b)?.id)).toContain("slots");
  });
});

describe("PlayState", () => {
  it("is strict and bounded", () => {
    expect(PlayState.safeParse({ hp: 12, spent: { slots: 1 } }).success).toBe(true);
    expect(PlayState.safeParse({ hp: -1 }).success).toBe(false);
    expect(PlayState.safeParse({ hp: 1000 }).success).toBe(false);
    expect(PlayState.safeParse({ hp: 1.5 }).success).toBe(false);
    expect(PlayState.safeParse({ spent: { "Bad Key": 1 } }).success).toBe(false);
    expect(PlayState.safeParse({ spent: { slots: 100 } }).success).toBe(false);
    expect(PlayState.safeParse({ extra: 1 }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 61 }, (_, n) => [`k${n}`, 1]));
    expect(PlayState.safeParse({ spent: many }).success).toBe(false);
  });
});
