import { describe, expect, it } from "vitest";

import type { ClassStats } from "../../schema/entity";
import type { CodexNode, InlineNode } from "../../schema/nodes";
import {
  buildProgressionRows,
  cadenceLabelsAtLevel,
  isClassProgressionTable,
  rankLabel,
  stripClassProgressionTable,
} from "./classProgression";

describe("rankLabel (D29-119) — the 0..4 proficiency rank display mapping", () => {
  it("maps every real rank value", () => {
    expect(rankLabel(0)).toBe("Untrained");
    expect(rankLabel(1)).toBe("Trained");
    expect(rankLabel(2)).toBe("Expert");
    expect(rankLabel(3)).toBe("Master");
    expect(rankLabel(4)).toBe("Legendary");
  });

  it("degrades fail-soft for an out-of-range rank rather than throwing", () => {
    expect(rankLabel(9)).toBe("Rank 9");
  });
});

const FEAT_LEVELS: ClassStats["featLevels"] = {
  classFeat: [1, 2, 4, 6],
  ancestryFeat: [1, 5],
  skillFeat: [2, 4, 6],
  generalFeat: [3, 7],
  skillIncrease: [3, 5, 7],
};

describe("cadenceLabelsAtLevel (D29-119)", () => {
  it("a level with multiple simultaneous cadence entries returns all of them, lowercase", () => {
    expect(cadenceLabelsAtLevel(FEAT_LEVELS, 1)).toEqual(["class feat", "ancestry feat"]);
  });

  it("a level with one cadence entry", () => {
    expect(cadenceLabelsAtLevel(FEAT_LEVELS, 2)).toEqual(["class feat", "skill feat"]);
  });

  it("a level with zero cadence entries returns an empty array", () => {
    expect(cadenceLabelsAtLevel(FEAT_LEVELS, 20)).toEqual([]);
  });

  it("never assumes a standard cadence — an irregular array (swashbuckler-shaped) still matches exactly", () => {
    const irregular: ClassStats["featLevels"] = {
      classFeat: [],
      ancestryFeat: [],
      skillFeat: [2, 3, 6, 10, 11, 14, 18, 19],
      generalFeat: [],
      skillIncrease: [],
    };
    expect(cadenceLabelsAtLevel(irregular, 3)).toEqual(["skill feat"]);
    expect(cadenceLabelsAtLevel(irregular, 4)).toEqual([]);
  });
});

describe("buildProgressionRows (D29-119)", () => {
  const stats: Pick<ClassStats, "grantedFeatures" | "featLevels"> = {
    grantedFeatures: [
      { level: 1, name: "Reactive Strike", targetId: "class-feature/reactive-strike" },
      { level: 1, name: "Shield Block", targetId: "class-feature/shield-block" },
      { level: 3, name: "Bravery", targetId: "class-feature/bravery" },
    ],
    featLevels: FEAT_LEVELS,
  };

  it("always emits rows 1-20, even when neither a grant nor a cadence entry fires", () => {
    const rows = buildProgressionRows(stats);
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // level 20: no grant, no cadence entry in this fixture's own featLevels.
    const row20 = rows.find((r) => r.level === 20);
    expect(row20?.grants).toEqual([]);
    expect(row20?.cadence).toEqual([]);
  });

  it("groups grants by their OWN level field, preserving (level, name) order", () => {
    const rows = buildProgressionRows(stats);
    const row1 = rows.find((r) => r.level === 1);
    expect(row1?.grants.map((g) => g.name)).toEqual(["Reactive Strike", "Shield Block"]);
    const row3 = rows.find((r) => r.level === 3);
    expect(row3?.grants.map((g) => g.name)).toEqual(["Bravery"]);
    expect(row3?.cadence).toEqual(["general feat", "skill increase"]);
  });

  it("the D29-114 targetId:null stub still appears in its own level's row (never dropped)", () => {
    const withStub: Pick<ClassStats, "grantedFeatures" | "featLevels"> = {
      grantedFeatures: [
        { level: 1, name: "Doctrine", targetId: "class-feature/doctrine" },
        { level: 1, name: "First Doctrine", targetId: null },
      ],
      featLevels: FEAT_LEVELS,
    };
    const rows = buildProgressionRows(withStub);
    const row1 = rows.find((r) => r.level === 1);
    expect(row1?.grants.map((g) => g.name)).toEqual(["Doctrine", "First Doctrine"]);
    expect(row1?.grants.find((g) => g.name === "First Doctrine")?.targetId).toBeNull();
  });

  it("absent grantedFeatures (a class mapped to zero grants — shouldn't happen live, belt-and-braces) never throws", () => {
    const rows = buildProgressionRows({ grantedFeatures: undefined, featLevels: FEAT_LEVELS });
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.grants.length === 0)).toBe(true);
  });
});

function textNode(content: string): InlineNode {
  return { kind: "text", content, marks: { bold: false, italic: false, superscript: false } };
}

describe("isClassProgressionTable / stripClassProgressionTable (D29-119)", () => {
  const progressionTable: CodexNode = {
    kind: "table",
    rows: [
      { header: true, cells: [[textNode("Your Level")], [textNode("Class Features")]] },
      { header: false, cells: [[textNode("1st")], [textNode("Key Ability")]] },
    ],
  };

  it("matches the exact ['Your Level', 'Class Features'] header row", () => {
    expect(isClassProgressionTable(progressionTable)).toBe(true);
  });

  it("does not match a table whose header row has different text", () => {
    const other: CodexNode = {
      kind: "table",
      rows: [{ header: true, cells: [[textNode("Level")], [textNode("Feature")]] }],
    };
    expect(isClassProgressionTable(other)).toBe(false);
  });

  it("does not match a table with no header row at all", () => {
    const noHeader: CodexNode = {
      kind: "table",
      rows: [{ header: false, cells: [[textNode("Your Level")], [textNode("Class Features")]] }],
    };
    expect(isClassProgressionTable(noHeader)).toBe(false);
  });

  it("does not match a non-table node", () => {
    expect(isClassProgressionTable(textNode("Your Level"))).toBe(false);
  });

  it("matches when the two-cell header row appears anywhere in a multi-row table (per-row header flag)", () => {
    const midTable: CodexNode = {
      kind: "table",
      rows: [
        { header: false, cells: [[textNode("proem")], [textNode("proem")]] },
        { header: true, cells: [[textNode("Your Level")], [textNode("Class Features")]] },
      ],
    };
    expect(isClassProgressionTable(midTable)).toBe(true);
  });

  it("stripClassProgressionTable removes exactly the matching table(s), reporting the count", () => {
    const paragraph: CodexNode = { kind: "paragraph", children: [textNode("hello")] };
    const body = [paragraph, progressionTable, paragraph];
    const { body: stripped, suppressedCount } = stripClassProgressionTable(body);
    expect(suppressedCount).toBe(1);
    expect(stripped).toEqual([paragraph, paragraph]);
  });

  it("a body with zero matching tables reports suppressedCount 0 and returns the body untouched", () => {
    const paragraph: CodexNode = { kind: "paragraph", children: [textNode("hello")] };
    const { body: stripped, suppressedCount } = stripClassProgressionTable([paragraph]);
    expect(suppressedCount).toBe(0);
    expect(stripped).toEqual([paragraph]);
  });
});
