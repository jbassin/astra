// @vitest-environment jsdom
//
// `Popover` (mounted unconditionally by `ClassPage`, same as `EntityRenderPane`)
// reads `useRouterState` (D29-28) — needs a real router context to mount at
// all, `EntityRenderPane.test.tsx`'s own established convention.

import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveClassPageData, type ClassPageData } from "../../server/classPageData";
import { createCorpusReader, fixtureCorpusRoot } from "../../server/corpusFs";
import { ClassPage } from "./ClassPage";

/**
 * P12 S3 (D29-119/-120) — `ClassPage` over the S1 fixture corpus's own
 * `class/{fighter,cleric,witch}` docs (D29-113..116). Every case here only
 * exercises SSR-equivalent (already-resolved) state — the client-side pill
 * toggle + on-demand `memoizedEntity` fetch is Playwright's own concern
 * (real-browser verification), not meaningfully reproducible against a mock
 * network in this harness.
 */

function loadClass(slug: string, subclassTargetIds?: readonly string[]): ClassPageData {
  const reader = createCorpusReader(fixtureCorpusRoot());
  const data = resolveClassPageData(reader, { slug, subclassTargetIds });
  if (!data) throw new Error(`fixture class "${slug}" not found`);
  return data;
}

/** `RouterProvider` resolves its initial match asynchronously (same
 * `EntityRenderPane.test.tsx` gotcha this mirrors) — await a guaranteed-
 * present string (the entity's own name, always in the h1) before reading
 * `container.innerHTML`, else every assertion below would race an empty
 * container. */
async function renderClassPage(
  data: ClassPageData,
  opts: { superseded?: boolean; selectedSubclassIds?: ReadonlySet<string> } = {},
): Promise<{ html: string }> {
  const component = () => (
    <ClassPage
      data={data}
      superseded={opts.superseded ?? false}
      selectedSubclassIds={opts.selectedSubclassIds ?? new Set()}
      onSubclassToggle={() => {}}
    />
  );
  const rootRoute = createRootRoute({ component });
  const router = createRouter({ routeTree: rootRoute });
  const { container } = render(<RouterProvider router={router} />);
  await screen.findByText(data.entity.name);
  return { html: container.innerHTML };
}

describe("ClassPage: root + header (D29-119)", () => {
  it("root article carries codex-entity-page, codex-class-page, AND popover-hint (the popover contract)", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toContain('class="codex-entity-page codex-class-page popover-hint"');
    expect(html).toContain('data-category="class"');
  });

  it("exactly one h1, fully visible (the header stays the plain wordmark post-redirect)", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    const h1Matches = html.match(/<h1[^>]*>/g) ?? [];
    expect(h1Matches).toHaveLength(1);
    expect(h1Matches[0]).not.toContain("codex-entity-name-standalone");
    expect(html).toContain("Fighter");
  });

  it("mounts under .codex-entity-page", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toContain("codex-entity-page");
  });
});

describe("ClassPage: Core Traits box (D29-119)", () => {
  it("fighter: key ability 'or'-joined, HP per level, perception/attack ranks humanized", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toContain("Dexterity or Strength");
    expect(html).toContain("10 per level");
    expect(html).toContain("Advanced Trained");
  });

  it("fighter is NOT a spellcaster ('No')", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toMatch(/Spellcasting<\/span> No/);
  });

  it("cleric: attacks include the non-empty 'other' entry (Deity's favored weapon)", async () => {
    const { html } = await renderClassPage(loadClass("cleric"));
    expect(html).toContain("Deity's favored weapon Trained");
  });

  it("cleric: trained skills = named skill + 'plus N more'", async () => {
    const { html } = await renderClassPage(loadClass("cleric"));
    expect(html).toContain("Religion, plus 2 more");
  });

  it("fighter: trained skills with NO named skills renders bare 'plus N more'", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toMatch(/Trained Skills<\/span> plus 3 more/);
  });

  it("cleric is a spellcaster ('Yes')", async () => {
    const { html } = await renderClassPage(loadClass("cleric"));
    expect(html).toMatch(/Spellcasting<\/span> Yes/);
  });
});

