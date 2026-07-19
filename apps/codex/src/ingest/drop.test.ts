import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode } from "../schema/nodes";
import {
  activationDropFamily,
  applyAonPrimaryDrop,
  isDropCandidate,
  journalSectionHeaderDropFamily,
  unknownBookHuskDropFamily,
} from "./drop";

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
      // D29-133: real stats, so this fixture doesn't ALSO accidentally match
      // the new unknownBookHuskDropFamily predicate (book:"unknown" + empty
      // body/facets/traits) — this entity is meant to prove the ordinary
      // creature/hazard carve-out, not the husk-drop override.
      facets: { hp: 10 },
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

describe("activationDropFamily (D29-98, P11 S1 — widened activation drop)", () => {
  it("family (i): a paren-leading AoN-only action name", () => {
    expect(
      activationDropFamily({
        id: "action/arcane-99",
        category: "action",
        name: "(arcane)",
        proseOnly: true,
      }),
    ).toBe("paren");
  });

  it("family (ii): a digit-leading name with a parenthesized activation string", () => {
    expect(
      activationDropFamily({
        id: "action/envision-interact-70",
        category: "action",
        name: "1 minute (envision, Interact)",
        proseOnly: true,
      }),
    ).toBe("digit");
    expect(
      activationDropFamily({
        id: "action/ten-min-99",
        category: "action",
        name: "10 minutes (concentrate, manipulate)",
        proseOnly: true,
      }),
    ).toBe("digit");
  });

  it("a digit-leading name with NO parenthesized string is not family (ii)", () => {
    expect(
      activationDropFamily({
        id: "action/level-3-99",
        category: "action",
        name: "3rd-level spell",
        proseOnly: true,
      }),
    ).toBeUndefined();
  });

  it("the 9-entity keep-list survives despite matching family (i)", () => {
    for (const id of [
      "action/manipulate",
      "action/concentrate",
      "action/concentration",
      "action/command",
      "action/concentrate-manipulate",
      "action/envision",
      "action/concentration-3",
      "action/concentration-4",
      "action/spellshape",
    ]) {
      expect(
        activationDropFamily({ id, category: "action", name: "(manipulate)", proseOnly: true }),
      ).toBeUndefined();
    }
  });

  it("non-action categories never match, even with a paren-leading name", () => {
    expect(
      activationDropFamily({
        id: "condition/frightened",
        category: "condition",
        name: "(frightened)",
        proseOnly: true,
      }),
    ).toBeUndefined();
  });

  it("a Foundry-native/merged action entity is NEVER touched, even with a paren-leading name (D29-98 is AoN-only-scoped — real corpus finding: adventure-specific-actions carry names like '(Affinity Ablaze) Arms of Balance: …')", () => {
    expect(
      activationDropFamily({
        id: "action/affinity-ablaze-arms-of-balance",
        category: "action",
        name: "(Affinity Ablaze) Arms of Balance: Walking the Cardinal Paths",
        proseOnly: undefined,
      }),
    ).toBeUndefined();
    expect(
      activationDropFamily({
        id: "action/merged-paren-name",
        category: "action",
        name: "(arcane)",
        proseOnly: undefined, // merged (has aonUrl) but NOT proseOnly
      }),
    ).toBeUndefined();
  });

  it("an ordinary action name (neither family) is untouched", () => {
    expect(
      activationDropFamily({
        id: "action/stride",
        category: "action",
        name: "Stride",
        proseOnly: true,
      }),
    ).toBeUndefined();
  });
});

