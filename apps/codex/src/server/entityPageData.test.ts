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
});
