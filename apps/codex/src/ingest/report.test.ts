import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { AugmentClassStatsResult } from "./augmentClassStats";
import type { BookNormalizeResult } from "./bookNormalize";
import type { DropAccounting } from "./drop";
import type { CategoryStat, CollisionReport, JoinResult } from "./join";
import {
  buildReportJson,
  buildReportMarkdown,
  capList,
  computeCreatureStatsCoverage,
  computeEditionBreakdown,
  computeEmbeddedItemStatsCoverage,
  computeFacetCoverage,
  computeFamilyCoverage,
  computeFinalCategoryCounts,
  computeHazardStatsCoverage,
  computeLicenseBreakdown,
  computeProseOnlyCount,
  computeSupersededBreakdown,
  computeVariantCount,
  type ReportInput,
} from "./report";
import type { RulesTreeStats } from "./rulesTree";
import type { SidebarAttachResult } from "./sidebarAttach";
import type { SourcesIndexStats } from "./sourcesIndexBuild";

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

function joinResult(overrides: Partial<JoinResult>): JoinResult {
  return {
    entities: [],
    categoryStats: [],
    collisions: [],
    redirectCrossCheck: { agreements: 0, disagreements: 0 },
    patchStats: {
      patchedCrossrefs: 0,
      brokenAfterPatch: 0,
      resolvedEmbeds: 0,
      unresolvedEmbeds: 0,
    },
    pairingCount: 0,
    aliasesApplied: [],
    aonIdToFinalId: new Map(),
    ...overrides,
  };
}

const EMPTY_BOOK_NORMALIZATION: BookNormalizeResult = {
  entities: [],
  bookNameMap: new Map(),
  mergeTable: [],
  distinctBefore: 0,
  distinctAfter: 0,
  prefixMergeCount: 0,
  caseFoldGroupCount: 0,
};

const EMPTY_SIDEBAR_ATTACHMENT: SidebarAttachResult = {
  entities: [],
  sidebarsTotal: 0,
  sidebarsResolved: 0,
  byHostCategory: [],
  maxPerHost: 0,
  hostsWithSidebars: 0,
};

const EMPTY_RULES_TREE_STATS: RulesTreeStats = {
  totalDocs: 0,
  bookCount: 0,
  rootCount: 0,
  childlessRootCount: 0,
  syntheticCount: 0,
  parentTieBreakCount: 0,
  fallbackHits: [],
  siblingChainCoverage: [],
};

const EMPTY_SOURCES_INDEX_STATS: SourcesIndexStats = {
  totalBooks: 0,
  classifiedBooks: 0,
  otherBooks: 0,
  totalEntities: 0,
  classifiedEntities: 0,
  otherEntities: 0,
  classifiedEntityPct: 0,
  belowNinetyPctGuard: false,
};

const EMPTY_CLASS_STATS_AUGMENT: Omit<AugmentClassStatsResult, "entities"> = {
  classStatsEmitted: 0,
  grantedFeaturesResolved: 0,
  grantedFeaturesUnresolved: 0,
  subclassOptionsEmitted: 0,
  subclassOptionCounts: [],
};

describe("capList", () => {
  it("caps a list and reports the true total", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const capped = capList(items, 10);
    expect(capped.shown).toHaveLength(10);
    expect(capped.totalCount).toBe(30);
  });

  it("does not cap a short list", () => {
    const capped = capList([1, 2, 3], 20);
    expect(capped.shown).toEqual([1, 2, 3]);
    expect(capped.totalCount).toBe(3);
  });
});

