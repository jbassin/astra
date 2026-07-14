import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { AonLinkTable } from "./aonLinkTable";
import { attachSidebars } from "./sidebarAttach";

function entity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "category" | "slug" | "name">,
): CodexEntity {
  return {
    edition: "remaster",
    source: { book: "Test Book", license: "unknown" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

function linkTable(
  entries: Record<string, { codexId: string; aonId: string; name: string }>,
): AonLinkTable {
  return { byUrl: new Map(Object.entries(entries)) };
}

function collector(): { reports: string[]; report: (cls: string, detail: string) => void } {
  const reports: string[] = [];
  return { reports, report: (cls, detail) => reports.push(`${cls}: ${detail}`) };
}

describe("attachSidebars (D29-39, adversarial M8)", () => {
  it("attaches a sidebar to its host via pickCanonical's own aonId -> aonIdToFinalId (post-identity)", () => {
    const host = entity({
      id: "rules/chapter",
      category: "rules",
      slug: "chapter",
      name: "Chapter",
    });
    const sidebar = entity({
      id: "sidebar/box",
      category: "sidebar",
      slug: "box",
      name: "Box",
      aonUrl: "/Rules.aspx?ID=5",
    });
    const table = linkTable({
      "/rules.aspx?id=5": { codexId: "rules/chapter", aonId: "rules-5", name: "Chapter" },
    });
    const aonIdToFinalId = new Map([["rules-5", "rules/chapter"]]);
    const finalIdToAonId = new Map([["rules/chapter", "rules-5"]]);
    const { report } = collector();
    const result = attachSidebars([host, sidebar], table, aonIdToFinalId, finalIdToAonId, report);

    const resultHost = result.entities.find((e) => e.id === "rules/chapter");
    expect(resultHost?.attachedSidebars).toEqual(["sidebar/box"]);
    expect(result.sidebarsResolved).toBe(1);
    expect(result.sidebarsTotal).toBe(1);
    expect(result.maxPerHost).toBe(1);
    expect(result.byHostCategory).toEqual([{ category: "rules", count: 1 }]);
  });

  it("the M8 shared-url shape: a class page's url is shared by its class-feature docs — the sidebar attaches to the PAGE OWNER (pickCanonical's winner), not a feature", () => {
    const classPage = entity({
      id: "class/witch",
      category: "class",
      slug: "witch",
      name: "Witch",
    });
    const feature = entity({
      id: "class-feature/patron",
      category: "class-feature",
      slug: "patron",
      name: "Patron",
    });
    const sidebar = entity({
      id: "sidebar/witch-box",
      category: "sidebar",
      slug: "witch-box",
      name: "Witch Box",
      aonUrl: "/Classes.aspx?ID=9",
    });
    // pickCanonical already resolved the SHARED url to the class page's own
    // aonId at link-table-build time (this module never re-decides that) —
    // both `classPage` and `feature` exist in the corpus, but only the
    // table's winner (class-9) is addressable here.
    const table = linkTable({
      "/classes.aspx?id=9": { codexId: "class/witch", aonId: "class-9", name: "Witch" },
    });
    const aonIdToFinalId = new Map([["class-9", "class/witch"]]);
    const finalIdToAonId = new Map([["class/witch", "class-9"]]);
    const { report } = collector();
    const result = attachSidebars(
      [classPage, feature, sidebar],
      table,
      aonIdToFinalId,
      finalIdToAonId,
      report,
    );
    const resultClass = result.entities.find((e) => e.id === "class/witch");
    const resultFeature = result.entities.find((e) => e.id === "class-feature/patron");
    expect(resultClass?.attachedSidebars).toEqual(["sidebar/witch-box"]);
    expect(resultFeature?.attachedSidebars).toBeUndefined();
  });

  it("orders multiple sidebars on one host by name asc, tie-break aonId", () => {
    const host = entity({
      id: "rules/chapter",
      category: "rules",
      slug: "chapter",
      name: "Chapter",
    });
    const sidebarB = entity({
      id: "sidebar/b",
      category: "sidebar",
      slug: "b",
      name: "Beta",
      aonUrl: "/Rules.aspx?ID=5",
    });
    const sidebarA = entity({
      id: "sidebar/a",
      category: "sidebar",
      slug: "a",
      name: "Alpha",
      aonUrl: "/Rules.aspx?ID=5",
    });
    const table = linkTable({
      "/rules.aspx?id=5": { codexId: "rules/chapter", aonId: "rules-5", name: "Chapter" },
    });
    const aonIdToFinalId = new Map([["rules-5", "rules/chapter"]]);
    const finalIdToAonId = new Map([["rules/chapter", "rules-5"]]);
    const { report } = collector();
    const result = attachSidebars(
      [host, sidebarB, sidebarA],
      table,
      aonIdToFinalId,
      finalIdToAonId,
      report,
    );
    const resultHost = result.entities.find((e) => e.id === "rules/chapter");
    expect(resultHost?.attachedSidebars).toEqual(["sidebar/a", "sidebar/b"]);
  });

  it("a sidebar whose url resolves to nothing living is report-counted, not silently dropped", () => {
    const sidebar = entity({
      id: "sidebar/orphan",
      category: "sidebar",
      slug: "orphan",
      name: "Orphan",
      aonUrl: "/Rules.aspx?ID=999",
    });
    const { report, reports } = collector();
    const result = attachSidebars([sidebar], { byUrl: new Map() }, new Map(), new Map(), report);
    expect(result.sidebarsResolved).toBe(0);
    expect(reports.some((r) => r.startsWith("sidebarHostUnresolved:"))).toBe(true);
  });
});
