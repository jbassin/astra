import { describe, expect, it } from "vitest";

import { cellText, flattenEntries, slugify, stripTags } from "./markup";

describe("stripTags", () => {
  it.each([
    ["{@spell Fire Bolt|XPHB}", "Fire Bolt"],
    ["8 {@item Javelin|XPHB|Javelins}", "8 Javelins"],
    ["takes {@damage 1d10} Fire damage", "takes 1d10 Fire damage"],
    ["a {@dice d20}", "a d20"],
    ["{@dice 1d20+5|+5}", "+5"],
    ["{@dc 15} Intelligence", "DC 15 Intelligence"],
    ["{@hit 5} to hit", "+5 to hit"],
    ["{@variantrule weapon mastery properties|XPHB|mastery properties}", "mastery properties"],
    ["{@filter Fighting Style feat|feats|category=FS}", "Fighting Style feat"],
    ["{@book chapter 2|XPHB|2|Choose Languages}", "chapter 2"],
    ["{@itemProperty 2H|XPHB|Two-Handed}", "Two-Handed"],
    ["{@classFeature Rage|Barbarian|XPHB|1|raging}", "raging"],
    ["{@i Choose A or B:} (A)", "Choose A or B: (A)"],
    ["{@recharge 5}", "(Recharge 5–6)"],
    ["{@chance 50}", "50 percent"],
    ["{@scaledamage 2d6|1-9|1d6}", "1d6"],
    ["{@b {@spell Light|XPHB}} spell", "Light spell"],
    ["no tags at all", "no tags at all"],
  ])("%s → %s", (input, expected) => {
    expect(stripTags(input)).toBe(expected);
  });

  it("turns non-breaking spaces into plain ones", () => {
    expect(stripTags("Range 20/60 ft.")).toBe("Range 20/60 ft.");
  });
});

describe("flattenEntries", () => {
  it("prefixes named blocks, bullets lists and drops sidebars", () => {
    const out = flattenEntries([
      "You can enter a {@variantrule Rage|XPHB}.",
      { type: "entries", name: "Damage Resistance", entries: ["You have Resistance."] },
      {
        type: "list",
        items: ["Make an attack roll.", { type: "item", name: "Dash:", entries: ["Go fast."] }],
      },
      { type: "inset", name: "Sidebar", entries: ["Flavour."] },
      { type: "refClassFeature", classFeature: "Thing|Monk|XPHB|1" },
    ]);
    expect(out).toEqual([
      "You can enter a Rage.",
      "Damage Resistance. You have Resistance.",
      "• Make an attack roll.",
      "• Dash: Go fast.",
    ]);
  });

  it("writes a table as one line per row", () => {
    const out = flattenEntries([
      {
        type: "table",
        colLabels: ["Dragon", "Damage Type"],
        rows: [
          ["Black", "Acid"],
          ["{@b Red}", "Fire"],
        ],
      },
    ]);
    expect(out).toEqual(["Dragon | Damage Type", "Black | Acid", "Red | Fire"]);
  });
});

describe("cellText", () => {
  it("formats class-table cells", () => {
    expect(cellText({ type: "dice", toRoll: [{ number: 1, faces: 6 }] })).toBe("1d6");
    expect(cellText({ type: "bonus", value: 2 })).toBe("+2");
    expect(cellText({ type: "bonusSpeed", value: 10 })).toBe("+10 ft.");
    expect(cellText(3)).toBe("3");
    expect(cellText("{@filter 1/4|bestiary}")).toBe("1/4");
  });
});

describe("slugify", () => {
  it("makes stable ids", () => {
    expect(slugify("Tasha's Hideous Laughter")).toBe("tashas-hideous-laughter");
    expect(slugify("Hunter’s Mark")).toBe("hunters-mark");
    expect(slugify("Arrows (20)")).toBe("arrows-20");
  });
});