describe("computeFinalCategoryCounts / license / edition / proseOnly / variant", () => {
  const entities: CodexEntity[] = [
    entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      edition: "remaster",
      source: { book: "Player Core", license: "ORC" },
    }),
    entity({
      id: "spell/heal@legacy",
      category: "spell",
      slug: "heal",
      name: "Heal",
      edition: "legacy",
      source: { book: "Core Rulebook", license: "OGL" },
      proseOnly: true,
    }),
    entity({
      id: "creature/dragon",
      category: "creature",
      slug: "dragon",
      name: "Dragon",
      edition: "remaster",
      source: { book: "Monster Core", license: "ORC" },
      variantOf: "creature/other",
    }),
  ];

  it("counts entities per category", () => {
    expect(computeFinalCategoryCounts(entities)).toEqual(
      new Map([
        ["spell", 2],
        ["creature", 1],
      ]),
    );
  });

  it("breaks down by license", () => {
    expect(computeLicenseBreakdown(entities)).toEqual({ ORC: 2, OGL: 1 });
  });

  it("breaks down by edition", () => {
    expect(computeEditionBreakdown(entities)).toEqual({ remaster: 2, legacy: 1 });
  });

  it("counts proseOnly and variantOf entities", () => {
    expect(computeProseOnlyCount(entities)).toBe(1);
    expect(computeVariantCount(entities)).toBe(1);
  });
});

const EMPTY_ACTIVATION_DROP = {
  total: 0,
  parenFamily: 0,
  digitFamily: 0,
  digitFamilyNames: [],
};

const EMPTY_DROP_ACCOUNTING: DropAccounting = {
  totalDropped: 0,
  byCategory: [],
  carveOut: [],
  activationDrop: EMPTY_ACTIVATION_DROP,
  editionPointersStripped: 0,
  journalSectionHeaderDrop: 0,
  unknownBookHuskDrop: 0,
};

const EMPTY_ADJACENT_CROSSREF_DEDUPE = { totalOccurrences: 0, entitiesTouched: 0 };

function baseInput(overrides: Partial<ReportInput>): ReportInput {
  return {
    reportCounts: new Map(),
    reportExamples: new Map(),
    hardFailureCount: 0,
    join: joinResult({}),
    finalEntities: [],
    dropAccounting: EMPTY_DROP_ACCOUNTING,
    adjacentCrossrefDedupe: EMPTY_ADJACENT_CROSSREF_DEDUPE,
    foundrySnapshotDocCount: 28636,
    aonSnapshotDocCount: 43684,
    bookNormalization: EMPTY_BOOK_NORMALIZATION,
    sidebarAttachment: EMPTY_SIDEBAR_ATTACHMENT,
    rulesTree: EMPTY_RULES_TREE_STATS,
    sourcesIndex: EMPTY_SOURCES_INDEX_STATS,
    classStatsAugment: EMPTY_CLASS_STATS_AUGMENT,
    ...overrides,
  };
}

