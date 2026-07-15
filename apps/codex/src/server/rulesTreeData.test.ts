import { describe, expect, it } from "vitest";

import { createCorpusReader, fixtureCorpusRoot } from "./corpusFs";
import { resolveRulesTree } from "./rulesTreeData";

/**
 * D29-40/D29-44 tier 3 — the `/rules` loader's pure core, over the fixture
 * corpus (same "plain function, no Start-runtime" pattern as
 * `directoryData.test.ts`/`entityPageData.test.ts`). The fixture's own
 * `rules-tree.json` (regenerated at S1, D29-44's composition) carries the
 * CRLF-healed "Chapter 2: Tools" root, the Counteracting path-shift pair,
 * and a childless-adjacent shape — this suite proves the resolver hands
 * every one of those through UNCHANGED (S1 already did all the shaping;
 * this module is a passthrough, not a second transform).
 */
describe("resolveRulesTree (D29-40)", () => {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const data = resolveRulesTree(reader);

  it("returns every fixture book", () => {
    const names = data.books.map((b) => b.book).sort();
    expect(names).toEqual(["Core Rulebook", "Gamemastery Guide", "Player Core", "Treasure Vault"]);
  });

  it("is a passthrough of reader.rulesTree() (same shape, not re-derived)", () => {
    expect(data).toEqual(reader.rulesTree());
  });

  it("the CRLF-healed GMG 'Chapter 2: Tools' root is ONE node (not forked)", () => {
    const gmg = data.books.find((b) => b.book === "Gamemastery Guide");
    expect(gmg?.nodes).toHaveLength(1);
    expect(gmg?.nodes[0]?.id).toBe("rules/chapter-2-tools");
    expect(gmg?.nodes[0]?.superseded).toBe(true);
  });

  it("the Counteracting edition path-shift pair lands under DIFFERENT ancestor chains", () => {
    const playerCore = data.books.find((b) => b.book === "Player Core");
    const coreRulebook = data.books.find((b) => b.book === "Core Rulebook");
    // Player Core (remaster): Chapter 8: Playing the Game > Afflictions > Counteracting
    const pcChapter = playerCore?.nodes.find((n) => n.name === "Chapter 8: Playing the Game");
    expect(pcChapter?.children[0]?.name).toBe("Afflictions");
    expect(pcChapter?.children[0]?.children[0]?.id).toBe("rules/counteracting-2");
    // Core Rulebook (legacy): Chapter 9: Playing the Game > General Rules > Counteracting
    const crChapter = coreRulebook?.nodes.find((n) => n.name === "Chapter 9: Playing the Game");
    expect(crChapter?.children[0]?.name).toBe("General Rules");
    expect(crChapter?.children[0]?.children[0]?.id).toBe("rules/counteracting-4");
    expect(crChapter?.children[0]?.children[0]?.superseded).toBe(true);
  });

  it("book-level edition/license derivation survives the passthrough", () => {
    const playerCore = data.books.find((b) => b.book === "Player Core");
    expect(playerCore?.edition).toBe("remaster");
    expect(playerCore?.license).toBe("ORC");
    const coreRulebook = data.books.find((b) => b.book === "Core Rulebook");
    expect(coreRulebook?.edition).toBe("legacy");
    expect(coreRulebook?.license).toBe("OGL");
  });

  it("hiddenWhenLegacyOff is present per book (the D29-40 'N hidden' precompute)", () => {
    for (const book of data.books) {
      expect(typeof book.hiddenWhenLegacyOff).toBe("number");
      expect(book.hiddenWhenLegacyOff).toBeGreaterThanOrEqual(0);
    }
  });
});
