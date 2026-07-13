import { describe, expect, it } from "vitest";

import { dedupeAonMetas } from "./aonDedup";
import type { AonDocMeta } from "./aonFacets";

function meta(
  overrides: Partial<AonDocMeta> & Pick<AonDocMeta, "aonId" | "category" | "name" | "slug">,
): AonDocMeta {
  return {
    aonUrl: `/Test.aspx?ID=${overrides.aonId}`,
    traits: [],
    primarySource: { book: "Test Book" },
    allSources: [{ book: "Test Book" }],
    license: "ORC",
    edition: "remaster",
    remasterId: [],
    legacyId: [],
    hasMarkdown: false,
    ...overrides,
  };
}

function collector(): { reports: string[]; report: (cls: string, detail: string) => void } {
  const reports: string[] = [];
  return { reports, report: (cls, detail) => reports.push(`${cls}: ${detail}`) };
}

describe("dedupeAonMetas (D29-18)", () => {
  it("passes non-duplicate metas through unchanged", () => {
    const a = meta({ aonId: "equipment-1", category: "equipment", name: "Sword", slug: "sword" });
    const b = meta({ aonId: "equipment-2", category: "equipment", name: "Shield", slug: "shield" });
    const { report } = collector();
    const result = dedupeAonMetas([a, b], report);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.aonId).sort()).toEqual(["equipment-1", "equipment-2"]);
  });

  it("real shape: a page-owner parent + its base-tier child (same name/slug/url/edition) collapse to the exact-id-reconstruction winner", () => {
    // equipment-4778 ("Accursed Staff") is the page owner: its OWN id
    // reconstructs `equipment-4778` from the url's `?ID=4778` exactly.
    const parent = meta({
      aonId: "equipment-4778",
      category: "equipment",
      name: "Accursed Staff",
      slug: "accursed-staff",
      aonUrl: "/Equipment.aspx?ID=4778",
      hasMarkdown: true,
    });
    const child = meta({
      aonId: "equipment-4778-4291",
      category: "equipment",
      name: "Accursed Staff",
      slug: "accursed-staff",
      aonUrl: "/Equipment.aspx?ID=4778",
      hasMarkdown: true,
    });
    const { reports, report } = collector();
    const result = dedupeAonMetas([child, parent], report); // input order shouldn't matter
    expect(result.map((m) => m.aonId)).toEqual(["equipment-4778"]);
    expect(reports.some((r) => r.includes("aonUrlDuplicateCollapsed"))).toBe(true);
    expect(reports[0]).toContain("kept equipment-4778");
    expect(reports[0]).toContain("dropped equipment-4778-4291");
  });

  it("falls back to hasMarkdown then smallest aonId when no id reconstructs the url's query id", () => {
    const noMd = meta({
      aonId: "item-bonus-999",
      category: "item-bonus",
      name: "Aeon Stone (Orange Prism)",
      slug: "aeon-stone-orange-prism",
      aonUrl: "/Equipment.aspx?ID=407",
      hasMarkdown: false,
    });
    const withMd1 = meta({
      aonId: "equipment-407-489-bonus-128",
      category: "item-bonus",
      name: "Aeon Stone (Orange Prism)",
      slug: "aeon-stone-orange-prism",
      aonUrl: "/Equipment.aspx?ID=407",
      hasMarkdown: true,
    });
    const withMd2 = meta({
      aonId: "equipment-407-489-bonus-127",
      category: "item-bonus",
      name: "Aeon Stone (Orange Prism)",
      slug: "aeon-stone-orange-prism",
      aonUrl: "/Equipment.aspx?ID=407",
      hasMarkdown: true,
    });
    const { report } = collector();
    const result = dedupeAonMetas([noMd, withMd1, withMd2], report);
    // no aonId equals "item-bonus-407" (the reconstruction rule finds
    // nothing) -> falls back to hasMarkdown (drops noMd) -> smallest aonId
    // among the two markdown-bearing docs.
    expect(result.map((m) => m.aonId)).toEqual(["equipment-407-489-bonus-127"]);
  });

  it("does NOT collapse docs sharing category+slug but a DIFFERENT aonUrl (genuine distinct reprints)", () => {
    const bookA = meta({
      aonId: "creature-622",
      category: "creature",
      name: "Adult Brine Dragon",
      slug: "adult-brine-dragon",
      aonUrl: "/Monsters.aspx?ID=622",
    });
    const bookB = meta({
      aonId: "creature-4120",
      category: "creature",
      name: "Adult Brine Dragon",
      slug: "adult-brine-dragon",
      aonUrl: "/Monsters.aspx?ID=4120",
    });
    const { report } = collector();
    const result = dedupeAonMetas([bookA, bookB], report);
    expect(result.map((m) => m.aonId).sort()).toEqual(["creature-4120", "creature-622"]);
  });

  it("does NOT collapse docs sharing category+slug+url but a DIFFERENT edition", () => {
    const legacy = meta({
      aonId: "spell-1",
      category: "spell",
      name: "Heal",
      slug: "heal",
      aonUrl: "/Spells.aspx?ID=1",
      edition: "legacy",
    });
    const remaster = meta({
      aonId: "spell-2",
      category: "spell",
      name: "Heal",
      slug: "heal",
      aonUrl: "/Spells.aspx?ID=1",
      edition: "remaster",
    });
    const { report } = collector();
    const result = dedupeAonMetas([legacy, remaster], report);
    expect(result.map((m) => m.aonId).sort()).toEqual(["spell-1", "spell-2"]);
  });

  it("is deterministic regardless of input order (sorted by category/slug/aonId)", () => {
    const a = meta({ aonId: "equipment-2", category: "equipment", name: "B", slug: "b" });
    const b = meta({ aonId: "equipment-1", category: "equipment", name: "A", slug: "a" });
    const { report } = collector();
    const result1 = dedupeAonMetas([a, b], report);
    const result2 = dedupeAonMetas([b, a], report);
    expect(result1.map((m) => m.aonId)).toEqual(result2.map((m) => m.aonId));
    expect(result1.map((m) => m.aonId)).toEqual(["equipment-1", "equipment-2"]);
  });
});
