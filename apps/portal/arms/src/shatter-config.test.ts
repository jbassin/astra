import { describe, expect, it } from "vitest";

import { FIGHT_DEFAULTS, parseFightFlag, parseShatterFlag, windowEnded } from "./shatter-config";

describe("parseFightFlag", () => {
  it("fills the defaults around the arm list", () => {
    expect(parseFightFlag({ arms: ["a", "b"] })).toEqual({
      arms: ["a", "b"],
      ...FIGHT_DEFAULTS,
      effectUuids: [],
      window: null,
      active: false,
    });
  });

  it.each([undefined, null, "x", {}, { arms: [] }, { arms: [1, ""] }])(
    "is no fight without arm ids: %j",
    (flag) => expect(parseFightFlag(flag)).toBeNull(),
  );

  it("keeps good fields and drops bad ones", () => {
    const fight = parseFightFlag({
      arms: ["a", "a", 3],
      shimmer: 5,
      needed: -1,
      weakness: "10",
      effectUuids: ["u", 4],
      window: { combat: "c", round: 2, turn: 1 },
      active: true,
    });
    expect(fight).toMatchObject({
      arms: ["a"],
      shimmer: 5,
      needed: 3,
      weakness: 10,
      effectUuids: ["u"],
      window: { combat: "c", round: 2, turn: 1 },
      active: true,
    });
  });

  it("ignores a malformed window", () => {
    expect(parseFightFlag({ arms: ["a"], window: { combat: "c", round: "2" } })?.window).toBeNull();
  });
});

describe("parseShatterFlag", () => {
  it("reads only the two known states", () => {
    expect(parseShatterFlag({ state: "shimmer", since: 1 })).toBe("shimmer");
    expect(parseShatterFlag({ state: "shattered" })).toBe("shattered");
    expect(parseShatterFlag({ state: "x" })).toBeUndefined();
    expect(parseShatterFlag(undefined)).toBeUndefined();
  });
});

describe("windowEnded", () => {
  const window = { combat: "c", round: 2, turn: 3 };
  it("ends at the same turn index one round on", () => {
    expect(windowEnded(window, { round: 2, turn: 5 })).toBe(false);
    expect(windowEnded(window, { round: 3, turn: 2 })).toBe(false);
    expect(windowEnded(window, { round: 3, turn: 3 })).toBe(true);
    expect(windowEnded(window, { round: 3, turn: 4 })).toBe(true);
    expect(windowEnded(window, { round: 4, turn: 0 })).toBe(true);
  });
});
