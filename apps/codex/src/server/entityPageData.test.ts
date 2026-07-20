import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createAssayReader, emptyAssayReader } from "./assayFs";
import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";
import { resolveEntityPageData } from "./entityPageData";

/** `apps/codex/fixtures/assay/spell-power.json` — the committed D30-39/40
 * assay fixture, keyed against the SAME `fixtures/entities/spell/*` ids
 * this file's own `reader` above already resolves (`spell/heal`,
 * `spell/force-barrage`, `spell/heal@legacy`), so a corpus-fixture entity
 * lookup and an assay-fixture lookup can be exercised together in one
 * `resolveEntityPageData` call, the exact "one server-side pass" shape
 * production wiring (`corpusFns.ts`'s `getEntityPage`) uses. */
const ASSAY_READER = createAssayReader(join(import.meta.dirname, "../../fixtures"));

/**
 * D29-25/D29-29 tier 3 — `resolveEntityPageData`'s embed-prefetch + trait-index
 * assembly, over the fixture corpus (`createCorpusReader(fixtureCorpusRoot())`, no
 * config/Start-runtime involved — see `entityPageData.ts`'s own comment on why
 * this is a plain function in its own file rather than co-located with the
 * `createServerFn`-wrapped one in `corpusFns.ts`).
 */
describe("resolveEntityPageData (D29-23/-25)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("resolves a plain entity with no BODY embeds, but the D29-109a edition-pointer prefetch still populates the map", () => {
    // `spell/heal` has no `embed` nodes in its body, but DOES carry a
    // `legacyOf: ["spell/heal@legacy"]` pointer — D29-109a (P11 S5, #14)
    // folds that into this SAME prefetch map (`EditionBanner`'s pointer-box
    // name resolves through it), so `embeds` is no longer `{}` for this
    // entity even though it carries zero body embeds.
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    expect(data).not.toBeNull();
    expect(data?.entity.id).toBe("spell/heal");
    expect(Object.keys(data?.embeds ?? {})).toEqual(["spell/heal@legacy"]);
    expect(data?.embeds["spell/heal@legacy"]?.id).toBe("spell/heal@legacy");
    expect(data?.embedCapHit).toBe(false);
  });

  it("an unresolvable remasteredAs/legacyOf pointer fail-softs — never thrown, simply absent from embeds (D29-109a)", () => {
    // `class/investigator@legacy` carries `remasteredAs: ["class/investigator"]`,
    // but `class/investigator` (the remaster target) has NO fixture file —
    // post-D29-98 stripping keeps this near-zero in the real corpus, but
    // the fixture happens to demonstrate the belt-and-braces fail-soft path
    // for free. This must NOT throw, and must NOT appear as an embeds key.
    const data = resolveEntityPageData(reader, {
      category: "class",
      slug: "investigator@legacy",
    });
    expect(data).not.toBeNull();
    expect(data?.embeds["class/investigator"]).toBeUndefined();
  });

  it("prefetches the depth-0 embed targets a real fixture entity carries", () => {
    // `class/investigator@legacy` is the fixture's real embed-bearing pick
    // (extract-fixture.ts's own provenance comment: 3 real `embed` nodes
    // targeting the pursue-a-lead-2/clue-in-2/devise-a-stratagem@legacy action
    // docs, chosen specifically so this proves real depth-1 embed inlining).
    const data = resolveEntityPageData(reader, {
      category: "class",
      slug: "investigator@legacy",
    });
    expect(data).not.toBeNull();
    expect(Object.keys(data?.embeds ?? {}).sort()).toEqual([
      "action/clue-in-2",
      "action/devise-a-stratagem@legacy",
      "action/pursue-a-lead-2",
    ]);
    for (const [targetId, target] of Object.entries(data?.embeds ?? {})) {
      expect(target.id).toBe(targetId);
    }
  });

  it("returns the trait index as full trait/<slug> ids", () => {
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    expect(data?.knownTraitIds.length).toBeGreaterThan(0);
    for (const id of data?.knownTraitIds ?? []) expect(id.startsWith("trait/")).toBe(true);
  });

  it("resolves the D29-21 rescued index-slug entities", () => {
    expect(resolveEntityPageData(reader, { category: "ancestry", slug: "index" })?.entity.id).toBe(
      "ancestry/index",
    );
    expect(resolveEntityPageData(reader, { category: "archetype", slug: "index" })?.entity.id).toBe(
      "archetype/index",
    );
  });

  it("resolves a real non-ASCII slug", () => {
    const data = resolveEntityPageData(reader, { category: "creature", slug: "ixamè" });
    expect(data?.entity.id).toBe("creature/ixamè");
  });

  it("returns null for an unknown category (loader 404 input)", () => {
    expect(resolveEntityPageData(reader, { category: "not-a-category", slug: "x" })).toBeNull();
  });

  it("returns null for an unknown slug in a real category (loader 404 input)", () => {
    expect(resolveEntityPageData(reader, { category: "spell", slug: "not-a-spell" })).toBeNull();
  });

  it("returns null for a traversal-attempting slug (loader 404 input)", () => {
    expect(resolveEntityPageData(reader, { category: "spell", slug: "../../etc/passwd" })).toBe(
      null,
    );
    expect(resolveEntityPageData(reader, { category: "spell", slug: "_index" })).toBeNull();
  });

  it("a non-rules entity carries no `rulesNav` at all (other categories' payloads unchanged, D29-41)", () => {
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    expect(data?.rulesNav).toBeUndefined();
    expect(Object.hasOwn(data ?? {}, "rulesNav")).toBe(false);
  });

  it("an entity with no attachedSidebars carries no `attachedSidebars` key at all", () => {
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    expect(data?.attachedSidebars).toBeUndefined();
    expect(Object.hasOwn(data ?? {}, "attachedSidebars")).toBe(false);
  });
});

