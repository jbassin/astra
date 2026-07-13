import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, CodexNode } from "../schema/nodes";
import type { AonHit, AonDocMeta } from "./aonFacets";
import { extractAonMeta } from "./aonFacets";
import { buildAonLinkTable, type AonLinkTable } from "./aonLinkTable";
import { applyAonPrimaryDrop } from "./drop";
import {
  buildAliasMap,
  domainCandidates,
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
// domainCandidates (D29-15(1))
// ---------------------------------------------------------------------------

describe("domainCandidates", () => {
  it("strips a trailing ' Domain' suffix", () => {
    expect(domainCandidates("Air Domain")).toEqual(["air"]);
    expect(domainCandidates("Abomination Domain")).toEqual(["abomination"]);
  });

  it("is case-insensitive on the suffix", () => {
    expect(domainCandidates("Air domain")).toEqual(["air"]);
  });

  it("no trailing ' Domain' -> no candidates", () => {
    expect(domainCandidates("Air")).toEqual([]);
    expect(domainCandidates("Domain")).toEqual([]); // no base left
  });
});

// ---------------------------------------------------------------------------
// D29-15/-16: category equivalence (P1.5 — the STOP-condition fix)
// ---------------------------------------------------------------------------

describe("matchFoundryEntity: D29-15 category equivalence", () => {
  it("weapon exact-matches an AoN doc filed under 'equipment' (D29-15(2))", () => {
    const foundryWeapon = entity({
      id: "weapon/drake-rifle",
      category: "weapon",
      slug: "drake-rifle",
      name: "Drake Rifle",
    });
    const equipmentMeta = meta({
      aonId: "equipment-9001",
      category: "equipment",
      name: "Drake Rifle",
      slug: "drake-rifle",
    });
    const aonSlugIndex = new Map([["equipment/drake-rifle", equipmentMeta]]);
    const result = matchFoundryEntity(foundryWeapon, aonSlugIndex, new Map(), new Map());
    expect(result).toEqual({ aonId: "equipment-9001", via: "exact" });
  });

  it("armor and shield also reach 'equipment'", () => {
    const armorMeta = meta({
      aonId: "equipment-1",
      category: "equipment",
      name: "Full Plate",
      slug: "full-plate",
    });
    const shieldMeta = meta({
      aonId: "equipment-2",
      category: "equipment",
      name: "Tower Shield",
      slug: "tower-shield",
    });
    const aonSlugIndex = new Map([
      ["equipment/full-plate", armorMeta],
      ["equipment/tower-shield", shieldMeta],
    ]);
    expect(
      matchFoundryEntity(
        entity({
          id: "armor/full-plate",
          category: "armor",
          slug: "full-plate",
          name: "Full Plate",
        }),
        aonSlugIndex,
        new Map(),
        new Map(),
      ),
    ).toEqual({ aonId: "equipment-1", via: "exact" });
    expect(
      matchFoundryEntity(
        entity({
          id: "shield/tower-shield",
          category: "shield",
          slug: "tower-shield",
          name: "Tower Shield",
        }),
        aonSlugIndex,
        new Map(),
        new Map(),
      ),
    ).toEqual({ aonId: "equipment-2", via: "exact" });
  });

  it("a weapon's own category still wins over the equipment equivalence when both exist", () => {
    const ownCategoryMeta = meta({
      aonId: "weapon-1",
      category: "weapon",
      name: "Drake Rifle",
      slug: "drake-rifle",
    });
    const equipmentMeta = meta({
      aonId: "equipment-9001",
      category: "equipment",
      name: "Drake Rifle",
      slug: "drake-rifle",
    });
    const aonSlugIndex = new Map([
      ["weapon/drake-rifle", ownCategoryMeta],
      ["equipment/drake-rifle", equipmentMeta],
    ]);
    const result = matchFoundryEntity(
      entity({
        id: "weapon/drake-rifle",
        category: "weapon",
        slug: "drake-rifle",
        name: "Drake Rifle",
      }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(result).toEqual({ aonId: "weapon-1", via: "exact" });
  });

  it("class-feature reaches a class-subsystem category (ikon)", () => {
    const ikonMeta = meta({ aonId: "ikon-1", category: "ikon", name: "Sword", slug: "sword" });
    const aonSlugIndex = new Map([["ikon/sword", ikonMeta]]);
    const result = matchFoundryEntity(
      entity({
        id: "class-feature/sword",
        category: "class-feature",
        slug: "sword",
        name: "Sword",
      }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(result).toEqual({ aonId: "ikon-1", via: "exact" });
  });

  it("spell reaches the ritual category", () => {
    const ritualMeta = meta({
      aonId: "ritual-1",
      category: "ritual",
      name: "Atone",
      slug: "atone",
    });
    const aonSlugIndex = new Map([["ritual/atone", ritualMeta]]);
    const result = matchFoundryEntity(
      entity({ id: "spell/atone", category: "spell", slug: "atone", name: "Atone" }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(result).toEqual({ aonId: "ritual-1", via: "exact" });
  });

  it("domain 'X Domain' matches AoN's bare 'X' via the normalized tier", () => {
    const domainMeta = meta({ aonId: "domain-1", category: "domain", name: "Air", slug: "air" });
    const aonSlugIndex = new Map([["domain/air", domainMeta]]);
    const result = matchFoundryEntity(
      entity({
        id: "domain/air-domain",
        category: "domain",
        slug: "air-domain",
        name: "Air Domain",
      }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(result).toEqual({ aonId: "domain-1", via: "normalized" });
  });

  it("action ↔ feat/tactic/relic: matches when levels agree (or either side is silent)", () => {
    const featMeta = meta({
      aonId: "feat-1",
      category: "feat",
      name: "Assurance",
      slug: "assurance",
      level: 1,
    });
    const aonSlugIndex = new Map([["feat/assurance", featMeta]]);
    const withMatchingLevel = matchFoundryEntity(
      entity({
        id: "action/assurance",
        category: "action",
        slug: "assurance",
        name: "Assurance",
        level: 1,
      }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(withMatchingLevel).toEqual({ aonId: "feat-1", via: "exact" });

    const withNoFoundryLevel = matchFoundryEntity(
      entity({ id: "action/assurance", category: "action", slug: "assurance", name: "Assurance" }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(withNoFoundryLevel).toEqual({ aonId: "feat-1", via: "exact" });
  });

  it("action ↔ feat/tactic/relic guard: REJECTS the match when both sides carry a DIFFERENT level (same-name twins)", () => {
    const featMeta = meta({
      aonId: "feat-1",
      category: "feat",
      name: "Assurance",
      slug: "assurance",
      level: 7, // a level-7 FEAT that happens to share the name of a level-1 action
    });
    const aonSlugIndex = new Map([["feat/assurance", featMeta]]);
    const result = matchFoundryEntity(
      entity({
        id: "action/assurance",
        category: "action",
        slug: "assurance",
        name: "Assurance",
        level: 1,
      }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(result).toBeUndefined();
  });

  it("action ↔ feat/tactic/relic guard: exact-only — a name needing qualifier-reorder does NOT reach these categories", () => {
    // The guard skips the normalized tier entirely for requireLevelAgreement
    // rules, even when the levels would agree.
    const relicMeta = meta({
      aonId: "relic-1",
      category: "relic",
      name: "Blessed Blade (Minor)",
      slug: "blessed-blade-minor",
      level: 5,
    });
    const aonSlugIndex = new Map([["relic/minor-blessed-blade", relicMeta]]);
    const result = matchFoundryEntity(
      entity({
        id: "action/blessed-blade",
        category: "action",
        slug: "blessed-blade",
        name: "Blessed Blade (Minor)",
        level: 5,
      }),
      aonSlugIndex,
      new Map(),
      new Map(),
    );
    expect(result).toBeUndefined();
  });
});

describe("runJoin: D29-15(6) tier-parenthetical fold via the weapon/armor/shield -> equipment equivalence", () => {
  const base = entity({
    id: "weapon/bracers-of-armor",
    category: "weapon",
    slug: "bracers-of-armor",
    name: "Bracers of Armor",
  });
  const greater = entity({
    id: "weapon/bracers-of-armor-greater",
    category: "weapon",
    slug: "bracers-of-armor-greater",
    name: "Bracers of Armor (Greater)",
  });
  const aonBase = meta({
    aonId: "equipment-500",
    category: "equipment",
    name: "Bracers of Armor",
    slug: "bracers-of-armor",
  });

  const result = runJoin(
    runInput({
      foundryEntities: new Map([
        [base.id, base],
        [greater.id, greater],
      ]),
      aonMetas: [aonBase],
    }),
  );

  it("the base joins directly (exact, via the equipment equivalence)", () => {
    const joined = result.entities.find((e) => e.id === "weapon/bracers-of-armor");
    expect(joined?.aonUrl).toBe(aonBase.aonUrl);
    expect(joined?.variantOf).toBeUndefined();
  });

  it("the tier variant (no AoN doc of its own) becomes variantOf the base via the existing 1:N machinery", () => {
    const variant = result.entities.find((e) => e.id === "weapon/bracers-of-armor-greater");
    expect(variant?.variantOf).toBe("weapon/bracers-of-armor");
    expect(variant?.aonUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// S5d: inbound-link repointing across cross-category merges
// ---------------------------------------------------------------------------

describe("runJoin: S5d — inbound AoN links repoint across cross-category merges", () => {
  // The real, verified Accursed Staff shape (the S5d brief): the remaster
  // AoN `equipment` doc (url ID 2244) merges into the Foundry `weapon`
  // entity; its legacy twin (url ID 4778, SAME category+slug, different url)
  // stays an AoN-only entity that still owns the `equipment/accursed-staff`
  // id string — so a patch-time string rewrite could never route the two
  // urls differently; only the resolution-time aonId-keyed repoint can.
  const foundryStaff = entity({
    id: "weapon/accursed-staff",
    category: "weapon",
    slug: "accursed-staff",
    name: "Accursed Staff",
    edition: "remaster",
  });
  const remasterMeta = meta({
    aonId: "equipment-2244",
    category: "equipment",
    name: "Accursed Staff",
    slug: "accursed-staff",
    aonUrl: "/Equipment.aspx?ID=2244",
    edition: "remaster",
    hasMarkdown: true,
  });
  const legacyMeta = meta({
    aonId: "equipment-4778",
    category: "equipment",
    name: "Accursed Staff",
    slug: "accursed-staff",
    aonUrl: "/Equipment.aspx?ID=4778",
    edition: "legacy",
    hasMarkdown: true,
  });
  // An unrelated AoN-only spell whose markdown links to BOTH urls plus one
  // genuinely absent url.
  const linkerMeta = meta({
    aonId: "spell-1",
    category: "spell",
    name: "Linker",
    slug: "linker",
    aonUrl: "/Spells.aspx?ID=1",
    hasMarkdown: true,
  });
  const allMetas = [remasterMeta, legacyMeta, linkerMeta];
  const linkTable = buildAonLinkTable(
    allMetas.map((m) => ({
      aonId: m.aonId,
      category: m.category,
      slug: m.slug,
      aonUrl: m.aonUrl,
      name: m.name,
    })),
    noopReport,
  );
  const aonMarkdownById = new Map([
    // The merged doc's own body self-links to its own url (the real
    // Accursed Staff markdown does exactly this in its <title>).
    ["equipment-2244", "See [Accursed Staff](/Equipment.aspx?ID=2244)."],
    ["equipment-4778", "Legacy text."],
    [
      "spell-1",
      "Links: [merged](/Equipment.aspx?ID=2244) [twin](/Equipment.aspx?ID=4778) [absent](/Equipment.aspx?ID=9999).",
    ],
  ]);

  function crossrefTargets(e: CodexEntity | undefined): string[] {
    const targets: string[] = [];
    function walk(nodes: readonly CodexNode[]): void {
      for (const n of nodes) {
        if (n.kind === "crossref") targets.push(n.targetId);
        if ("children" in n && Array.isArray(n.children)) walk(n.children as CodexNode[]);
        if (n.kind === "list") for (const item of n.items) walk(item);
      }
    }
    if (e) walk(e.body);
    return targets;
  }

  function brokenRefTargets(e: CodexEntity | undefined): string[] {
    const targets: string[] = [];
    function walk(nodes: readonly CodexNode[]): void {
      for (const n of nodes) {
        if (n.kind === "brokenRef") targets.push(n.target);
        if ("children" in n && Array.isArray(n.children)) walk(n.children as CodexNode[]);
      }
    }
    if (e) walk(e.body);
    return targets;
  }

  const { reports, report } = collector();
  const result = runJoin(
    runInput({
      foundryEntities: new Map([[foundryStaff.id, foundryStaff]]),
      aonMetas: allMetas,
      aonMarkdownById,
      linkTable,
      report,
    }),
  );

  it("(a) an inbound link to the cross-category-merged doc's url resolves to the merged entity's FINAL id", () => {
    const linker = result.entities.find((e) => e.id === "spell/linker");
    expect(crossrefTargets(linker)).toContain("weapon/accursed-staff");
    expect(reports.some((r) => r.cls === "crossCategoryLinkRepointed")).toBe(true);
  });

  it("(b) the legacy-twin silent-mislink case: the merged entity's own self-link reaches ITSELF, and a link to the twin's url reaches the twin", () => {
    const merged = result.entities.find((e) => e.id === "weapon/accursed-staff");
    expect(merged?.aonUrl).toBe("/Equipment.aspx?ID=2244");
    // The self-link inside the merged doc's own parsed body must point back
    // at the merged entity — NOT at the legacy twin that still owns the
    // `equipment/accursed-staff` id string (the report-invisible mislink).
    expect(crossrefTargets(merged)).toEqual(["weapon/accursed-staff"]);

    const linker = result.entities.find((e) => e.id === "spell/linker");
    expect(crossrefTargets(linker)).toContain("equipment/accursed-staff"); // the twin, via ITS url
    const twin = result.entities.find((e) => e.id === "equipment/accursed-staff");
    expect(twin?.proseOnly).toBe(true);
    expect(twin?.edition).toBe("legacy");
  });

  it("(c) a link to a genuinely absent doc still downgrades to brokenRef", () => {
    const linker = result.entities.find((e) => e.id === "spell/linker");
    expect(brokenRefTargets(linker)).toEqual(["/Equipment.aspx?ID=9999"]);
    expect(reports.some((r) => r.cls === "aonBrokenLink")).toBe(true);
  });

  it("the D29-14 drop pass reconciliation accepts the repointed ids (merged entities are kept, so repointed crossrefs survive)", () => {
    const dropResult = applyAonPrimaryDrop(result.entities, report);
    const linker = dropResult.keptEntities.find((e) => e.id === "spell/linker");
    expect(crossrefTargets(linker)).toContain("weapon/accursed-staff");
    expect(crossrefTargets(linker)).toContain("equipment/accursed-staff");
    expect(reports.some((r) => r.cls === "postDropBrokenRef")).toBe(false);
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

  it("D29-16: a CROSS-CATEGORY merge (e.g. weapon <- equipment) takes the AoN name, keeps Foundry's id/category", () => {
    const foundryWeapon = entity({
      id: "weapon/drake-rifle",
      category: "weapon",
      slug: "drake-rifle",
      name: "Drake Rifle (Foundry Name)",
    });
    const equipmentMeta = meta({
      aonId: "equipment-9001",
      category: "equipment",
      name: "Drake Rifle",
      slug: "drake-rifle",
    });
    const { reports, report } = collector();
    const merged = mergeJoined(foundryWeapon, equipmentMeta, {
      aonMarkdownById: new Map(),
      resolveLink: () => ({
        kind: "text",
        content: "x",
        marks: { bold: false, italic: false, superscript: false },
      }),
      report,
    });
    expect(merged.name).toBe("Drake Rifle"); // AoN name wins
    expect(merged.id).toBe("weapon/drake-rifle"); // Foundry's finer category/id unchanged
    expect(merged.category).toBe("weapon");
    expect(reports.some((r) => r.cls === "crossCategoryMerge")).toBe(true);
  });

  it("a SAME-category merge keeps the Foundry name (unchanged S4 behavior)", () => {
    const foundryFireball = entity({ ...foundryEnt, name: "Fireball (Foundry Name)" });
    const merged = mergeJoined(foundryFireball, aonFireball, {
      aonMarkdownById: new Map(),
      resolveLink: () => ({
        kind: "text",
        content: "x",
        marks: { bold: false, italic: false, superscript: false },
      }),
      report: noopReport,
    });
    expect(merged.name).toBe("Fireball (Foundry Name)");
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
