import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../schema/entity";
import type { BlockNode, InlineNode } from "../schema/nodes";
import { collapseAdjacentCrossrefs } from "./dedupeCrossrefs";

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

function collector(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

function text(content: string): InlineNode {
  return { kind: "text", content, marks: { bold: false, italic: false, superscript: false } };
}

function crossref(targetId: string, display: string): InlineNode {
  return { kind: "crossref", targetId, display };
}

describe("collapseAdjacentCrossrefs (D29-100, P11 S1)", () => {
  it("the naga-domain shape: a real duplicate pair collapses to one crossref + one separator, non-dupes untouched", () => {
    // Mirrors the real `domain/naga-domain` masthead: Nalinivati, Ravithra
    // (legacy ID=218 + remaster ID=620, both repointed to `deity/ravithra`),
    // Velgaas, Vorasha.
    const e = entity({
      id: "domain/naga-domain",
      category: "domain",
      slug: "naga-domain",
      name: "Naga",
      mastheadExtra: [
        {
          label: "Deities",
          value: [
            text(" "),
            crossref("deity/nalinivati", "Nalinivati"),
            text(", "),
            crossref("deity/ravithra", "Ravithra"),
            text(", "),
            crossref("deity/ravithra", "Ravithra"),
            text(", "),
            crossref("deity/velgaas", "Velgaas"),
            text(", "),
            crossref("deity/vorasha", "Vorasha"),
          ],
        },
      ],
    });
    const { reports, report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const value = result.entities[0]?.mastheadExtra?.[0]?.value;
    expect(value).toEqual([
      text(" "),
      crossref("deity/nalinivati", "Nalinivati"),
      text(", "),
      crossref("deity/ravithra", "Ravithra"),
      text(", "),
      crossref("deity/velgaas", "Velgaas"),
      text(", "),
      crossref("deity/vorasha", "Vorasha"),
    ]);
    expect(result.totalOccurrences).toBe(1);
    expect(result.entitiesTouched).toBe(1);
    expect(reports.filter((r) => r.cls === "adjacentCrossrefDeduped")).toHaveLength(1);
  });

  it("collapses a genuine RUN of three identical adjacent crossrefs to one", () => {
    const e = entity({
      id: "deity/example-example",
      category: "deity",
      slug: "example",
      name: "Example",
      body: [
        {
          kind: "paragraph",
          children: [
            crossref("deity/x", "X"),
            text(", "),
            crossref("deity/x", "X"),
            text(", "),
            crossref("deity/x", "X"),
          ],
        },
      ],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const paragraph = result.entities[0]?.body[0] as { children: InlineNode[] } | undefined;
    expect(paragraph?.children).toEqual([crossref("deity/x", "X")]);
    expect(result.totalOccurrences).toBe(2);
  });

  it("apostrophe-variant + case display equivalence folds, keeping the FIRST display", () => {
    const e = entity({
      id: "deity/maat",
      category: "deity",
      slug: "maat",
      name: "Ma'at",
      body: [
        {
          kind: "paragraph",
          children: [
            crossref("deity/maat", "Ma'at"),
            text(", "),
            crossref("deity/maat", "Ma’at"), // curly apostrophe variant
          ],
        },
      ],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const paragraph = result.entities[0]?.body[0] as { children: InlineNode[] } | undefined;
    expect(paragraph?.children).toEqual([crossref("deity/maat", "Ma'at")]);
  });

  it("genuinely-distinct displays sharing punctuation NEVER collapse (Frightened 1 / Frightened 2)", () => {
    const e = entity({
      id: "spell/example",
      category: "spell",
      slug: "example",
      name: "Example",
      body: [
        {
          kind: "paragraph",
          children: [
            crossref("condition/frightened-1", "Frightened 1"),
            text(" or "),
            crossref("condition/frightened-2", "Frightened 2"),
          ],
        },
      ],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const paragraph = result.entities[0]?.body[0] as { children: InlineNode[] } | undefined;
    expect(paragraph?.children).toEqual([
      crossref("condition/frightened-1", "Frightened 1"),
      text(" or "),
      crossref("condition/frightened-2", "Frightened 2"),
    ]);
    expect(result.totalOccurrences).toBe(0);
  });

  it("non-adjacent duplicates (real content in between) never collapse", () => {
    const e = entity({
      id: "spell/example",
      category: "spell",
      slug: "example",
      name: "Example",
      body: [
        {
          kind: "paragraph",
          children: [crossref("deity/x", "X"), text(" and later "), crossref("deity/x", "X")],
        },
      ],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const paragraph = result.entities[0]?.body[0] as { children: InlineNode[] } | undefined;
    expect(paragraph?.children).toHaveLength(3);
    expect(result.totalOccurrences).toBe(0);
  });

  it("walks loreBody, embeddedItems, and hazard stats.disable/routine/reset (the P6 latent-gap surface)", () => {
    const dupeRun: InlineNode[] = [crossref("deity/x", "X"), text(", "), crossref("deity/x", "X")];
    const e = entity({
      id: "hazard/example",
      category: "hazard",
      slug: "example",
      name: "Example Hazard",
      loreBody: [{ kind: "paragraph", children: dupeRun }] as unknown as BlockNode[],
      embeddedItems: [
        {
          name: "Trigger",
          slug: "trigger",
          type: "action",
          traits: [],
          body: [{ kind: "paragraph", children: dupeRun }] as unknown as BlockNode[],
        },
      ],
      stats: {
        kind: "hazard",
        disable: [{ kind: "paragraph", children: dupeRun }] as unknown as BlockNode[],
        routine: [{ kind: "paragraph", children: dupeRun }] as unknown as BlockNode[],
        reset: [{ kind: "paragraph", children: dupeRun }] as unknown as BlockNode[],
      },
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const kept = result.entities[0];
    const loreParagraph = kept?.loreBody?.[0] as { children: InlineNode[] } | undefined;
    expect(loreParagraph?.children).toEqual([crossref("deity/x", "X")]);
    const embeddedParagraph = kept?.embeddedItems?.[0]?.body[0] as
      | { children: InlineNode[] }
      | undefined;
    expect(embeddedParagraph?.children).toEqual([crossref("deity/x", "X")]);
    const stats = kept?.stats?.kind === "hazard" ? kept.stats : undefined;
    for (const field of ["disable", "routine", "reset"] as const) {
      const p = stats?.[field]?.[0] as { children: InlineNode[] } | undefined;
      expect(p?.children).toEqual([crossref("deity/x", "X")]);
    }
    // 4 surfaces (loreBody, embeddedItems, disable, routine, reset = 5
    // actually) each collapse 1 duplicate.
    expect(result.totalOccurrences).toBe(5);
    expect(result.entitiesTouched).toBe(1);
  });

  it("collapses inside a list item and a table cell (mixed CodexNode[] siblings, not just InlineNode[])", () => {
    const dupeRun: InlineNode[] = [crossref("deity/x", "X"), text(", "), crossref("deity/x", "X")];
    const e = entity({
      id: "spell/example",
      category: "spell",
      slug: "example",
      name: "Example",
      body: [
        { kind: "list", ordered: false, items: [dupeRun as unknown as never[]] },
        {
          kind: "table",
          rows: [{ header: false, cells: [dupeRun as unknown as never[]] }],
        },
      ] as unknown as BlockNode[],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const list = result.entities[0]?.body[0] as { items: InlineNode[][] } | undefined;
    expect(list?.items[0]).toEqual([crossref("deity/x", "X")]);
    const table = result.entities[0]?.body[1] as
      | { rows: Array<{ cells: InlineNode[][] }> }
      | undefined;
    expect(table?.rows[0]?.cells[0]).toEqual([crossref("deity/x", "X")]);
  });

  it("a statRow's cells (InlineNode[][], P10) also collapse", () => {
    const e = entity({
      id: "creature/example",
      category: "creature",
      slug: "example",
      name: "Example",
      body: [
        {
          kind: "statRow",
          cells: [
            [crossref("deity/x", "X"), text(", "), crossref("deity/x", "X")],
            [text("HP 10")],
          ],
        },
      ] as unknown as BlockNode[],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    const statRow = result.entities[0]?.body[0] as { cells: InlineNode[][] } | undefined;
    expect(statRow?.cells[0]).toEqual([crossref("deity/x", "X")]);
    expect(statRow?.cells[1]).toEqual([text("HP 10")]);
  });

  it("an entity with no duplicates anywhere is returned untouched (occurrence count 0)", () => {
    const e = entity({
      id: "spell/heal",
      category: "spell",
      slug: "heal",
      name: "Heal",
      body: [{ kind: "paragraph", children: [text("You channel positive energy.")] }],
    });
    const { report } = collector();
    const result = collapseAdjacentCrossrefs([e], report);
    expect(result.entities[0]).toEqual(e);
    expect(result.totalOccurrences).toBe(0);
    expect(result.entitiesTouched).toBe(0);
  });
});
