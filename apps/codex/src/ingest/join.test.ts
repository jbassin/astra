import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode } from "../schema/nodes";
import type { AonHit, AonDocMeta } from "./aonFacets";
import { extractAonMeta } from "./aonFacets";
import type { AonLinkTable } from "./aonLinkTable";
import {
  buildAliasMap,
  matchFoundryEntity,
  mergeJoined,
  pickVariantBase,
  qualifierCandidates,
  runJoin,
  type JoinAliasesFile,
  type RunJoinInput,
} from "./join";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "tests",
  "fixtures",
  "aon-data",
);

function readFixture(name: string): AonHit {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as AonHit;
}

const EMPTY_LINK_TABLE: AonLinkTable = { byUrl: new Map() };

function noopReport(): void {
  // no-op — most tests collect reports explicitly where they matter
}

function collector(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

/** Minimal, fully-typed `CodexEntity` factory — every field defaults to the
 * "boring" shape, override only what a test cares about. */
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

/** Minimal, fully-typed `AonDocMeta` factory for synthetic (non-fixture) test
 * docs. */
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

function runInput(overrides: Partial<RunJoinInput>): RunJoinInput {
  const { report } = collector();
  return {
    foundryEntities: new Map(),
    aonMetas: [],
    aonMarkdownById: new Map(),
    linkTable: EMPTY_LINK_TABLE,
    remasterRedirects: [],
    aliasesFile: { aliases: [] },
    report,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// qualifierCandidates
// ---------------------------------------------------------------------------

describe("qualifierCandidates", () => {
  it("single qualifier: 'A X' then bare 'X'", () => {
    expect(qualifierCandidates("Adamantine Dragon (Adult)")).toEqual([
      "adult-adamantine-dragon",
      "adamantine-dragon",
    ]);
  });

  it("two qualifiers: 'A X', 'A B X', then bare 'X'", () => {
    expect(qualifierCandidates("Adamantine Dragon (Adult, Spellcaster)")).toEqual([
      "adult-adamantine-dragon",
      "adult-spellcaster-adamantine-dragon",
      "adamantine-dragon",
    ]);
  });

  it("no trailing parenthetical -> no candidates", () => {
    expect(qualifierCandidates("Magic Missile")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Heal shared-slug pair (acceptance F) — the real 2026-07-13 snapshot fixtures
// ---------------------------------------------------------------------------

describe("runJoin: Heal shared-slug legacy/remaster pair (acceptance F)", () => {
  const healFoundry = entity({
    id: "spell/heal",
    category: "spell",
    slug: "heal",
    name: "Heal",
    edition: "remaster",
    source: { book: "Pathfinder Player Core", license: "ORC" },
    level: 1,
    traits: ["healing", "manipulate", "vitality", "positive"],
    rarity: "common",
  });

  const legacyMeta = extractAonMeta("spell", readFixture("spell-heal-legacy")); // spell-148
  const remasterMeta = extractAonMeta("spell", readFixture("spell-heal-remaster")); // spell-1554

  const result = runJoin(
    runInput({
      foundryEntities: new Map([["spell/heal", healFoundry]]),
      aonMetas: [legacyMeta, remasterMeta],
      aonMarkdownById: new Map([
        ["spell-148", "Legacy heal markdown."],
        ["spell-1554", "Remaster heal markdown."],
      ]),
    }),
  );

  it("lands as spell/heal (joined, remaster) + spell/heal@legacy (AoN-only)", () => {
    const ids = result.entities.map((e) => e.id).sort();
    expect(ids).toEqual(["spell/heal", "spell/heal@legacy"]);
  });

  it("spell/heal is the joined remaster entity, legacyOf points at spell/heal@legacy", () => {
    const heal = result.entities.find((e) => e.id === "spell/heal");
    expect(heal).toBeDefined();
    expect(heal?.edition).toBe("remaster");
    expect(heal?.legacyOf).toEqual(["spell/heal@legacy"]);
    expect(heal?.remasteredAs).toBeUndefined();
    expect(heal?.aonUrl).toBe(remasterMeta.aonUrl);
  });

  it("spell/heal@legacy is the AoN-only legacy entity, remasteredAs points at spell/heal", () => {
    const legacy = result.entities.find((e) => e.id === "spell/heal@legacy");
    expect(legacy).toBeDefined();
    expect(legacy?.edition).toBe("legacy");
    expect(legacy?.remasteredAs).toEqual(["spell/heal"]);
    expect(legacy?.legacyOf).toBeUndefined();
    expect(legacy?.proseOnly).toBe(true);
    expect(legacy?.source.license).toBe("OGL");
  });

  it("reports the shared-slug legacy pairing", () => {
    expect(result.collisions).toEqual([
      expect.objectContaining({ preId: "spell/heal", kind: "legacyPair" }),
    ]);
    expect(result.pairingCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Magic Missile (AoN-only legacy) -> Force Barrage (acceptance C/F)
// ---------------------------------------------------------------------------

describe("runJoin: Magic Missile (AoN-only legacy) -> Force Barrage (renamed pair, no shared slug)", () => {
  const forceBarrageFoundry = entity({
    id: "spell/force-barrage",
    category: "spell",
    slug: "force-barrage",
    name: "Force Barrage",
    edition: "remaster",
    source: { book: "Pathfinder Player Core", license: "ORC" },
    level: 1,
    traits: ["concentrate", "force", "manipulate"],
    rarity: "common",
  });

  const magicMissileMeta = extractAonMeta("spell", readFixture("spell-magic-missile")); // spell-180
  const forceBarrageMeta = meta({
    aonId: "spell-1536",
    category: "spell",
    name: "Force Barrage",
    slug: "force-barrage",
    aonUrl: "/Spells.aspx?ID=1536",
    level: 1,
    traits: ["Concentrate", "Force", "Manipulate"],
    rarity: "common",
    primarySource: { book: "Player Core", page: 332 },
    allSources: [{ book: "Player Core", page: 332 }],
    license: "ORC",
    edition: "remaster",
    legacyId: ["spell-180"],
  });

  const result = runJoin(
    runInput({
      foundryEntities: new Map([["spell/force-barrage", forceBarrageFoundry]]),
      aonMetas: [magicMissileMeta, forceBarrageMeta],
    }),
  );

  it("Magic Missile becomes an AoN-only entity with license OGL", () => {
    const missile = result.entities.find((e) => e.id === "spell/magic-missile");
    expect(missile).toBeDefined();
    expect(missile?.source.license).toBe("OGL");
    expect(missile?.proseOnly).toBe(true);
    expect(missile?.edition).toBe("legacy");
  });

  it("Magic Missile's remasteredAs points at spell/force-barrage (no @legacy suffix needed — different slugs)", () => {
    const missile = result.entities.find((e) => e.id === "spell/magic-missile");
    expect(missile?.remasteredAs).toEqual(["spell/force-barrage"]);
  });

  it("Force Barrage stays plain (no collision) and joins to its AoN doc", () => {
    const barrage = result.entities.find((e) => e.id === "spell/force-barrage");
    expect(barrage).toBeDefined();
    expect(barrage?.aonUrl).toBe("/Spells.aspx?ID=1536");
    expect(result.categoryStats.find((c) => c.category === "spell")?.exact).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// dragon-family qualifier-reorder join + 1:N spellcaster variant
// ---------------------------------------------------------------------------

describe("runJoin: dragon-family qualifier-reorder normalization + 1:N variant", () => {
  const adult = entity({
    id: "creature/adamantine-dragon-adult",
    category: "creature",
    slug: "adamantine-dragon-adult",
    name: "Adamantine Dragon (Adult)",
    edition: "remaster",
    source: { book: "Pathfinder Monster Core", license: "ORC" },
    level: 12,
    traits: ["dragon", "metallic"],
    facets: { hp: 230 },
  });
  const adultSpellcaster = entity({
    id: "creature/adamantine-dragon-adult-spellcaster",
    category: "creature",
    slug: "adamantine-dragon-adult-spellcaster",
    name: "Adamantine Dragon (Adult, Spellcaster)",
    edition: "remaster",
    source: { book: "Pathfinder Monster Core", license: "ORC" },
    level: 13,
    traits: ["dragon", "metallic"],
    facets: { hp: 240 },
  });
  const aonDragon = meta({
    aonId: "creature-2933",
    category: "creature",
    name: "Adult Adamantine Dragon",
    slug: "adult-adamantine-dragon",
    aonUrl: "/Monsters.aspx?ID=2933",
    level: 12,
  });

  const result = runJoin(
    runInput({
      foundryEntities: new Map([
        [adult.id, adult],
        [adultSpellcaster.id, adultSpellcaster],
      ]),
      aonMetas: [aonDragon],
    }),
  );

  it("the shorter-named base joins via normalization, and keeps its own Foundry facets", () => {
    const base = result.entities.find((e) => e.id === "creature/adamantine-dragon-adult");
    expect(base).toBeDefined();
    expect(base?.aonUrl).toBe("/Monsters.aspx?ID=2933");
    expect(base?.facets.hp).toBe(230); // Foundry wins mechanics
    expect(base?.variantOf).toBeUndefined();
    const stat = result.categoryStats.find((c) => c.category === "creature");
    expect(stat?.normalized).toBe(1);
  });

  it("the longer-named (Adult, Spellcaster) doc becomes a variant of the base, with no aonUrl of its own", () => {
    const variant = result.entities.find(
      (e) => e.id === "creature/adamantine-dragon-adult-spellcaster",
    );
    expect(variant).toBeDefined();
    expect(variant?.variantOf).toBe("creature/adamantine-dragon-adult");
    expect(variant?.aonUrl).toBeUndefined();
    expect(variant?.facets.hp).toBe(240); // keeps its OWN foundry mechanics
    const stat = result.categoryStats.find((c) => c.category === "creature");
    expect(stat?.variants).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// alias-driven join (join-aliases.json mechanism)
// ---------------------------------------------------------------------------

describe("runJoin: alias-driven join (join-aliases.json)", () => {
  const camouflageCoat = entity({
    id: "feat/camouflage-coat",
    category: "feat",
    slug: "camouflage-coat",
    name: "Camouflage Coat",
    edition: "remaster",
    level: 13,
  });
  const aonTypo = meta({
    aonId: "feat-5337",
    category: "feat",
    name: "Camoflage Coat", // real AoN typo (missing "u")
    slug: "camoflage-coat",
    level: 13,
  });
  const aliasesFile: JoinAliasesFile = {
    aliases: [{ foundryId: "feat/camouflage-coat", aonId: "feat-5337", note: "typo: missing u" }],
  };

  it("does NOT match via exact or normalization (no trailing parenthetical, different slugs)", () => {
    expect(matchFoundryEntity(camouflageCoat, new Map(), new Map(), new Map())).toBeUndefined();
  });

  it("matches via the alias map and is reported in aliasesApplied", () => {
    const result = runJoin(
      runInput({
        foundryEntities: new Map([[camouflageCoat.id, camouflageCoat]]),
        aonMetas: [aonTypo],
        aliasesFile,
      }),
    );
    const joined = result.entities.find((e) => e.id === "feat/camouflage-coat");
    expect(joined?.aonUrl).toBe(aonTypo.aonUrl);
    expect(result.categoryStats.find((c) => c.category === "feat")?.alias).toBe(1);
    expect(result.aliasesApplied).toEqual([
      { foundryId: "feat/camouflage-coat", aonId: "feat-5337", note: "typo: missing u" },
    ]);
  });

  it("buildAliasMap turns the file into a foundryId -> aonId map", () => {
    expect(buildAliasMap(aliasesFile)).toEqual(new Map([["feat/camouflage-coat", "feat-5337"]]));
  });
});

// ---------------------------------------------------------------------------
// non-pair collision -> deterministic -2 suffix
// ---------------------------------------------------------------------------

describe("runJoin: non-pair residual collision -> deterministic suffix", () => {
  // Two UNRELATED AoN docs coincidentally sharing (category, slug) — no
  // Foundry counterpart, and NOT linked via remasterId/legacyId, so this is
  // the residual (not legacy-pair) collision path.
  const gizmoAlpha = meta({
    aonId: "trinket-1",
    category: "trinket",
    name: "Gizmo Alpha",
    slug: "gizmo",
    edition: "remaster",
  });
  const gizmoBeta = meta({
    aonId: "trinket-2",
    category: "trinket",
    name: "Gizmo Beta",
    slug: "gizmo",
    edition: "legacy",
  });

  const result = runJoin(runInput({ aonMetas: [gizmoAlpha, gizmoBeta] }));

  it("remaster-edition member wins the plain slug, legacy-edition gets -2", () => {
    const alpha = result.entities.find((e) => e.name === "Gizmo Alpha");
    const beta = result.entities.find((e) => e.name === "Gizmo Beta");
    expect(alpha?.id).toBe("trinket/gizmo");
    expect(beta?.id).toBe("trinket/gizmo-2");
  });

  it("reports the collision as residual, not legacyPair", () => {
    expect(result.collisions).toEqual([
      expect.objectContaining({ preId: "trinket/gizmo", kind: "residual" }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// crossref/embed patching after a rename
// ---------------------------------------------------------------------------

describe("runJoin: crossref/embed patching", () => {
  it("an embed targeting the legacy half's aonId resolves to the renamed @legacy id", () => {
    const healFoundry = entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      edition: "remaster",
      source: { book: "Pathfinder Player Core", license: "ORC" },
    });
    // A third, unrelated entity embeds the LEGACY Heal doc by its raw AoN id
    // (spell-148) — pre-join this is unresolved (`resolved: false`).
    const embedNode: CodexNode = { kind: "embed", target: "spell-148", resolved: false };
    const embedder = entity({
      id: "feat/some-feat",
      category: "feat",
      slug: "some-feat",
      name: "Some Feat",
      body: [{ kind: "paragraph", children: [embedNode as never] }] as unknown as BlockNode[],
    });

    const legacyMeta = extractAonMeta("spell", readFixture("spell-heal-legacy")); // spell-148
    const remasterMeta = extractAonMeta("spell", readFixture("spell-heal-remaster")); // spell-1554

    const result = runJoin(
      runInput({
        foundryEntities: new Map([
          ["spell/heal", healFoundry],
          ["feat/some-feat", embedder],
        ]),
        aonMetas: [legacyMeta, remasterMeta],
      }),
    );

    const patchedEmbedder = result.entities.find((e) => e.id === "feat/some-feat");
    const paragraph = patchedEmbedder?.body[0] as { children: CodexNode[] } | undefined;
    const patchedEmbed = paragraph?.children[0];
    expect(patchedEmbed).toEqual({ kind: "embed", target: "spell/heal@legacy", resolved: true });
    expect(result.patchStats.resolvedEmbeds).toBe(1);
  });

  it("a crossref whose target no longer exists anywhere becomes brokenRef (report-counted)", () => {
    const crossrefNode: CodexNode = {
      kind: "crossref",
      targetId: "spell/does-not-exist",
      display: "Nonexistent",
    };
    const holder = entity({
      id: "feat/holder",
      category: "feat",
      slug: "holder",
      name: "Holder",
      body: [{ kind: "paragraph", children: [crossrefNode as never] }] as unknown as BlockNode[],
    });

    const { reports, report } = collector();
    const result = runJoin(runInput({ foundryEntities: new Map([[holder.id, holder]]), report }));

    const patched = result.entities.find((e) => e.id === "feat/holder");
    const paragraph = patched?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual({
      kind: "brokenRef",
      target: "spell/does-not-exist",
      display: "Nonexistent",
    });
    expect(result.patchStats.brokenAfterPatch).toBe(1);
    expect(reports.some((r) => r.cls === "joinBrokenRef")).toBe(true);
  });

  it("a crossref whose target still exists is left untouched", () => {
    const target = entity({ id: "feat/target", category: "feat", slug: "target", name: "Target" });
    const crossrefNode: CodexNode = {
      kind: "crossref",
      targetId: "feat/target",
      display: "Target",
    };
    const holder = entity({
      id: "feat/holder2",
      category: "feat",
      slug: "holder2",
      name: "Holder2",
      body: [{ kind: "paragraph", children: [crossrefNode as never] }] as unknown as BlockNode[],
    });

    const result = runJoin(
      runInput({
        foundryEntities: new Map([
          [target.id, target],
          [holder.id, holder],
        ]),
      }),
    );
    const patched = result.entities.find((e) => e.id === "feat/holder2");
    const paragraph = patched?.body[0] as { children: CodexNode[] } | undefined;
    expect(paragraph?.children[0]).toEqual(crossrefNode);
    expect(result.patchStats.brokenAfterPatch).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// field-ownership merge (mergeJoined directly)
// ---------------------------------------------------------------------------

describe("mergeJoined: field ownership (D29-7)", () => {
  const foundryEnt = entity({
    id: "spell/fireball",
    category: "spell",
    slug: "fireball",
    name: "Fireball",
    edition: "remaster",
    source: { book: "Pathfinder Player Core", license: "ORC" },
    level: 3,
    traits: ["evocation", "fire"],
    rarity: "common",
    facets: { rank: 3, range: "500 feet" },
    body: [
      {
        kind: "paragraph",
        children: [
          {
            kind: "text",
            content: "foundry body",
            marks: { bold: false, italic: false, superscript: false },
          },
        ],
      },
    ],
  });
  const aonFireball = meta({
    aonId: "spell-100",
    category: "spell",
    name: "Fireball",
    slug: "fireball",
    level: 3,
    traits: ["Evocation", "Fire"],
    rarity: "common",
    primarySource: { book: "Player Core", page: 200 },
    hasMarkdown: true,
  });

  it("AoN body wins when AoN has markdown; Foundry facets/level/traits/rarity stay; citation book comes from AoN", () => {
    const { report } = collector();
    const merged = mergeJoined(foundryEnt, aonFireball, {
      aonMarkdownById: new Map([["spell-100", "AoN prose body."]]),
      resolveLink: () => ({
        kind: "text",
        content: "x",
        marks: { bold: false, italic: false, superscript: false },
      }),
      report,
    });
    expect(merged.facets).toEqual({ rank: 3, range: "500 feet" }); // Foundry wins mechanics
    expect(merged.level).toBe(3);
    expect(merged.traits).toEqual(["evocation", "fire"]);
    expect(merged.rarity).toBe("common");
    expect(merged.source).toEqual({ book: "Player Core", page: 200, license: "ORC" }); // AoN wins citation
    expect(merged.body).not.toEqual(foundryEnt.body); // AoN prose replaced the Foundry body
    expect(merged.aonUrl).toBe(aonFireball.aonUrl);
  });

  it("falls back to the Foundry body when the AoN doc has no markdown", () => {
    const noMarkdownMeta = meta({ ...aonFireball, hasMarkdown: false });
    const merged = mergeJoined(foundryEnt, noMarkdownMeta, {
      aonMarkdownById: new Map(), // no entry at all
      resolveLink: () => ({
        kind: "text",
        content: "x",
        marks: { bold: false, italic: false, superscript: false },
      }),
      report: noopReport,
    });
    expect(merged.body).toEqual(foundryEnt.body);
  });

  it("reports (but does not apply) a level/rarity/traits disagreement", () => {
    const disagreeingMeta = meta({
      ...aonFireball,
      level: 4,
      rarity: "uncommon",
      traits: ["Necromancy"],
    });
    const { reports, report } = collector();
    const merged = mergeJoined(foundryEnt, disagreeingMeta, {
      aonMarkdownById: new Map(),
      resolveLink: () => ({
        kind: "text",
        content: "x",
        marks: { bold: false, italic: false, superscript: false },
      }),
      report,
    });
    expect(merged.level).toBe(3); // Foundry still wins
    expect(merged.rarity).toBe("common");
    expect(reports.some((r) => r.cls === "levelMismatch")).toBe(true);
    expect(reports.some((r) => r.cls === "rarityMismatch")).toBe(true);
    expect(reports.some((r) => r.cls === "traitsMismatch")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pickVariantBase
// ---------------------------------------------------------------------------

describe("pickVariantBase", () => {
  it("picks the shortest name, then alphabetical", () => {
    const a = entity({
      id: "creature/a",
      category: "creature",
      slug: "a",
      name: "Zeta Longer Name",
    });
    const b = entity({ id: "creature/b", category: "creature", slug: "b", name: "Short" });
    expect(pickVariantBase([a, b]).id).toBe("creature/b");

    // Same-length names -> alphabetical tiebreak.
    const c = entity({ id: "creature/c", category: "creature", slug: "c", name: "Beta" });
    const d = entity({ id: "creature/d", category: "creature", slug: "d", name: "Alfa" });
    expect(pickVariantBase([c, d]).id).toBe("creature/d");
  });
});