/**
 * P4 S4 (D29-42) — the `attachedSidebars` resolution, over the fixture's own
 * D29-44 shapes: a rules host (`rules/tools-of-play` -> `sidebar/dice`, a
 * non-superseded sidebar) and the M8 shared-url case
 * (`class/witch@legacy` -> `sidebar/in-service-to-the-unknown`, itself
 * SUPERSEDED — the same real-corpus shape the fixture copied verbatim also
 * happens to prove the fail-soft path: the real corpus's `class/witch@legacy`
 * carries a SECOND sidebar id, `sidebar/key-terms-38`, that was never
 * hand-picked into the fixture — it must be skipped, not thrown).
 */
describe("resolveEntityPageData attachedSidebars (D29-42)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("resolves a rules host's attached sidebar to its full body/citation", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "tools-of-play" });
    expect(data?.attachedSidebars).toHaveLength(1);
    expect(data?.attachedSidebars?.[0]).toMatchObject({
      id: "sidebar/dice",
      name: "Dice",
      superseded: false,
    });
    expect(data?.attachedSidebars?.[0]?.body.length).toBeGreaterThan(0);
  });

  it("skips an unresolvable attached-sidebar id (fail-soft, never throws) — the real class/witch@legacy shape", () => {
    const data = resolveEntityPageData(reader, { category: "class", slug: "witch@legacy" });
    // The real corpus's class/witch@legacy carries 2 attachedSidebars ids;
    // only one (sidebar/in-service-to-the-unknown) has a fixture file —
    // sidebar/key-terms-38 must be silently skipped, not thrown.
    expect(data?.attachedSidebars).toHaveLength(1);
    expect(data?.attachedSidebars?.[0]?.id).toBe("sidebar/in-service-to-the-unknown");
  });

  it("marks a superseded attached sidebar's own superseded flag true (the legacy-toggle hide signal)", () => {
    const data = resolveEntityPageData(reader, { category: "class", slug: "witch@legacy" });
    expect(data?.attachedSidebars?.[0]?.superseded).toBe(true);
  });

  it("the M8 shared-url class-feature does NOT itself carry attachedSidebars", () => {
    const data = resolveEntityPageData(reader, {
      category: "class-feature",
      slug: "ability-boosts-15",
    });
    expect(data?.attachedSidebars).toBeUndefined();
  });

  it("a category-page/rules-host sidebar never recurses into a sidebar's OWN attachedSidebars (depth-1 guard)", () => {
    // sidebar/dice itself is never read as a HOST in this suite — the guard
    // is structural (resolveAttachedSidebars never inspects the resolved
    // sidebar's own `attachedSidebars` field at all), proven simply by the
    // fact that resolving rules/tools-of-play above terminates with exactly
    // 1 entry, not a deeper chain.
    const data = resolveEntityPageData(reader, { category: "sidebar", slug: "dice" });
    expect(data?.attachedSidebars).toBeUndefined();
  });
});

/**
 * P4 S3 (D29-41) — the trail/sidebar-book/pager derivation, over the fixture
 * corpus's own `rules-tree.json` (the same D29-44 composition S2's route
 * tests already exercise: the CRLF-healed depth-3 GMG chain, the
 * path-shifted Counteracting legacy/remaster pair, a fully-synthetic
 * ancestor chain, two single-doc books). Reproduced by hand from
 * `fixtures/entities/rules-tree.json` in this file's own header comment —
 * see that file for the raw shape.
 */
