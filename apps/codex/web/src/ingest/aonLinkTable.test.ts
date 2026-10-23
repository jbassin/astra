import { describe, expect, it } from "vitest";

import {
  buildAonLinkTable,
  createLinkResolver,
  looksExternal,
  normalizeUrlKey,
} from "./aonLinkTable";
import type { LinkTableDoc } from "./aonLinkTable";

function doc(
  aonId: string,
  category: string,
  slug: string,
  name: string,
  aonUrl: string,
): LinkTableDoc {
  return { aonId, category, slug, name, aonUrl };
}

function makeReports(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

describe("buildAonLinkTable: unique urls", () => {
  it("maps a single doc's url straight to its codex id", () => {
    const { report } = makeReports();
    const table = buildAonLinkTable(
      [doc("spell-180", "spell", "magic-missile", "Magic Missile", "/Spells.aspx?ID=180")],
      report,
    );
    expect(table.byUrl.get("/spells.aspx?id=180")).toEqual({
      codexId: "spell/magic-missile",
      name: "Magic Missile",
      aonId: "spell-180",
    });
  });
});

describe("buildAonLinkTable: the tiered-variant collision (real Scroll-family shape)", () => {
  it("picks the parent doc whose own id reconstructs the url's ?ID=, not a tier sub-entry", () => {
    const { reports, report } = makeReports();
    const table = buildAonLinkTable(
      [
        doc("equipment-640", "equipment", "scroll", "Scroll", "/Equipment.aspx?ID=640"),
        doc(
          "equipment-640-639",
          "equipment",
          "1st-level-scroll",
          "1st-Level Scroll",
          "/Equipment.aspx?ID=640",
        ),
        doc(
          "equipment-640-648",
          "equipment",
          "10th-level-scroll",
          "10th-Level Scroll",
          "/Equipment.aspx?ID=640",
        ),
      ],
      report,
    );
    expect(table.byUrl.get("/equipment.aspx?id=640")).toEqual({
      codexId: "equipment/scroll",
      name: "Scroll",
      aonId: "equipment-640",
    });
    // Collision is reported (informational) but NOT ambiguous — the exact-id
    // rule cleanly picked one winner.
    expect(reports.some((r) => r.cls === "duplicateUrlCollision")).toBe(true);
    expect(reports.some((r) => r.cls === "duplicateUrlAmbiguous")).toBe(false);
  });
});

describe("buildAonLinkTable: the sidebar-demotion collision (real archetype+sidebar shape)", () => {
  it("prefers the non-sidebar doc when both ids exact-match the url's ?ID=", () => {
    const { report } = makeReports();
    const table = buildAonLinkTable(
      [
        doc("archetype-187", "archetype", "alter-ego", "Alter Ego", "/Archetypes.aspx?ID=187"),
        doc(
          "sidebar-1829",
          "sidebar",
          "alter-egos-in-golarion",
          "Alter Egos in Golarion",
          "/Archetypes.aspx?ID=187",
        ),
      ],
      report,
    );
    expect(table.byUrl.get("/archetypes.aspx?id=187")).toEqual({
      codexId: "archetype/alter-ego",
      name: "Alter Ego",
      aonId: "archetype-187",
    });
  });
});

describe("buildAonLinkTable: the genuinely ambiguous collision (real bloodline/draconic-exemplar shape)", () => {
  it("deterministically demotes the auxiliary category and reports duplicateUrlAmbiguous", () => {
    const { reports, report } = makeReports();
    const table = buildAonLinkTable(
      [
        doc("bloodline-23", "bloodline", "draconic", "Draconic", "/Bloodlines.aspx?ID=23"),
        // draconic-exemplar-23 ("Phase") coincidentally shares the numeric id 23
        // with the bloodline's own url ?ID=23 — both exact-id-match.
        doc(
          "draconic-exemplar-23",
          "draconic-exemplar",
          "phase",
          "Phase",
          "/Bloodlines.aspx?ID=23",
        ),
      ],
      report,
    );
    expect(table.byUrl.get("/bloodlines.aspx?id=23")).toEqual({
      codexId: "bloodline/draconic",
      name: "Draconic",
      aonId: "bloodline-23",
    });
    const ambiguous = reports.find((r) => r.cls === "duplicateUrlAmbiguous");
    expect(ambiguous).toBeDefined();
  });

  it("falls back deterministically when NO doc's id reconstructs the url (bare category-overview pages)", () => {
    const { reports, report } = makeReports();
    const table = buildAonLinkTable(
      [
        doc("category-page-8", "category-page", "traits-a", "Traits", "/Traits.aspx"),
        doc("category-page-101", "category-page", "traits-b", "Traits", "/Traits.aspx"),
      ],
      report,
    );
    // No ?ID= at all -> falls back to the whole group, sorted by aonId
    // ("category-page-101" < "category-page-8" lexicographically).
    expect(table.byUrl.get("/traits.aspx")).toEqual({
      codexId: "category-page/traits-b",
      name: "Traits",
      aonId: "category-page-101",
    });
    expect(reports.some((r) => r.cls === "duplicateUrlAmbiguous")).toBe(true);
  });
});

describe("normalizeUrlKey", () => {
  it("decodes &amp; entities", () => {
    expect(normalizeUrlKey("/Equipment.aspx?Category=37&amp;Subcategory=74")).toBe(
      "/equipment.aspx?category=37&subcategory=74",
    );
  });

  it("adds a leading slash when missing", () => {
    expect(normalizeUrlKey("Traits.aspx")).toBe("/traits.aspx");
  });

  it("lowercases the whole url", () => {
    expect(normalizeUrlKey("/Spells.aspx?ID=180")).toBe("/spells.aspx?id=180");
  });

  it("strips a trailing fragment defensively", () => {
    expect(normalizeUrlKey("/Rules.aspx?ID=453#section")).toBe("/rules.aspx?id=453");
  });
});

describe("looksExternal", () => {
  it("is true for an explicit http(s) url", () => {
    expect(looksExternal("https://paizo.com/foo")).toBe(true);
  });

  it("is true for a bare external domain with no protocol and no .aspx", () => {
    expect(looksExternal("paizo.com")).toBe(true);
    expect(looksExternal("PathfinderSociety.club")).toBe(true);
  });

  it("is false for an AoN-internal .aspx path, with or without a leading slash", () => {
    expect(looksExternal("/Spells.aspx?ID=180")).toBe(false);
    expect(looksExternal("Traits.aspx")).toBe(false);
  });
});

describe("createLinkResolver", () => {
  it("resolves a known url to a crossref node", () => {
    const { report } = makeReports();
    const table = buildAonLinkTable(
      [doc("spell-180", "spell", "magic-missile", "Magic Missile", "/Spells.aspx?ID=180")],
      report,
    );
    const resolveLink = createLinkResolver(table, report);
    expect(resolveLink("/Spells.aspx?ID=180", "Magic Missile")).toEqual({
      kind: "crossref",
      targetId: "spell/magic-missile",
      display: "Magic Missile",
    });
  });

  it("resolves a case/entity/leading-slash-varied href to the same crossref", () => {
    const { report } = makeReports();
    const table = buildAonLinkTable(
      [doc("trait-561", "trait", "concentrate", "Concentrate", "/Traits.aspx?ID=561")],
      report,
    );
    const resolveLink = createLinkResolver(table, report);
    expect(resolveLink("traits.aspx?id=561", "Concentrate")).toEqual({
      kind: "crossref",
      targetId: "trait/concentrate",
      display: "Concentrate",
    });
  });

  it("resolves an unknown AoN-internal-shaped url to brokenRef and reports it", () => {
    const { reports, report } = makeReports();
    const table = buildAonLinkTable([], report);
    const resolveLink = createLinkResolver(table, report);
    const result = resolveLink("/Spells.aspx?ID=99999", "Nonexistent Spell");
    expect(result).toEqual({
      kind: "brokenRef",
      target: "/Spells.aspx?ID=99999",
      display: "Nonexistent Spell",
    });
    expect(reports).toEqual([{ cls: "aonBrokenLink", detail: "/Spells.aspx?ID=99999" }]);
  });

  it("resolves an explicit http(s) url to a plain text node and reports externalLinkDropped", () => {
    const { reports, report } = makeReports();
    const table = buildAonLinkTable([], report);
    const resolveLink = createLinkResolver(table, report);
    const result = resolveLink("https://paizo.com/community/blog", "paizo.com");
    expect(result).toEqual({
      kind: "text",
      content: "paizo.com",
      marks: { bold: false, italic: false, superscript: false },
    });
    expect(reports).toEqual([
      { cls: "externalLinkDropped", detail: "https://paizo.com/community/blog" },
    ]);
  });

  it("resolves a bare-domain external link (no protocol, no .aspx) to a plain text node", () => {
    const { reports, report } = makeReports();
    const table = buildAonLinkTable([], report);
    const resolveLink = createLinkResolver(table, report);
    const result = resolveLink("paizo.com", "paizo.com");
    expect(result).toEqual({
      kind: "text",
      content: "paizo.com",
      marks: { bold: false, italic: false, superscript: false },
    });
    expect(reports.some((r) => r.cls === "externalLinkDropped")).toBe(true);
  });
});

describe("createLinkResolver: S5d repointByAonId (cross-category merge links)", () => {
  // The real, verified Accursed Staff shape: the remaster AoN equipment doc
  // (url ID 2244) was consumed by the Foundry weapon entity; its legacy twin
  // (url ID 4778) stayed an AoN-only entity — and BOTH urls collapse to the
  // same `equipment/accursed-staff` codexId string, so only the winner's
  // aonId can route them differently.
  const table = buildAonLinkTable(
    [
      doc(
        "equipment-2244",
        "equipment",
        "accursed-staff",
        "Accursed Staff",
        "/Equipment.aspx?ID=2244",
      ),
      doc(
        "equipment-4778",
        "equipment",
        "accursed-staff",
        "Accursed Staff",
        "/Equipment.aspx?ID=4778",
      ),
    ],
    () => {},
  );
  const repoint = new Map([["equipment-2244", "weapon/accursed-staff"]]);

  it("a link to the CONSUMED doc's url resolves to the merged entity's id and is report-counted", () => {
    const { reports, report } = makeReports();
    const resolveLink = createLinkResolver(table, report, repoint);
    expect(resolveLink("/Equipment.aspx?ID=2244", "Accursed Staff")).toEqual({
      kind: "crossref",
      targetId: "weapon/accursed-staff",
      display: "Accursed Staff",
    });
    expect(reports).toEqual([
      {
        cls: "crossCategoryLinkRepointed",
        detail: "equipment/accursed-staff (equipment-2244) -> weapon/accursed-staff",
      },
    ]);
  });

  it("a link to the legacy TWIN's url still resolves to the twin, never repointed (url-level precision)", () => {
    const { reports, report } = makeReports();
    const resolveLink = createLinkResolver(table, report, repoint);
    expect(resolveLink("/Equipment.aspx?ID=4778", "Accursed Staff")).toEqual({
      kind: "crossref",
      targetId: "equipment/accursed-staff",
      display: "Accursed Staff",
    });
    expect(reports).toEqual([]);
  });

  it("a SAME-category repoint (qualifier-reorder merge) is counted under mergedLinkRepointed", () => {
    const dragonTable = buildAonLinkTable(
      [
        doc(
          "creature-2933",
          "creature",
          "adult-adamantine-dragon",
          "Adult Adamantine Dragon",
          "/Monsters.aspx?ID=2933",
        ),
      ],
      () => {},
    );
    const { reports, report } = makeReports();
    const resolveLink = createLinkResolver(
      dragonTable,
      report,
      new Map([["creature-2933", "creature/adamantine-dragon-adult"]]),
    );
    expect(resolveLink("/Monsters.aspx?ID=2933", "Adult Adamantine Dragon")).toEqual({
      kind: "crossref",
      targetId: "creature/adamantine-dragon-adult",
      display: "Adult Adamantine Dragon",
    });
    expect(reports.map((r) => r.cls)).toEqual(["mergedLinkRepointed"]);
  });
});
