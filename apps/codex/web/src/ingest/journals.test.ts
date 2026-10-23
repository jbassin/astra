import { describe, expect, it } from "vitest";

import type { EnricherContext, UuidResolution } from "./enrichers";
import {
  type JournalDoc,
  type JournalPageDecision,
  assembleJournalPages,
  decideJournalPages,
  decisionToResolution,
  parseRemasterChanges,
} from "./journals";

function makeCtx(): EnricherContext {
  const ctx: EnricherContext = {
    resolveUuid: (uuid: string): UuidResolution => ({ kind: "crossref", id: uuid, display: uuid }),
    localize: new Map(),
    report: () => undefined,
    parseBlockHtml: (html) => {
      throw new Error(`unexpected @Localize block html: ${html}`);
    },
  };
  return ctx;
}

describe("decideJournalPages: merge vs standalone (D29-8)", () => {
  const doc: JournalDoc = {
    _id: "journalEntry1",
    name: "Ancestries",
    pages: [
      { _id: "page1", name: "Anadi", type: "text", text: { content: "<p>Anadi lore.</p>" } },
      {
        _id: "page2",
        name: "General Ancestry Rules",
        type: "text",
        text: { content: "<p>Overview.</p>" },
      },
    ],
  };

  it("merges a page whose slug matches an already-assembled entity id", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const decisions = decideJournalPages(
      "ancestries",
      doc,
      new Set(["ancestry/anadi"]),
      (cls, detail) => reports.push({ cls, detail }),
    );
    expect(decisions).toEqual<JournalPageDecision[]>([
      { kind: "merge", targetId: "ancestry/anadi", pageId: "page1", pageName: "Anadi" },
      {
        kind: "standalone",
        entityId: "ancestry/general-ancestry-rules",
        category: "ancestry",
        pageId: "page2",
        pageName: "General Ancestry Rules",
      },
    ]);
    expect(reports).toEqual([
      { cls: "journalProseOnly", detail: "ancestry/general-ancestry-rules" },
    ]);
  });

  it("throws for an unmapped journal basename", () => {
    expect(() => decideJournalPages("some-new-journal", doc, new Set(), () => undefined)).toThrow(
      /no target category/,
    );
  });
});

describe("decisionToResolution", () => {
  it("resolves both decision kinds to the same {id, display} shape", () => {
    expect(
      decisionToResolution({
        kind: "merge",
        targetId: "ancestry/anadi",
        pageId: "p1",
        pageName: "Anadi",
      }),
    ).toEqual({ id: "ancestry/anadi", display: "Anadi" });
    expect(
      decisionToResolution({
        kind: "standalone",
        entityId: "ancestry/orphan",
        category: "ancestry",
        pageId: "p2",
        pageName: "Orphan",
      }),
    ).toEqual({ id: "ancestry/orphan", display: "Orphan" });
  });
});

describe("assembleJournalPages: merge attaches loreBody, standalone becomes a proseOnly entity", () => {
  const doc: JournalDoc = {
    _id: "journalEntry1",
    name: "Ancestries",
    pages: [
      { _id: "page1", name: "Anadi", type: "text", text: { content: "<p>Anadi lore.</p>" } },
      {
        _id: "page2",
        name: "General Ancestry Rules",
        type: "text",
        text: { content: "<p>Overview text.</p>" },
      },
    ],
  };
  const decisions: JournalPageDecision[] = [
    { kind: "merge", targetId: "ancestry/anadi", pageId: "page1", pageName: "Anadi" },
    {
      kind: "standalone",
      entityId: "ancestry/general-ancestry-rules",
      category: "ancestry",
      pageId: "page2",
      pageName: "General Ancestry Rules",
    },
  ];

  it("produces one merge result and one standalone proseOnly entity", () => {
    const reports: Array<{ cls: string; detail: string }> = [];
    const result = assembleJournalPages("Ancestries", doc, decisions, makeCtx(), (cls, detail) =>
      reports.push({ cls, detail }),
    );
    expect(result.merges).toEqual([
      {
        targetId: "ancestry/anadi",
        loreBody: [
          {
            kind: "paragraph",
            children: [
              {
                kind: "text",
                content: "Anadi lore.",
                marks: { bold: false, italic: false, superscript: false },
              },
            ],
          },
        ],
      },
    ]);
    expect(result.standalone).toHaveLength(1);
    const orphan = result.standalone[0];
    expect(orphan).toBeDefined();
    if (!orphan) return;
    expect(orphan.id).toBe("ancestry/general-ancestry-rules");
    expect(orphan.category).toBe("ancestry");
    expect(orphan.proseOnly).toBe(true);
    expect(orphan.edition).toBe("legacy");
    expect(orphan.source).toEqual({ book: "Foundry Journal: Ancestries", license: "unknown" });
    expect(orphan.body.length).toBeGreaterThan(0);
    expect(reports.some((r) => r.cls === "missingPublication")).toBe(true);
  });
});

