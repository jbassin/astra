import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { DropAccounting } from "./drop";
import type { CategoryStat, CollisionReport, JoinResult } from "./join";
import {
  buildReportJson,
  buildReportMarkdown,
  capList,
  computeEditionBreakdown,
  computeFinalCategoryCounts,
  computeLicenseBreakdown,
  computeProseOnlyCount,
  computeVariantCount,
  type ReportInput,
} from "./report";

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
    ...overrides,
  };
}

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

const EMPTY_DROP_ACCOUNTING: DropAccounting = { totalDropped: 0, byCategory: [], carveOut: [] };

function baseInput(overrides: Partial<ReportInput>): ReportInput {
  return {
    reportCounts: new Map(),
    reportExamples: new Map(),
    hardFailureCount: 0,
    join: joinResult({}),
    finalEntities: [],
    dropAccounting: EMPTY_DROP_ACCOUNTING,
    foundrySnapshotDocCount: 28636,
    aonSnapshotDocCount: 43684,
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
});
