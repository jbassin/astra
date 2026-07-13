import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode } from "../schema/nodes";
import { applyAonPrimaryDrop, isDropCandidate } from "./drop";

function entity(
  overrides: Partial<CodexEntity> & Pick<CodexEntity, "id" | "category" | "slug" | "name">,
): CodexEntity {
  return {
    edition: "remaster",
    source: { book: "unknown", license: "unknown" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

function collector(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

describe("isDropCandidate (D29-14/-17)", () => {
  it("keeps an AoN-only (proseOnly) entity", () => {
    expect(
      isDropCandidate({
        category: "rules",
        aonUrl: undefined,
        proseOnly: true,
        variantOf: undefined,
      }),
    ).toBe(false);
  });

  it("keeps a merged entity (has its own aonUrl)", () => {
    expect(
      isDropCandidate({
        category: "boon",
        aonUrl: "/X.aspx?ID=1",
        proseOnly: undefined,
        variantOf: undefined,
      }),
    ).toBe(false);
  });

  it("keeps a variant of a merged family (no aonUrl of its own, but variantOf set)", () => {
    expect(
      isDropCandidate({
        category: "weapon",
        aonUrl: undefined,
        proseOnly: undefined,
        variantOf: "weapon/base",
      }),
    ).toBe(false);
  });

  it("keeps a Foundry-only creature or hazard (D29-17 carve-out)", () => {
    expect(
      isDropCandidate({
        category: "creature",
        aonUrl: undefined,
        proseOnly: undefined,
        variantOf: undefined,
      }),
    ).toBe(false);
    expect(
      isDropCandidate({
        category: "hazard",
        aonUrl: undefined,
        proseOnly: undefined,
        variantOf: undefined,
      }),
    ).toBe(false);
  });

  it("drops a Foundry-only entity in any other category", () => {
    expect(
      isDropCandidate({
        category: "boon",
        aonUrl: undefined,
        proseOnly: undefined,
        variantOf: undefined,
      }),
    ).toBe(true);
    expect(
      isDropCandidate({
        category: "weapon",
        aonUrl: undefined,
        proseOnly: undefined,
        variantOf: undefined,
      }),
    ).toBe(true);
    expect(
      isDropCandidate({
        category: "creature-ability",
        aonUrl: undefined,
        proseOnly: undefined,
        variantOf: undefined,
      }),
    ).toBe(true);
  });
});

describe("applyAonPrimaryDrop", () => {
  it("drops every Foundry-only-category entity (boon/pfs-boon/kingdom-feature/effect)", () => {
    const entities = [
      entity({ id: "boon/x", category: "boon", slug: "x", name: "X" }),
      entity({ id: "pfs-boon/y", category: "pfs-boon", slug: "y", name: "Y" }),
      entity({ id: "kingdom-feature/z", category: "kingdom-feature", slug: "z", name: "Z" }),
      entity({ id: "effect/w", category: "effect", slug: "w", name: "W" }),
    ];
    const { report } = collector();
    const result = applyAonPrimaryDrop(entities, report);
    expect(result.keptEntities).toEqual([]);
    expect(result.accounting.totalDropped).toBe(4);
    expect(result.accounting.byCategory).toEqual([
      { category: "boon", dropped: 1 },
      { category: "effect", dropped: 1 },
      { category: "kingdom-feature", dropped: 1 },
      { category: "pfs-boon", dropped: 1 },
    ]);
  });

  it("keeps AoN-only, merged, and variant entities regardless of category", () => {
    const aonOnly = entity({
      id: "rules/x",
      category: "rules",
      slug: "x",
      name: "X",
      proseOnly: true,
    });
    const merged = entity({
      id: "boon/y",
      category: "boon",
      slug: "y",
      name: "Y",
      aonUrl: "/X.aspx?ID=1",
    });
    const variant = entity({
      id: "weapon/z-greater",
      category: "weapon",
      slug: "z-greater",
      name: "Z (Greater)",
      variantOf: "weapon/z",
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([aonOnly, merged, variant], report);
    expect(result.keptEntities.map((e) => e.id).sort()).toEqual([
      "boon/y",
      "rules/x",
      "weapon/z-greater",
    ]);
    expect(result.accounting.totalDropped).toBe(0);
  });

  it("carve-out: keeps Foundry-only creature/hazard entities and reports them separately", () => {
    const creature = entity({
      id: "creature/beluthus",
      category: "creature",
      slug: "beluthus",
      name: "Beluthus",
    });
    const hazard = entity({ id: "hazard/trap", category: "hazard", slug: "trap", name: "Trap" });
    const droppedFeat = entity({ id: "feat/x", category: "feat", slug: "x", name: "X" });
    const { report } = collector();
    const result = applyAonPrimaryDrop([creature, hazard, droppedFeat], report);
    expect(result.keptEntities.map((e) => e.id).sort()).toEqual([
      "creature/beluthus",
      "hazard/trap",
    ]);
    expect(result.accounting.carveOut).toEqual([
      { category: "creature", kept: 1 },
      { category: "hazard", kept: 1 },
    ]);
    expect(result.accounting.totalDropped).toBe(1);
    expect(result.accounting.byCategory).toEqual([{ category: "feat", dropped: 1 }]);
  });

  it("report-counts every dropped entity individually (aonPrimaryDrop)", () => {
    const { reports, report } = collector();
    applyAonPrimaryDrop([entity({ id: "boon/x", category: "boon", slug: "x", name: "X" })], report);
    expect(reports.filter((r) => r.cls === "aonPrimaryDrop")).toHaveLength(1);
  });

  it("post-drop crossref reconciliation: downgrades a crossref pointing at a NOW-dropped entity to brokenRef", () => {
    const crossrefNode: CodexNode = {
      kind: "crossref",
      targetId: "boon/dropped-target",
      display: "Dropped Boon",
    };
    const survivor = entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      aonUrl: "/Spells.aspx?ID=1",
      body: [{ kind: "paragraph", children: [crossrefNode as never] }] as unknown as BlockNode[],
    });
    const droppedTarget = entity({
      id: "boon/dropped-target",
      category: "boon",
      slug: "dropped-target",
      name: "Dropped Boon",
    });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([survivor, droppedTarget], report);
    expect(result.keptEntities.map((e) => e.id)).toEqual(["spell/heal"]);
    const kept = result.keptEntities.find((e) => e.id === "spell/heal");
    const paragraph = kept?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual({
      kind: "brokenRef",
      target: "boon/dropped-target",
      display: "Dropped Boon",
    });
    expect(reports.some((r) => r.cls === "postDropBrokenRef")).toBe(true);
  });

  it("post-drop crossref reconciliation: leaves a crossref pointing at a SURVIVING entity untouched", () => {
    const crossrefNode: CodexNode = {
      kind: "crossref",
      targetId: "spell/fireball",
      display: "Fireball",
    };
    const target = entity({
      id: "spell/fireball",
      category: "spell",
      slug: "fireball",
      name: "Fireball",
      aonUrl: "/Spells.aspx?ID=2",
    });
    const holder = entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      aonUrl: "/Spells.aspx?ID=1",
      body: [{ kind: "paragraph", children: [crossrefNode as never] }] as unknown as BlockNode[],
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([holder, target], report);
    const kept = result.keptEntities.find((e) => e.id === "spell/heal");
    const paragraph = kept?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual(crossrefNode);
  });

  it("post-drop reconciliation also walks loreBody and embeddedItems", () => {
    const crossrefNode: CodexNode = { kind: "crossref", targetId: "boon/gone", display: "Gone" };
    const survivor = entity({
      id: "ancestry/anadi",
      category: "ancestry",
      slug: "anadi",
      name: "Anadi",
      aonUrl: "/Ancestries.aspx?ID=1",
      loreBody: [
        { kind: "paragraph", children: [crossrefNode as never] },
      ] as unknown as BlockNode[],
      embeddedItems: [
        {
          name: "Embedded",
          slug: "embedded",
          type: "action",
          traits: [],
          body: [
            { kind: "paragraph", children: [crossrefNode as never] },
          ] as unknown as BlockNode[],
        },
      ],
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([survivor], report);
    const kept = result.keptEntities[0];
    const loreParagraph = kept?.loreBody?.[0] as { children: CodexNode[] } | undefined;
    expect(loreParagraph?.children[0]).toEqual({
      kind: "brokenRef",
      target: "boon/gone",
      display: "Gone",
    });
    const embeddedParagraph = kept?.embeddedItems?.[0]?.body[0] as
      | { children: CodexNode[] }
      | undefined;
    expect(embeddedParagraph?.children[0]).toEqual({
      kind: "brokenRef",
      target: "boon/gone",
      display: "Gone",
    });
  });
});