describe("buildReportJson", () => {
  it("computes joinRatePct and caps unjoined lists", () => {
    const stat: CategoryStat = {
      category: "creature",
      foundryTotal: 10,
      aonTotal: 5,
      exact: 3,
      normalized: 4,
      alias: 0,
      variants: 1,
      unjoinedForeign: Array.from({ length: 25 }, (_, i) => ({
        id: `creature/x${i}`,
        name: `X${i}`,
      })),
      unjoinedAon: [],
    };
    const json = buildReportJson(
      baseInput({
        join: joinResult({ categoryStats: [stat], entities: [] }),
      }),
    );
    const cat = json.categories.find((c) => c.category === "creature");
    expect(cat?.joinRatePct).toBe(70); // (3+4)/10
    expect(cat?.unjoinedForeign.totalCount).toBe(25);
    expect(cat?.unjoinedForeign.shown).toHaveLength(20); // default cap
  });

  it("joinRatePct is null when there are no Foundry docs in the category", () => {
    const stat: CategoryStat = {
      category: "rules",
      foundryTotal: 0,
      aonTotal: 100,
      exact: 0,
      normalized: 0,
      alias: 0,
      variants: 0,
      unjoinedForeign: [],
      unjoinedAon: [],
    };
    const json = buildReportJson(baseInput({ join: joinResult({ categoryStats: [stat] }) }));
    expect(json.categories[0]?.joinRatePct).toBeNull();
  });

  it("carries collisions, pairing, patch stats, and aliases through verbatim", () => {
    const collisions: CollisionReport[] = [
      {
        preId: "spell/heal",
        kind: "legacyPair",
        members: [
          { finalId: "spell/heal", origin: "foundry", edition: "remaster", name: "Heal" },
          { finalId: "spell/heal@legacy", origin: "aon", edition: "legacy", name: "Heal" },
        ],
      },
    ];
    const json = buildReportJson(
      baseInput({
        join: joinResult({
          collisions,
          pairingCount: 1,
          redirectCrossCheck: { agreements: 5, disagreements: 1 },
          patchStats: {
            patchedCrossrefs: 0,
            brokenAfterPatch: 2,
            resolvedEmbeds: 3,
            unresolvedEmbeds: 0,
          },
          aliasesApplied: [{ foundryId: "feat/x", aonId: "feat-1", note: "typo" }],
        }),
      }),
    );
    expect(json.collisions).toEqual(collisions);
    expect(json.legacyPairing).toEqual({
      pairingCount: 1,
      redirectCrossCheck: { agreements: 5, disagreements: 1 },
    });
    expect(json.crossrefPatching).toEqual({
      patchedCrossrefs: 0,
      brokenAfterPatch: 2,
      resolvedEmbeds: 3,
      unresolvedEmbeds: 0,
    });
    expect(json.aliasesApplied).toEqual([{ foundryId: "feat/x", aonId: "feat-1", note: "typo" }]);
  });

  it("sorts reportCounts by class name for determinism", () => {
    const json = buildReportJson(
      baseInput({
        reportCounts: new Map([
          ["zebra", 1],
          ["alpha", 2],
        ]),
      }),
    );
    expect(Object.keys(json.reportCounts)).toEqual(["alpha", "zebra"]);
  });

  it("S5c: final* stats (finalEntityCount, license/edition breakdown, per-category finalOut) come from finalEntities (POST-drop), not join.entities", () => {
    const preDropOnly = entity({
      id: "boon/dropped",
      category: "boon",
      slug: "dropped",
      name: "Dropped",
      source: { book: "unknown", license: "unknown" },
    });
    const kept = entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      source: { book: "Player Core", license: "ORC" },
    });
    const stat: CategoryStat = {
      category: "boon",
      foundryTotal: 1,
      aonTotal: 0,
      exact: 0,
      normalized: 0,
      alias: 0,
      variants: 0,
      unjoinedForeign: [{ id: "boon/dropped", name: "Dropped" }],
      unjoinedAon: [],
    };
    const json = buildReportJson(
      baseInput({
        join: joinResult({ categoryStats: [stat], entities: [preDropOnly, kept] }),
        finalEntities: [kept], // "boon/dropped" was dropped before emit
      }),
    );
    expect(json.finalEntityCount).toBe(1);
    expect(json.licenseBreakdown).toEqual({ ORC: 1 });
    const boonCat = json.categories.find((c) => c.category === "boon");
    expect(boonCat?.finalOut).toBe(0); // dropped, so 0 in the POST-drop count
    expect(boonCat?.foundryIn).toBe(1); // pre-drop join measurement unaffected
  });

  it("passes dropAccounting through verbatim", () => {
    const dropAccounting: DropAccounting = {
      totalDropped: 536,
      byCategory: [{ category: "boon", dropped: 240 }],
      carveOut: [{ category: "creature", kept: 2242 }],
      activationDrop: EMPTY_ACTIVATION_DROP,
      editionPointersStripped: 0,
      journalSectionHeaderDrop: 0,
      unknownBookHuskDrop: 0,
    };
    const json = buildReportJson(baseInput({ dropAccounting }));
    expect(json.dropAccounting).toEqual(dropAccounting);
  });
});