describe("applyAonPrimaryDrop — D29-98 widened activation drop (P11 S1)", () => {
  it("drops a paren-named (family i) AoN-only action even though it IS AoN-backed", () => {
    const debris = entity({
      id: "action/arcane-99",
      category: "action",
      slug: "arcane-99",
      name: "(arcane)",
      proseOnly: true,
    });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([debris], report);
    expect(result.keptEntities).toEqual([]);
    expect(result.accounting.activationDrop.total).toBe(1);
    expect(result.accounting.activationDrop.parenFamily).toBe(1);
    expect(result.accounting.activationDrop.digitFamily).toBe(0);
    expect(reports.some((r) => r.cls === "activationDropped")).toBe(true);
  });

  it("drops a digit-named (family ii) AoN-only action and lists it in digitFamilyNames", () => {
    const debris = entity({
      id: "action/ten-min-99",
      category: "action",
      slug: "ten-min-99",
      name: "10 minutes (concentrate, manipulate)",
      proseOnly: true,
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([debris], report);
    expect(result.keptEntities).toEqual([]);
    expect(result.accounting.activationDrop.digitFamily).toBe(1);
    expect(result.accounting.activationDrop.digitFamilyNames).toEqual([
      "action/ten-min-99: 10 minutes (concentrate, manipulate)",
    ]);
  });

  it("keeps a keep-list entity despite matching family (i)", () => {
    const kept = entity({
      id: "action/manipulate",
      category: "action",
      slug: "manipulate",
      name: "(manipulate)",
      proseOnly: true,
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([kept], report);
    expect(result.keptEntities.map((e) => e.id)).toEqual(["action/manipulate"]);
    expect(result.accounting.activationDrop.total).toBe(0);
  });

  it("activation-dropped entities do NOT count toward the D29-14/-17 byCategory/totalDropped accounting", () => {
    const debris = entity({
      id: "action/arcane-99",
      category: "action",
      slug: "arcane-99",
      name: "(arcane)",
      proseOnly: true,
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([debris], report);
    expect(result.accounting.totalDropped).toBe(0);
    expect(result.accounting.byCategory).toEqual([]);
  });

  it("strips a dangling remasteredAs pointer off a surviving entity when its target is activation-dropped", () => {
    const survivor = entity({
      id: "action/interact-142",
      category: "action",
      slug: "interact-142",
      name: "Interact",
      aonUrl: "/Actions.aspx?ID=142",
      remasteredAs: ["action/concentrate-manipulate-78"],
    });
    const droppedTarget = entity({
      id: "action/concentrate-manipulate-78",
      category: "action",
      slug: "concentrate-manipulate-78",
      name: "(concentrate, manipulate)",
      proseOnly: true,
    });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([survivor, droppedTarget], report);
    expect(result.keptEntities.map((e) => e.id)).toEqual(["action/interact-142"]);
    const kept = result.keptEntities[0];
    expect(kept?.remasteredAs).toBeUndefined();
    expect(result.accounting.editionPointersStripped).toBe(1);
    expect(reports.some((r) => r.cls === "postDropEditionPointerStripped")).toBe(true);
  });

  it("leaves a remasteredAs pointer untouched when its target survives", () => {
    const survivor = entity({
      id: "action/interact-142",
      category: "action",
      slug: "interact-142",
      name: "Interact",
      aonUrl: "/Actions.aspx?ID=142",
      remasteredAs: ["action/manipulate"],
    });
    const target = entity({
      id: "action/manipulate",
      category: "action",
      slug: "manipulate",
      name: "(manipulate)",
      proseOnly: true,
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([survivor, target], report);
    const kept = result.keptEntities.find((e) => e.id === "action/interact-142");
    expect(kept?.remasteredAs).toEqual(["action/manipulate"]);
    expect(result.accounting.editionPointersStripped).toBe(0);
  });

  it("a keep-list entity's own crossref into another dropped entity still downgrades to brokenRef (drop + dedupe compose)", () => {
    const crossrefNode: CodexNode = {
      kind: "crossref",
      targetId: "action/arcane-99",
      display: "Arcane",
    };
    const kept = entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      aonUrl: "/Spells.aspx?ID=1",
      body: [{ kind: "paragraph", children: [crossrefNode as never] }] as unknown as BlockNode[],
    });
    const debris = entity({
      id: "action/arcane-99",
      category: "action",
      slug: "arcane-99",
      name: "(arcane)",
      proseOnly: true,
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([kept, debris], report);
    const survivor = result.keptEntities.find((e) => e.id === "spell/heal");
    const paragraph = survivor?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual({
      kind: "brokenRef",
      target: "action/arcane-99",
      display: "Arcane",
    });
  });
});

describe("journalSectionHeaderDropFamily (D29-133, P14 S1)", () => {
  it("matches a proseOnly Foundry-journal page with an EMPTY body", () => {
    expect(
      journalSectionHeaderDropFamily({
        proseOnly: true,
        source: { book: "Foundry Journal: Ancestries", license: "unknown" },
        body: [],
      }),
    ).toBe(true);
  });

  it("does NOT match ancestry/index — same proseOnly + FJ book, but a NON-empty body (D29-133's own preserved-index carve-out)", () => {
    expect(
      journalSectionHeaderDropFamily({
        proseOnly: true,
        source: { book: "Foundry Journal: Ancestries", license: "unknown" },
        body: [{ kind: "paragraph", children: [] }] as unknown as BlockNode[],
      }),
    ).toBe(false);
  });

  it("does not match a non-Foundry-Journal book, even with an empty body and proseOnly", () => {
    expect(
      journalSectionHeaderDropFamily({
        proseOnly: true,
        source: { book: "Player Core", license: "unknown" },
        body: [],
      }),
    ).toBe(false);
  });

  it("does not match a non-proseOnly entity, even with an FJ book and empty body", () => {
    expect(
      journalSectionHeaderDropFamily({
        proseOnly: undefined,
        source: { book: "Foundry Journal: Archetypes", license: "unknown" },
        body: [],
      }),
    ).toBe(false);
  });
});

describe("unknownBookHuskDropFamily (D29-133, P14 S1)", () => {
  function husk(
    overrides: Partial<CodexEntity> = {},
  ): Parameters<typeof unknownBookHuskDropFamily>[0] {
    return {
      category: "creature",
      source: { book: "unknown", license: "unknown" },
      body: [],
      facets: {},
      traits: [],
      ...overrides,
    };
  }

  it("matches a zero-stat unknown-book creature husk", () => {
    expect(unknownBookHuskDropFamily(husk())).toBe(true);
  });

  it("does not match a non-creature category", () => {
    expect(unknownBookHuskDropFamily(husk({ category: "hazard" }))).toBe(false);
  });

  it("does not match a KNOWN book", () => {
    expect(
      unknownBookHuskDropFamily(husk({ source: { book: "Bestiary", license: "unknown" } })),
    ).toBe(false);
  });

  it("does not match a non-empty body", () => {
    expect(
      unknownBookHuskDropFamily(
        husk({ body: [{ kind: "paragraph", children: [] }] as unknown as BlockNode[] }),
      ),
    ).toBe(false);
  });

  it("does not match a husk carrying real facets", () => {
    expect(unknownBookHuskDropFamily(husk({ facets: { hp: 10 } }))).toBe(false);
  });

  it("does not match a husk carrying real traits", () => {
    expect(unknownBookHuskDropFamily(husk({ traits: ["animal"] }))).toBe(false);
  });
});

describe("applyAonPrimaryDrop — D29-133 debris drop-families (P14 S1)", () => {
  it("drops a journal-section-header entity even though it IS AoN-backed (proseOnly) — the override, same shape as activationDropFamily", () => {
    const debris = entity({
      id: "ancestry/common",
      category: "ancestry",
      slug: "common",
      name: "Common",
      proseOnly: true,
      source: { book: "Foundry Journal: Ancestries", license: "unknown" },
    });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([debris], report);
    expect(result.keptEntities).toEqual([]);
    expect(result.accounting.journalSectionHeaderDrop).toBe(1);
    expect(reports.some((r) => r.cls === "journalSectionHeaderDropped")).toBe(true);
    // NOT counted in the D29-14/-17 byCategory/totalDropped section (same
    // "kept separate" posture as activationDrop).
    expect(result.accounting.totalDropped).toBe(0);
    expect(result.accounting.byCategory).toEqual([]);
  });

  it("keeps ancestry/index (non-empty body) despite the FJ book + proseOnly", () => {
    const index = entity({
      id: "ancestry/index",
      category: "ancestry",
      slug: "index",
      name: "Ancestries",
      proseOnly: true,
      source: { book: "Foundry Journal: Ancestries", license: "unknown" },
      body: [{ kind: "paragraph", children: [] }] as unknown as BlockNode[],
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([index], report);
    expect(result.keptEntities.map((e) => e.id)).toEqual(["ancestry/index"]);
    expect(result.accounting.journalSectionHeaderDrop).toBe(0);
  });

  it("drops an unknown-book creature husk even though it would otherwise survive via the creature/hazard carve-out", () => {
    const husk = entity({
      id: "creature/flappy",
      category: "creature",
      slug: "flappy",
      name: "Flappy",
      source: { book: "unknown", license: "unknown" },
    });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([husk], report);
    expect(result.keptEntities).toEqual([]);
    expect(result.accounting.unknownBookHuskDrop).toBe(1);
    expect(reports.some((r) => r.cls === "unknownBookHuskDropped")).toBe(true);
    expect(result.accounting.carveOut).toEqual([]);
  });

  it("keeps a genuine Foundry-only creature with real content (the Dune Candle shape) despite book:unknown by default — needs facets/traits too", () => {
    const realCreature = entity({
      id: "creature/dune-candle",
      category: "creature",
      slug: "dune-candle",
      name: "Dune Candle",
      source: { book: "unknown", license: "unknown" },
      facets: { hp: 10 },
    });
    const { report } = collector();
    const result = applyAonPrimaryDrop([realCreature], report);
    expect(result.keptEntities.map((e) => e.id)).toEqual(["creature/dune-candle"]);
    expect(result.accounting.unknownBookHuskDrop).toBe(0);
    expect(result.accounting.carveOut).toEqual([{ category: "creature", kept: 1 }]);
  });
});

describe("reconcileInline embed overrides (D29-134, P14 S1)", () => {
  function embedEntity(embed: {
    target: string;
    resolved: boolean;
    display?: string;
  }): CodexEntity {
    return entity({
      id: "class/summoner",
      category: "class",
      slug: "summoner",
      name: "Summoner",
      aonUrl: "/Classes.aspx?ID=1",
      body: [
        { kind: "paragraph", children: [{ kind: "embed", ...embed }] },
      ] as unknown as BlockNode[],
    });
  }

  it("repoints a resolved-then-dropped embed to its override target, flipping resolved back to true (the target survives)", () => {
    const holder = embedEntity({ target: "class-feature/angel-eidolon", resolved: true });
    const survivingTarget = entity({
      id: "eidolon/angel",
      category: "eidolon",
      slug: "angel",
      name: "Angel",
      aonUrl: "/Eidolons.aspx?ID=1",
    });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([holder, survivingTarget], report);
    const kept = result.keptEntities.find((e) => e.id === "class/summoner");
    const paragraph = kept?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual({
      kind: "embed",
      target: "eidolon/angel",
      resolved: true,
    });
    expect(reports.some((r) => r.cls === "embedOverrideRepointed")).toBe(true);
    // The dead pre-collision target ("class-feature/angel-eidolon") was never
    // itself in the corpus in this test — proves the override fires BEFORE
    // the ordinary "still unresolved" postDropEmbedBroken path would have.
    expect(reports.some((r) => r.cls === "postDropEmbedBroken")).toBe(false);
  });

  it("suppresses the vishkanya self-embed (feat/innate-venom) to an inert empty text node — never counted as unresolved", () => {
    const holder = embedEntity({ target: "feat/innate-venom", resolved: true });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([holder], report);
    const kept = result.keptEntities.find((e) => e.id === "class/summoner");
    const paragraph = kept?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual({
      kind: "text",
      content: "",
      marks: { bold: false, italic: false, superscript: false },
    });
    expect(reports.some((r) => r.cls === "embedOverrideSuppressed")).toBe(true);
    expect(reports.some((r) => r.cls === "postDropEmbedBroken")).toBe(false);
  });

  it("an embed with no override entry still falls through to the ordinary postDropEmbedBroken path", () => {
    const holder = embedEntity({ target: "class-feature/never-joined", resolved: true });
    const { reports, report } = collector();
    const result = applyAonPrimaryDrop([holder], report);
    const kept = result.keptEntities.find((e) => e.id === "class/summoner");
    const paragraph = kept?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual({
      kind: "embed",
      target: "class-feature/never-joined",
      resolved: false,
    });
    expect(reports.some((r) => r.cls === "postDropEmbedBroken")).toBe(true);
  });
});