describe("parseRemasterChanges: the redirect table (D29-7's pairing cross-check input)", () => {
  it("parses a 4-column table with a Status column", () => {
    const doc: JournalDoc = {
      _id: "remasterChanges",
      name: "Remaster Changes",
      pages: [
        {
          _id: "page1",
          name: "Class Features",
          type: "text",
          text: {
            content:
              '<table border="1" class="pf2e remaster"><thead><tr><th>Item Name</th><th>Class</th><th>Status</th><th>New Name</th></tr></thead><tbody>' +
              "<tr><td>Alertness</td><td>Multiple</td><td>Renamed</td><td>@UUID[Compendium.pf2e.classfeatures.Item.Perception Expertise]</td></tr>" +
              "</tbody></table>",
          },
        },
      ],
    };
    const entries = parseRemasterChanges(doc, makeCtx());
    expect(entries).toEqual([
      {
        page: "Class Features",
        oldName: "Alertness",
        newName: "Compendium.pf2e.classfeatures.Item.Perception Expertise",
        newId: "Compendium.pf2e.classfeatures.Item.Perception Expertise",
        status: "Renamed",
      },
    ]);
  });

  it("parses a 2-column Old Name/New Name table (no Status column)", () => {
    const doc: JournalDoc = {
      _id: "remasterChanges",
      name: "Remaster Changes",
      pages: [
        {
          _id: "page1",
          name: "Bestiaries",
          type: "text",
          text: {
            content:
              '<table><thead><tr style="text-align:right"><th>Old Name</th><th>New Name</th></tr></thead><tbody>' +
              "<tr><td>Grippli</td><td>—</td></tr>" +
              "</tbody></table>",
          },
        },
      ],
    };
    const entries = parseRemasterChanges(doc, makeCtx());
    expect(entries).toEqual([{ page: "Bestiaries", oldName: "Grippli", newName: "—" }]);
  });

  it("contributes zero entries for a prose-only page with no table", () => {
    const doc: JournalDoc = {
      _id: "remasterChanges",
      name: "Remaster Changes",
      pages: [
        {
          _id: "page1",
          name: "Remaster Changes",
          type: "text",
          text: { content: "<p>With the 5.9.0 release...</p>" },
        },
      ],
    };
    expect(parseRemasterChanges(doc, makeCtx())).toEqual([]);
  });

  it("extracts a crossref old-name cell's target id too", () => {
    const doc: JournalDoc = {
      _id: "remasterChanges",
      name: "Remaster Changes",
      pages: [
        {
          _id: "page1",
          name: "Feats",
          type: "text",
          text: {
            content:
              "<table><thead><tr><th>Item Name</th><th>Main Trait</th><th>Status</th><th>New Name</th></tr></thead><tbody>" +
              "<tr><td>@UUID[Compendium.pf2e.feats-srd.Item.Advanced School Spell]</td><td>Wizard</td><td>Altered mechanics</td><td>—</td></tr>" +
              "</tbody></table>",
          },
        },
      ],
    };
    const entries = parseRemasterChanges(doc, makeCtx());
    expect(entries).toEqual([
      {
        page: "Feats",
        oldName: "Compendium.pf2e.feats-srd.Item.Advanced School Spell",
        oldId: "Compendium.pf2e.feats-srd.Item.Advanced School Spell",
        newName: "—",
        status: "Altered mechanics",
      },
    ]);
  });
});