describe("buildReportMarkdown", () => {
  it("flags a category under the 50% STOP threshold when both sources are present", () => {
    const json = buildReportJson(
      baseInput({
        join: joinResult({
          categoryStats: [
            {
              category: "widget",
              foundryTotal: 10,
              aonTotal: 10,
              exact: 2,
              normalized: 0,
              alias: 0,
              variants: 0,
              unjoinedForeign: [],
              unjoinedAon: [],
            },
          ],
        }),
      }),
    );
    const md = buildReportMarkdown(json);
    expect(md).toContain("STOP-condition categories");
    expect(md).toContain("widget");
  });

  it("does not flag a healthy category", () => {
    const json = buildReportJson(
      baseInput({
        join: joinResult({
          categoryStats: [
            {
              category: "spell",
              foundryTotal: 100,
              aonTotal: 100,
              exact: 95,
              normalized: 4,
              alias: 1,
              variants: 0,
              unjoinedForeign: [],
              unjoinedAon: [],
            },
          ],
        }),
      }),
    );
    const md = buildReportMarkdown(json);
    expect(md).toContain("No category with both sources present sits below");
  });

  it("renders the alias table when aliases were applied", () => {
    const json = buildReportJson(
      baseInput({
        join: joinResult({
          aliasesApplied: [
            { foundryId: "feat/camouflage-coat", aonId: "feat-5337", note: "typo: missing u" },
          ],
        }),
      }),
    );
    const md = buildReportMarkdown(json);
    expect(md).toContain("feat/camouflage-coat");
    expect(md).toContain("feat-5337");
  });

  it("says aliases were not applied when the list is empty", () => {
    const json = buildReportJson(baseInput({}));
    const md = buildReportMarkdown(json);
    expect(md).toContain("None applied in this run.");
  });

  it("S5c: renders the drop-accounting section (per-category drops + carve-out kept counts)", () => {
    const dropAccounting: DropAccounting = {
      totalDropped: 536,
      byCategory: [
        { category: "boon", dropped: 240 },
        { category: "pfs-boon", dropped: 157 },
      ],
      carveOut: [
        { category: "creature", kept: 2242 },
        { category: "hazard", kept: 660 },
      ],
      activationDrop: EMPTY_ACTIVATION_DROP,
      editionPointersStripped: 0,
      journalSectionHeaderDrop: 0,
      unknownBookHuskDrop: 0,
    };
    const json = buildReportJson(baseInput({ dropAccounting }));
    const md = buildReportMarkdown(json);
    expect(md).toContain("AoN-primary drop pass");
    expect(md).toContain("536");
    expect(md).toContain("boon");
    expect(md).toContain("240");
    expect(md).toContain("creature");
    expect(md).toContain("2242");
  });

  it("renders 'nothing dropped'/'no carve-out' placeholders when both are empty", () => {
    const json = buildReportJson(baseInput({}));
    const md = buildReportMarkdown(json);
    expect(md).toContain("Nothing dropped.");
    expect(md).toContain("No carve-out entities in this run.");
  });

  it("D29-98 (P11 S1): renders the activation-drop section, incl. the FULL family-(ii) name list", () => {
    const dropAccounting: DropAccounting = {
      totalDropped: 0,
      byCategory: [],
      carveOut: [],
      activationDrop: {
        total: 1387,
        parenFamily: 1224,
        digitFamily: 163,
        digitFamilyNames: [
          "action/envision-interact-70: 1 minute (envision, Interact)",
          "action/ten-min-99: 10 minutes (concentrate, manipulate)",
        ],
      },
      editionPointersStripped: 55,
      journalSectionHeaderDrop: 0,
      unknownBookHuskDrop: 0,
    };
    const json = buildReportJson(baseInput({ dropAccounting }));
    const md = buildReportMarkdown(json);
    expect(md).toContain("Activation-debris drop pass");
    expect(md).toContain("1387");
    expect(md).toContain("1224");
    expect(md).toContain("163");
    expect(md).toContain("55");
    expect(md).toContain("action/envision-interact-70: 1 minute (envision, Interact)");
    expect(md).toContain("action/ten-min-99: 10 minutes (concentrate, manipulate)");
  });

  it("D29-98: renders the 'no family-(ii) names dropped' placeholder when the list is empty", () => {
    const json = buildReportJson(baseInput({}));
    const md = buildReportMarkdown(json);
    expect(md).toContain("No family-(ii) names dropped this run.");
  });

  it("D29-100 (P11 S1): renders the adjacent-crossref-dedupe section", () => {
    const json = buildReportJson(
      baseInput({ adjacentCrossrefDedupe: { totalOccurrences: 1147, entitiesTouched: 123 } }),
    );
    const md = buildReportMarkdown(json);
    expect(md).toContain("Adjacent-crossref dedupe");
    expect(md).toContain("1147");
    expect(md).toContain("123");
  });

  it("D29-19/-20 (P1.6): renders the excludedActors count + the statblock coverage tables", () => {
    const json = buildReportJson(
      baseInput({
        reportCounts: new Map([["excludedActors", 7]]),
        finalEntities: [
          entity({
            id: "creature/dragon",
            category: "creature",
            slug: "dragon",
            name: "Dragon",
            stats: { kind: "creature", speeds: { base: 40 } },
          }),
        ],
      }),
    );
    expect(json.excludedActorsCount).toBe(7);
    const speedsRow = json.statsCoverage.creature.find((r) => r.field === "speeds");
    expect(speedsRow).toEqual({ field: "speeds", count: 1, ofTotal: 1, pct: 100 });
    const md = buildReportMarkdown(json);
    expect(md).toContain("Statblock extraction");
    expect(md).toContain("**7**");
    expect(md).toContain("speeds");
  });
});