describe("ClassPage: progression table (D29-119)", () => {
  it("fighter: exactly 20 data rows (levels 1-20); a populated level anchor-links to its feature heading", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toMatch(/<a href="#level-1-reactive-strike">Reactive Strike<\/a>/);
    expect(html).toMatch(/<a href="#level-1-shield-block">Shield Block<\/a>/);
    expect(html).toContain('id="level-1-reactive-strike"');
    const rowCount = (html.match(/<tr><td>\d+<\/td>/g) ?? []).length;
    expect(rowCount).toBe(20);
  });

  it("cleric: the targetId:null stub ('First Doctrine') renders as PLAIN TEXT, never a link", async () => {
    const { html } = await renderClassPage(loadClass("cleric"));
    expect(html).toContain("First Doctrine");
    expect(html).not.toMatch(/<a[^>]*>First Doctrine<\/a>/);
    expect(html).toMatch(/<a href="#level-1-doctrine">Doctrine<\/a>/);
  });

  it("NO extra resource columns — exactly two <th> in the header row", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    const headerMatch = html.match(/<thead><tr>(.*?)<\/tr><\/thead>/);
    expect(headerMatch).not.toBeNull();
    const thCount = (headerMatch?.[1]?.match(/<th>/g) ?? []).length;
    expect(thCount).toBe(2);
  });
});

describe("ClassPage: subclass section (D29-119)", () => {
  it("fighter (mapped to zero subclass categories) renders NO subclass section at all", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).not.toContain("codex-class-subclass-section");
    expect(html).not.toContain(">Subclasses<");
  });

  it("cleric: one labeled pill row ('Doctrine'), current options only by default", async () => {
    const { html } = await renderClassPage(loadClass("cleric"));
    expect(html).toContain("codex-class-subclass-section");
    expect(html).toContain(">Doctrine<");
    expect(html).toContain("Cloistered Cleric");
    expect(html).toContain("Warpriest");
    expect(html).not.toContain("codex-edition-legacy");
  });

  it("cleric: ?superseded=1 reveals the legacy husks, Legacy-icon-marked", async () => {
    const { html } = await renderClassPage(loadClass("cleric"), { superseded: true });
    expect(html).toContain("codex-edition-legacy");
  });

  it("witch: TWO labeled pill rows (lesson, patron)", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    expect(html).toContain(">Lesson<");
    expect(html).toContain(">Patron<");
  });

  it("SSR-selected subclass (via ?subclass=) renders its full prose inline with a real heading id", async () => {
    const data = loadClass("witch", ["class-feature/baba-yaga"]);
    const { html } = await renderClassPage(data, {
      selectedSubclassIds: new Set(["class-feature/baba-yaga"]),
    });
    expect(html).toContain("codex-class-subclass-doc");
    expect(html).toContain('id="baba-yaga"');
    expect(html).toContain(">Baba Yaga<");
  });

  it("a pill NOT in selectedSubclassIds does not render its doc inline", async () => {
    const data = loadClass("witch");
    const { html } = await renderClassPage(data, { selectedSubclassIds: new Set() });
    expect(html).not.toContain("codex-class-subclass-doc");
  });
});

describe("ClassPage: feature stream (D29-119)", () => {
  it("fighter: 16 'Level N: Name' h2 headings, in level order, each with a real id", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    const headings = [
      ...html.matchAll(/<h2 class="codex-heading" id="([^"]+)">Level (\d+): ([^<]+)<\/h2>/g),
    ];
    expect(headings).toHaveLength(16);
    expect(headings[0]?.[2]).toBe("1");
    expect(headings[0]?.[3]).toBe("Reactive Strike");
  });

  it("cleric: only the ONE resolvable grant (Doctrine) gets a stream heading — the stub does not", async () => {
    const { html } = await renderClassPage(loadClass("cleric"));
    const headings = [...html.matchAll(/Level \d+: ([^<]+)<\/h2>/g)];
    expect(headings.map((m) => m[1])).toEqual(["Doctrine"]);
  });
});