describe("resolveEntityPageData rulesNav (D29-41 — trail/sidebar/pager)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("a root doc (no ancestors) renders its own trail head: book -> self, no ancestors", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "chapter-2-tools" });
    expect(data?.rulesNav?.book.book).toBe("Gamemastery Guide");
    expect(data?.rulesNav?.ancestors).toEqual([]);
  });

  it("a deep node's ancestors are the real-doc chain, root-first, each carrying its id (linkable)", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "ability-modifiers-2" });
    expect(data?.rulesNav?.ancestors).toEqual([
      { name: "Chapter 2: Tools", id: "rules/chapter-2-tools" },
      { name: "Building Creatures", id: "rules/building-creatures@legacy" },
    ]);
  });

  it("a fully-synthetic ancestor chain renders every ancestor WITHOUT an id (plain-text branch)", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "tools-of-play" });
    expect(data?.rulesNav?.ancestors).toEqual([
      { name: "Chapter 1: Introduction" },
      { name: "What is a Roleplaying Game?" },
    ]);
    for (const a of data?.rulesNav?.ancestors ?? []) expect(a.id).toBeUndefined();
  });

  it("the edition path-shift case: the remaster Counteracting member's trail is ITS OWN book's path, not the legacy pair member's", () => {
    const remaster = resolveEntityPageData(reader, { category: "rules", slug: "counteracting-2" });
    expect(remaster?.rulesNav?.book.book).toBe("Player Core");
    expect(remaster?.rulesNav?.ancestors).toEqual([
      { name: "Chapter 8: Playing the Game" },
      { name: "Afflictions" },
    ]);

    const legacy = resolveEntityPageData(reader, { category: "rules", slug: "counteracting-4" });
    expect(legacy?.rulesNav?.book.book).toBe("Core Rulebook");
    expect(legacy?.rulesNav?.ancestors).toEqual([
      { name: "Chapter 9: Playing the Game" },
      { name: "General Rules" },
    ]);
  });

  it("the pager DESCENDS: a chaptered root's next is its first child, not a same-level sibling", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "chapter-2-tools" });
    expect(data?.rulesNav?.prev).toBeUndefined(); // book head
    expect(data?.rulesNav?.next).toEqual({
      id: "rules/building-creatures@legacy",
      name: "Building Creatures",
      superseded: true, // a superseded neighbor still appears, edition-pilled (not re-chained)
    });
  });

  it("prev/next round-trip: the middle node of a 3-deep chain points back at its own prev's id via next, and vice versa", () => {
    const middle = resolveEntityPageData(reader, {
      category: "rules",
      slug: "building-creatures@legacy",
    });
    expect(middle?.rulesNav?.prev?.id).toBe("rules/chapter-2-tools");
    expect(middle?.rulesNav?.next?.id).toBe("rules/ability-modifiers-2");

    const tail = resolveEntityPageData(reader, { category: "rules", slug: "ability-modifiers-2" });
    expect(tail?.rulesNav?.prev?.id).toBe("rules/building-creatures@legacy"); // symmetric
    expect(tail?.rulesNav?.next).toBeUndefined(); // book tail — one-sided
  });

  it("a single-doc book is one-sided at BOTH ends (no prev, no next)", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "nature-crafting-3" });
    expect(data?.rulesNav?.prev).toBeUndefined();
    expect(data?.rulesNav?.next).toBeUndefined();
  });

  it("the pager never crosses a book boundary: Player Core's own chain stays within Player Core", () => {
    // Player Core has exactly 2 real docs in DFS order: tools-of-play, then
    // counteracting-2 — neither points at a Core Rulebook/Gamemastery
    // Guide/Treasure Vault doc even though those books sort adjacently.
    const first = resolveEntityPageData(reader, { category: "rules", slug: "tools-of-play" });
    expect(first?.rulesNav?.prev).toBeUndefined();
    expect(first?.rulesNav?.next).toEqual({ id: "rules/counteracting-2", name: "Counteracting" });

    const second = resolveEntityPageData(reader, { category: "rules", slug: "counteracting-2" });
    expect(second?.rulesNav?.prev).toEqual({ id: "rules/tools-of-play", name: "Tools of Play" });
    expect(second?.rulesNav?.next).toBeUndefined();
  });

  it("the sidebar-book payload is scoped to the entity's OWN book only (not the whole rules-tree.json)", () => {
    const data = resolveEntityPageData(reader, { category: "rules", slug: "nature-crafting-3" });
    expect(data?.rulesNav?.book.book).toBe("Treasure Vault");
    expect(data?.rulesNav?.book.nodes.length).toBeGreaterThan(0);
  });
});

describe("resolveEntityPageData: assay wiring (D30-39/40)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("the default 2-arg call (every EXISTING call site) never populates assay, even for a spell", () => {
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    expect(data?.assay).toBeUndefined();
  });

  it("an injected AssayReader populates `assay` for a spell with a real entry", () => {
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" }, ASSAY_READER);
    expect(data?.assay?.kind).toBe("quantitative");
    expect(data?.assay?.verdict).toBe("in band");
  });

  it("a spell with NO assay entry resolves with `assay` absent (fail-soft, never a thrown error)", () => {
    const data = resolveEntityPageData(
      reader,
      { category: "spell", slug: "magic-missile" },
      ASSAY_READER,
    );
    expect(data?.entity.id).toBe("spell/magic-missile");
    expect(data?.assay).toBeUndefined();
  });

  it("a NON-spell entity never gets an assay lookup at all, even with a real reader wired in (Spell category only, D30-40)", () => {
    const data = resolveEntityPageData(
      reader,
      { category: "creature", slug: "adamantine-dragon-adult" },
      ASSAY_READER,
    );
    expect(data?.assay).toBeUndefined();
  });

  it("emptyAssayReader (the entityPageData.ts default) behaves identically to omitting the third arg", () => {
    const withDefault = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    const withExplicitEmpty = resolveEntityPageData(
      reader,
      { category: "spell", slug: "heal" },
      emptyAssayReader,
    );
    expect(withDefault?.assay).toBe(withExplicitEmpty?.assay);
  });
});