describe("P1.6 (D29-19/-20): stats + embedded-item field coverage", () => {
  it("computeCreatureStatsCoverage counts only creature-kind stats, per field", () => {
    const entities: CodexEntity[] = [
      entity({
        id: "creature/a",
        category: "creature",
        slug: "a",
        name: "A",
        stats: {
          kind: "creature",
          speeds: { base: 25 },
          abilityMods: { str: 4 },
          languages: ["common"],
        },
      }),
      entity({ id: "creature/b", category: "creature", slug: "b", name: "B" }), // no stats at all
      entity({ id: "spell/heal", category: "spell", slug: "heal", name: "Heal" }), // wrong category
    ];
    const coverage = computeCreatureStatsCoverage(entities);
    expect(coverage.find((r) => r.field === "speeds")).toEqual({
      field: "speeds",
      count: 1,
      ofTotal: 2, // 2 creature-category entities total, "spell/heal" excluded
      pct: 50,
    });
    expect(coverage.find((r) => r.field === "senses")).toEqual({
      field: "senses",
      count: 0,
      ofTotal: 2,
      pct: 0,
    });
  });

  it("computeHazardStatsCoverage counts only hazard-kind stats, per field", () => {
    const entities: CodexEntity[] = [
      entity({
        id: "hazard/trap",
        category: "hazard",
        slug: "trap",
        name: "Trap",
        stats: {
          kind: "hazard",
          hardness: 0,
          isComplex: true,
          disable: [],
          routine: [],
        },
      }),
    ];
    const coverage = computeHazardStatsCoverage(entities);
    expect(coverage.find((r) => r.field === "hardness")?.count).toBe(1);
    expect(coverage.find((r) => r.field === "isComplex")?.count).toBe(1);
    expect(coverage.find((r) => r.field === "disable")?.count).toBe(1);
    expect(coverage.find((r) => r.field === "routine")?.count).toBe(1);
    expect(coverage.find((r) => r.field === "reset")?.count).toBe(0);
    expect(coverage.find((r) => r.field === "stealth")?.count).toBe(0);
  });

  it("computeEmbeddedItemStatsCoverage scans melee/spellcastingEntry items across all entities", () => {
    const entities: CodexEntity[] = [
      entity({
        id: "creature/dragon",
        category: "creature",
        slug: "dragon",
        name: "Dragon",
        embeddedItems: [
          {
            name: "Jaws",
            slug: "jaws",
            type: "melee",
            traits: [],
            body: [],
            attackBonus: 29,
            damage: ["3d12+15 piercing", "2d6 fire"],
          },
          { name: "Claw", slug: "claw", type: "melee", traits: [], body: [] }, // no attackBonus/damage
          {
            name: "Arcane Innate Spells",
            slug: "arcane-innate-spells",
            type: "spellcastingEntry",
            traits: [],
            body: [],
            dc: 35,
            attack: 27,
            tradition: "arcane",
          },
        ],
      }),
    ];
    const coverage = computeEmbeddedItemStatsCoverage(entities);
    expect(coverage.find((r) => r.field === "melee.attackBonus")).toEqual({
      field: "melee.attackBonus",
      count: 1,
      ofTotal: 2,
      pct: 50,
    });
    expect(coverage.find((r) => r.field === "melee.damage")?.count).toBe(1);
    expect(coverage.find((r) => r.field === "spellcastingEntry.dc")).toEqual({
      field: "spellcastingEntry.dc",
      count: 1,
      ofTotal: 1,
      pct: 100,
    });
    expect(coverage.find((r) => r.field === "spellcastingEntry.tradition")?.count).toBe(1);
  });
});

