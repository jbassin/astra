import { describe, expect, it } from "vitest";

import { resolveClassPageData, resolveClassRail } from "./classPageData";
import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";

/**
 * P12 S2 (D29-117) tier 2 — `resolveClassPageData`/`resolveClassRail` over
 * the fixture corpus (S1's `class/{fighter,cleric,witch,investigator@legacy,
 * witch@legacy}` fixtures, D29-113..116). Mirrors `entityPageData.test.ts`'s
 * own posture: a plain function, directly unit-testable with
 * `createCorpusReader(fixtureCorpusRoot())`, no config/Start-runtime
 * involved.
 */
describe("resolveClassRail (D29-118)", () => {
  it("splits the fixture's 5 class docs into exactly 3 visible (stats-bearing, non-superseded) and 2 hidden (superseded)", () => {
    const reader = createCorpusReader(fixtureCorpusRoot());
    const rail = resolveClassRail(reader);
    expect(rail.visible.map((r) => r.id)).toEqual(["class/cleric", "class/fighter", "class/witch"]);
    expect(rail.hidden.map((r) => r.id).sort()).toEqual([
      "class/investigator@legacy",
      "class/witch@legacy",
    ]);
  });

  it("visible rows carry their edition, sorted A-Z by name", () => {
    const reader = createCorpusReader(fixtureCorpusRoot());
    const rail = resolveClassRail(reader);
    for (const row of rail.visible) expect(row.edition).toBe("remaster");
    const names = rail.visible.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("resolveClassPageData (D29-117)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("returns null for an unknown slug in the class category (loader 404 input)", () => {
    expect(resolveClassPageData(reader, { slug: "not-a-real-class" })).toBeNull();
  });

  it("fighter: all 16 clean grants resolve, slim-projected ({id,name,level,body}), sorted (level,name)", () => {
    const data = resolveClassPageData(reader, { slug: "fighter" });
    expect(data).not.toBeNull();
    expect(data?.entity.id).toBe("class/fighter");
    expect(data?.grantedFeatures?.length).toBe(16);
    // Every projected feature is SLIM — no `facets`/`traits`/`source` leak
    // through (the P9 dehydration-size reasoning, D29-117's own text).
    for (const feature of data?.grantedFeatures ?? []) {
      expect(Object.keys(feature).sort()).toEqual(["body", "id", "level", "name"]);
    }
    // Sorted (level, name) — the first two are both level 1, alphabetical.
    expect(data?.grantedFeatures?.[0]).toMatchObject({
      id: "class-feature/reactive-strike",
      name: "Reactive Strike",
      level: 1,
    });
    expect(data?.grantedFeatures?.[1]).toMatchObject({
      id: "class-feature/shield-block",
      name: "Shield Block",
      level: 1,
    });
    // The GRANT's own level wins over the resolved doc's intrinsic `level`
    // field where they differ — `class-feature/weapon-specialization`'s own
    // `level` is 7 (fighter's context) but this same doc is ALSO witch's
    // level-13 grant (proven in the witch case below); fighter grants it at
    // level 7, matching the doc's own field here (a coincidence, not a
    // reliance — the witch case is what actually proves grant-level wins).
    const weaponSpec = data?.grantedFeatures?.find(
      (f) => f.id === "class-feature/weapon-specialization",
    );
    expect(weaponSpec?.level).toBe(7);
  });

  it("embed-map coverage: a granted feature's OWN body embed is prefetched into the merged map (the D29-117 blocker)", () => {
    // `class-feature/reactive-strike`'s body carries one resolved `embed`
    // node targeting `action/pursue-a-lead-2` (added for this slice — the
    // fixture pre-S2 had no embed inside any granted-feature body at all;
    // reused rather than minted a brand-new action fixture, since
    // `action/pursue-a-lead-2` already exists for `investigator@legacy`'s
    // own embed-prefetch case in `entityPageData.test.ts`). Fighter's own
    // class body carries ZERO embeds/pointers itself (verified: no
    // `remasteredAs`/`legacyOf`, no body embed) — this key can ONLY be
    // present via the D29-117 wider embed-collection pass, proving the
    // "class body AND every granted-feature body" merge actually runs.
    const data = resolveClassPageData(reader, { slug: "fighter" });
    expect(data?.embeds["action/pursue-a-lead-2"]?.id).toBe("action/pursue-a-lead-2");
    expect(data?.embedCapHit).toBe(false);
  });

  it("cleric: the null-stub grant ('First Doctrine') passes through stats untouched and is simply absent from the slim projection", () => {
    const data = resolveClassPageData(reader, { slug: "cleric" });
    expect(data).not.toBeNull();
    // The raw stats still carry BOTH grants, null targetId included (S3's
    // progression table reads this directly — D29-114's own "still appear
    // ... as plain text" text) — this resolver must not mutate it.
    expect(data?.entity.stats?.kind).toBe("class");
    if (data?.entity.stats?.kind === "class") {
      expect(data.entity.stats.grantedFeatures).toEqual([
        { level: 1, name: "Doctrine", targetId: "class-feature/doctrine" },
        { level: 1, name: "First Doctrine", targetId: null },
      ]);
    }
    // Only the ONE resolvable grant is slim-projected.
    expect(data?.grantedFeatures?.length).toBe(1);
    expect(data?.grantedFeatures?.[0]?.id).toBe("class-feature/doctrine");
  });

  it("witch: the shared class-feature/weapon-specialization grant proves grant-level wins over the doc's own intrinsic level", () => {
    // `class-feature/weapon-specialization` is BOTH fighter's level-7 grant
    // (asserted above) AND witch's level-13 grant — the doc's own `level`
    // field is 7 (fighter's context) — this is the actual divergence proof
    // the fighter case alone can't provide (there, grant level and doc
    // level happen to coincide).
    const data = resolveClassPageData(reader, { slug: "witch" });
    const weaponSpec = data?.grantedFeatures?.find(
      (f) => f.id === "class-feature/weapon-specialization",
    );
    expect(weaponSpec).toBeDefined();
    expect(weaponSpec?.level).toBe(13);
  });

  it("witch: ?subclass= selects the requested targetIds ONLY, in subclassOptions order, resolving into full CodexEntity docs", () => {
    const data = resolveClassPageData(reader, {
      slug: "witch",
      subclassTargetIds: ["class-feature/baba-yaga", "class-feature/lesson-of-bargains"],
    });
    expect(data).not.toBeNull();
    // Requested out of subclassOptions order (patron first, lesson second)
    // -> resolved back in the OPTIONS' own canonical order (lesson category
    // precedes patron in witch's subclassOptions array).
    expect(data?.selectedSubclasses?.map((d) => d.id)).toEqual([
      "class-feature/lesson-of-bargains",
      "class-feature/baba-yaga",
    ]);
  });

  it("witch: an unselected/legacy-husk subclass targetId never leaks into selectedSubclasses", () => {
    const data = resolveClassPageData(reader, {
      slug: "witch",
      subclassTargetIds: ["lesson/lesson-of-bargains"], // the LEGACY husk, not requested via its remaster half
    });
    // The legacy husk targetId IS a real `subclassOptions` entry (superseded:
    // true) — requesting it directly must still resolve it (the reveal
    // control just controls which PILLS render, not which targets are
    // fetchable), proving the filter is membership-in-`subclassOptions`, not
    // an implicit "current only" gate.
    expect(data?.selectedSubclasses?.map((d) => d.id)).toEqual(["lesson/lesson-of-bargains"]);
  });

  it("witch: no ?subclass= at all means selectedSubclasses is absent (never an empty array)", () => {
    const data = resolveClassPageData(reader, { slug: "witch" });
    expect(data?.selectedSubclasses).toBeUndefined();
  });

  it("witch: a ?subclass= token that doesn't match any of THIS class's own subclassOptions resolves to nothing", () => {
    const data = resolveClassPageData(reader, {
      slug: "witch",
      subclassTargetIds: ["class-feature/cloistered-cleric"], // a REAL id, but cleric's, not witch's
    });
    expect(data?.selectedSubclasses).toBeUndefined();
  });

  it("investigator@legacy: fail-soft — no stats.kind==='class', so grantedFeatures/selectedSubclasses are both absent, but the shell-needed fields (rail/embeds/knownTraitIds) are all still populated", () => {
    const data = resolveClassPageData(reader, { slug: "investigator@legacy" });
    expect(data).not.toBeNull();
    expect(data?.entity.stats).toBeUndefined();
    expect(data?.grantedFeatures).toBeUndefined();
    expect(data?.selectedSubclasses).toBeUndefined();
    // The generic-pane fields `EntityRenderPane` needs are still present —
    // this doc's own real embed-prefetch case (3 action docs,
    // `entityPageData.test.ts`'s own precedent) rides unchanged through
    // this resolver too.
    expect(Object.keys(data?.embeds ?? {}).sort()).toEqual([
      "action/clue-in-2",
      "action/devise-a-stratagem@legacy",
      "action/pursue-a-lead-2",
    ]);
    expect(data?.knownTraitIds.length).toBeGreaterThan(0);
    expect(data?.rail.visible.map((r) => r.id)).toEqual([
      "class/cleric",
      "class/fighter",
      "class/witch",
    ]);
  });

  it("every class detail page carries the SAME rail data, regardless of which slug is being viewed", () => {
    const fighter = resolveClassPageData(reader, { slug: "fighter" });
    const cleric = resolveClassPageData(reader, { slug: "cleric" });
    expect(fighter?.rail).toEqual(cleric?.rail);
  });
});
