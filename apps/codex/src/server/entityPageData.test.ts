import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";
import { resolveEntityPageData } from "./entityPageData";

/**
 * D29-25/D29-29 tier 3 — `resolveEntityPageData`'s embed-prefetch + trait-index
 * assembly, over the fixture corpus (`createCorpusReader(fixtureCorpusRoot())`, no
 * config/Start-runtime involved — see `entityPageData.ts`'s own comment on why
 * this is a plain function in its own file rather than co-located with the
 * `createServerFn`-wrapped one in `corpusFns.ts`).
 */
describe("resolveEntityPageData (D29-23/-25)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());

  it("resolves a plain entity with no embeds", () => {
    const data = resolveEntityPageData(reader, { category: "spell", slug: "heal" });
    expect(data).not.toBeNull();
    expect(data?.entity.id).toBe("spell/heal");
    expect(data?.embeds).toEqual({});
    expect(data?.embedCapHit).toBe(false);
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