describe("ClassPage: description suppression (D29-119)", () => {
  it("renders a Description heading with the AoN prose body", async () => {
    const { html } = await renderClassPage(loadClass("fighter"));
    expect(html).toContain(">Description<");
    expect(html).toContain("fixture stub");
  });
});

// ---------------------------------------------------------------------------
// P14 S2 (D29-135) — the loreBody-bearing class fixture (witch, extended):
// preamble + a base-slug feature embed whose SUFFIXED sibling is witch's own
// grant + a nested unique table, all proving the mechanisms end-to-end
// through the real `resolveClassPageData` -> `ClassPage` pipeline (not just
// the pure `loreDedupe.test.ts` unit coverage).
// ---------------------------------------------------------------------------

const LORE_CARD_RE = /<section class="codex-card codex-card-prose codex-lore">[\s\S]*?<\/section>/;

function loreCardHtml(html: string): string | undefined {
  return LORE_CARD_RE.exec(html)?.[0];
}

describe("ClassPage: Description extension — stream-covered feature-heading sections (D29-135)", () => {
  it("witch: the body's 'Basic Lesson' section (name-matches the grant AND covered by its stream body) is stripped from the Description", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    // The prose survives ONCE, in the feature stream (the granted-feature
    // card, not the Description section) — never twice.
    const occurrences = (html.match(/basic lesson from your patron/gi) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("witch: a heading merely SHARING a grant's name ('Weapon Specialization'), with genuinely different prose under it, SURVIVES in the Description — name match alone never strips", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    expect(html).toContain("proving the Description-strip's belt-and-suspenders rule");
  });
});

describe("ClassPage: Lore card suppression + base-slug embed matching (D29-135)", () => {
  it("witch: the loreBody preamble (duplicating the body's own fixture-stub sentence) does not survive into the Lore card", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    const lore = loreCardHtml(html);
    expect(lore === undefined || !lore.includes("fixture stub")).toBe(true);
  });

  it("witch: the embed-only 'Basic Lesson' restatement (bare collision-base-slug target) is stripped — the WRONG (Investigator) doc's text never renders anywhere on the page", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    // `class-feature/basic-lesson` (bare) resolves to a DIFFERENT class's
    // doc than witch's own suffixed grant (`class-feature/basic-lesson-2`)
    // — proves base-slug matching, not exact-id membership (the review
    // blocker: exact-id matching is a no-op for exactly this shape).
    expect(html).not.toContain("COLLISION-FAMILY WINNER");
    expect(html).not.toContain("Investigator");
  });

  it('witch: the genuinely unique "Witch\'s Patron Bond" table SURVIVES into the Lore card (the Versatile-Vial-shaped canary)', async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    const lore = loreCardHtml(html);
    expect(lore).toBeDefined();
    expect(lore).toContain("Patron Bond");
    expect(lore).toContain("Minor Bond");
    expect(lore).toContain("Greater Bond");
  });

  it("witch: the plain body-covered dup section ('Witch Basics', no embed involved) also suppresses — proving the shingle-coverage path independent of base-slug stripping", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    const lore = loreCardHtml(html);
    expect(lore === undefined || !lore.includes("Witch Basics")).toBe(true);
  });
});

describe("ClassPage: attached sidebars (D29-119 item 6)", () => {
  it("witch's attached sidebar section renders after the description (hidden by default — the sidebar itself is a legacy doc)", async () => {
    const { html } = await renderClassPage(loadClass("witch"));
    expect(html).toContain("codex-attached-sidebars");
    expect(html).toContain("all 1 hidden");
    const descIdx = html.indexOf(">Description<");
    const sidebarIdx = html.indexOf("codex-attached-sidebars");
    expect(descIdx).toBeGreaterThan(-1);
    expect(sidebarIdx).toBeGreaterThan(descIdx);
  });

  it("witch's attached sidebar ('In Service to the Unknown') renders under ?superseded=1 (the sidebar's own superseded state)", async () => {
    const { html } = await renderClassPage(loadClass("witch"), { superseded: true });
    expect(html).toContain("In Service to the Unknown");
  });
});