describe("P3 S1 (D29-32/-33): facet coverage / family coverage / superseded breakdown", () => {
  describe("computeFacetCoverage", () => {
    it("computes coverage% + cardinality per key, one row per (category, key) pair actually present", () => {
      const entities: CodexEntity[] = [
        entity({
          id: "feat/a",
          category: "feat",
          slug: "a",
          name: "A",
          facets: { actionCost: "1", itemCategory: "general" },
        }),
        entity({
          id: "feat/b",
          category: "feat",
          slug: "b",
          name: "B",
          facets: { actionCost: "2" },
        }),
        entity({ id: "feat/c", category: "feat", slug: "c", name: "C" }), // no facets at all
      ];
      const coverage = computeFacetCoverage(entities);
      const actionCost = coverage.find((r) => r.category === "feat" && r.key === "actionCost");
      expect(actionCost).toEqual({
        category: "feat",
        key: "actionCost",
        count: 2,
        ofTotal: 3,
        pct: 66.7,
        cardinality: 2, // "1" and "2"
        shipped: true, // facetKeys.ts allowlists feat.actionCost
      });
      const itemCategory = coverage.find((r) => r.category === "feat" && r.key === "itemCategory");
      expect(itemCategory?.count).toBe(1);
      expect(itemCategory?.shipped).toBe(true);
    });

    it("marks a candidate NOT in facetKeys.ts as shipped: false (a dropped classifier candidate)", () => {
      const entities: CodexEntity[] = [
        entity({
          id: "spell/heal",
          category: "spell",
          slug: "heal",
          name: "Heal",
          facets: { rank: 1 }, // spell's "rank" is deliberately excluded (spillover-equivalent)
        }),
      ];
      const coverage = computeFacetCoverage(entities);
      const rank = coverage.find((r) => r.category === "spell" && r.key === "rank");
      expect(rank?.shipped).toBe(false);
    });

    it("counts array-facet cardinality by distinct ELEMENT, not distinct array", () => {
      const entities: CodexEntity[] = [
        entity({
          id: "spell/a",
          category: "spell",
          slug: "a",
          name: "A",
          facets: { traditions: ["divine", "primal"] },
        }),
        entity({
          id: "spell/b",
          category: "spell",
          slug: "b",
          name: "B",
          facets: { traditions: ["divine"] },
        }),
      ];
      const coverage = computeFacetCoverage(entities);
      const traditions = coverage.find((r) => r.category === "spell" && r.key === "traditions");
      expect(traditions?.count).toBe(2); // 2 entities carry the key
      expect(traditions?.cardinality).toBe(2); // "divine" + "primal", not 2 distinct arrays
    });

    it("skips a category with zero facets entirely (the 73-category long tail)", () => {
      const entities: CodexEntity[] = [
        entity({ id: "trait/magical", category: "trait", slug: "magical", name: "Magical" }),
      ];
      expect(computeFacetCoverage(entities)).toEqual([]);
    });
  });

  describe("computeFamilyCoverage", () => {
    it("measures family coverage over ALL creature entities, not just AoN-derived ones", () => {
      const entities: CodexEntity[] = [
        entity({
          id: "creature/a",
          category: "creature",
          slug: "a",
          name: "A",
          facets: { family: "Demon" },
        }),
        entity({
          id: "creature/b",
          category: "creature",
          slug: "b",
          name: "B",
          facets: { family: "Demon" },
        }),
        entity({ id: "creature/c", category: "creature", slug: "c", name: "C" }), // no family
        entity({ id: "spell/heal", category: "spell", slug: "heal", name: "Heal" }), // wrong category
      ];
      expect(computeFamilyCoverage(entities)).toEqual({
        count: 2,
        ofTotal: 3,
        pct: 66.7,
        distinctFamilies: 1,
      });
    });

    it("returns 0/0/0% when there are no creature entities at all", () => {
      expect(computeFamilyCoverage([])).toEqual({
        count: 0,
        ofTotal: 0,
        pct: 0,
        distinctFamilies: 0,
      });
    });
  });

  describe("computeSupersededBreakdown", () => {
    it("counts remasteredAs-non-empty entities, split by their OWN edition", () => {
      const entities: CodexEntity[] = [
        entity({
          id: "spell/heal@legacy",
          category: "spell",
          slug: "heal",
          name: "Heal",
          edition: "legacy",
          remasteredAs: ["spell/heal"],
        }),
        entity({
          id: "spell/anomaly",
          category: "spell",
          slug: "anomaly",
          name: "Anomaly",
          edition: "remaster",
          remasteredAs: ["spell/something-else"],
        }),
        entity({
          id: "spell/never-remastered",
          category: "spell",
          slug: "never-remastered",
          name: "Never Remastered",
          edition: "legacy", // NOT superseded — edition alone is not the predicate
        }),
      ];
      expect(computeSupersededBreakdown(entities)).toEqual({
        total: 2,
        legacyEdition: 1,
        remasterEdition: 1,
      });
    });
  });

  it("buildReportJson/buildReportMarkdown wire facetCoverage/familyCoverage/supersededBreakdown through", () => {
    const entities: CodexEntity[] = [
      entity({
        id: "feat/a",
        category: "feat",
        slug: "a",
        name: "A",
        facets: { actionCost: "1", itemCategory: "general" },
      }),
      entity({
        id: "creature/a",
        category: "creature",
        slug: "a",
        name: "A",
        facets: { family: "Demon" },
      }),
      entity({
        id: "spell/heal@legacy",
        category: "spell",
        slug: "heal",
        name: "Heal",
        edition: "legacy",
        remasteredAs: ["spell/heal"],
      }),
    ];
    const json = buildReportJson(baseInput({ finalEntities: entities }));
    expect(json.facetCoverage.some((r) => r.category === "feat" && r.key === "actionCost")).toBe(
      true,
    );
    expect(json.familyCoverage).toEqual({
      count: 1,
      ofTotal: 1,
      pct: 100,
      distinctFamilies: 1,
    });
    expect(json.supersededBreakdown).toEqual({ total: 1, legacyEdition: 1, remasterEdition: 0 });
    const md = buildReportMarkdown(json);
    expect(md).toContain("Facet coverage");
    expect(md).toContain("creature.family");
    expect(md).toContain("superseded");
  });
});
