import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { BlockNode } from "../schema/nodes";
import { type EnricherContext, type UuidResolution, EnricherGrammarError } from "./enrichers";
import { FoundryHtmlError, parseFoundryHtml } from "./foundryHtml";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "tests",
  "fixtures",
  "foundry",
);

function readFixture(name: string): { name: string; description: string } {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as {
    name: string;
    description: string;
  };
}

const langSubset = JSON.parse(readFileSync(join(FIXTURES, "..", "lang-subset.json"), "utf8")) as {
  en: Record<string, string>;
};

function makeCtx(overrides: Partial<EnricherContext> = {}): EnricherContext {
  const reports: Array<{ cls: string; detail: string }> = [];
  const ctx: EnricherContext = {
    resolveUuid: (uuid: string): UuidResolution => ({ kind: "crossref", id: uuid, display: uuid }),
    localize: new Map(),
    report: (cls, detail) => reports.push({ cls, detail }),
    parseBlockHtml: (html: string): BlockNode[] => parseFoundryHtml(html, ctx),
    ...overrides,
  };
  return ctx;
}

const NO_MARKS = { bold: false, italic: false, superscript: false };

describe("parseFoundryHtml: real fixture — fireball (plain paragraph + hr + strong, zero enrichers)", () => {
  it("parses two paragraphs split by a divider", () => {
    const fixture = readFixture("fireball.json");
    const nodes = parseFoundryHtml(fixture.description, makeCtx());
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "text",
            content:
              "A roaring blast of fire detonates at a spot you designate, dealing 6d6 fire damage.",
            marks: NO_MARKS,
          },
        ],
      },
      { kind: "divider" },
      {
        kind: "paragraph",
        children: [
          { kind: "text", content: "Heightened (+1)", marks: { ...NO_MARKS, bold: true } },
          { kind: "text", content: " The damage increases by 2d6.", marks: NO_MARKS },
        ],
      },
    ]);
  });
});

describe("parseFoundryHtml: real fixture — amulet (h3 headings + @Embed, options dropped)", () => {
  it("maps h3 to a level-3 heading and @Embed to an unresolved embed node", () => {
    const fixture = readFixture("amulet.json");
    const nodes = parseFoundryHtml(fixture.description, makeCtx());
    const headings = nodes.filter(
      (n): n is Extract<BlockNode, { kind: "heading" }> => n.kind === "heading",
    );
    expect(headings.map((h) => h.level)).toEqual([3, 3, 3, 3]);
    expect(headings[0]?.children).toEqual([
      { kind: "text", content: "Initiate Benefit", marks: { ...NO_MARKS, bold: true } },
    ]);

    const embedParagraph = nodes.find(
      (n): n is Extract<BlockNode, { kind: "paragraph" }> =>
        n.kind === "paragraph" && n.children.some((c) => c.kind === "embed"),
    );
    expect(embedParagraph?.children).toEqual([
      {
        kind: "embed",
        target: "Compendium.pf2e.classfeatures.Item.ALcWRnRjvuPKu4nV",
        resolved: false,
      },
    ]);
  });
});

describe("parseFoundryHtml: real fixture — phantasmal-amputation (full integration: @Check/@Damage/@UUID/hr/strong)", () => {
  it("parses end to end with no hard failures and the expected node shape at the seams", () => {
    const fixture = readFixture("phantasmal-amputation.json");
    const nodes = parseFoundryHtml(fixture.description, makeCtx());
    expect(nodes.filter((n) => n.kind === "divider")).toHaveLength(2);
    const paragraphs = nodes.filter(
      (n): n is Extract<BlockNode, { kind: "paragraph" }> => n.kind === "paragraph",
    );
    expect(paragraphs).toHaveLength(6);
    const critFailureParagraph = paragraphs[5];
    const damage = critFailureParagraph?.children.find((c) => c.kind === "damage");
    expect(damage).toEqual({
      kind: "damage",
      formula: "8d6[slashing],2d6[bleed]",
      display: "8d6 slashing, 2d6 bleed",
      label: "8d6 slashing damage and 2d6 bleed damage",
    });
  });
});

describe("parseFoundryHtml: real fixture — diabolic-pact (full integration: [[/gmr ]] inside real HTML)", () => {
  it("parses the gmr roll intact inside its paragraph", () => {
    const fixture = readFixture("diabolic-pact.json");
    const nodes = parseFoundryHtml(fixture.description, makeCtx());
    const critSuccess = nodes.find(
      (n): n is Extract<BlockNode, { kind: "paragraph" }> =>
        n.kind === "paragraph" && n.children.some((c) => c.kind === "inlineRoll"),
    );
    const roll = critSuccess?.children.find((c) => c.kind === "inlineRoll");
    expect(roll).toEqual({
      kind: "inlineRoll",
      rollKind: "gmr",
      formula: "1d4 #Weeks",
      label: "1d4 weeks",
    });
  });
});

describe("parseFoundryHtml: real fixture — Balor (full 24-item creature; every embedded item description parses clean)", () => {
  it("parses every item's description with zero hard failures, including a @Template with a label and a multi-@Damage aura", () => {
    const raw = readFileSync(join(FIXTURES, "balor.json"), "utf8");
    const doc = JSON.parse(raw) as {
      name: string;
      items: Array<{ name: string; system?: { description?: { value?: string } } }>;
    };
    expect(doc.name).toBe("Balor");
    const ctx = makeCtx({ localize: new Map(Object.entries(langSubset.en)) });
    let parsedCount = 0;
    for (const item of doc.items) {
      const html = item.system?.description?.value;
      if (!html) continue;
      const nodes = parseFoundryHtml(html, ctx);
      expect(Array.isArray(nodes)).toBe(true);
      parsedCount++;
    }
    expect(parsedCount).toBeGreaterThan(15);

    const deathThroes = doc.items.find((i) => i.name === "Death Throes");
    const nodes = parseFoundryHtml(deathThroes?.system?.description?.value ?? "", ctx);
    const paragraph = nodes[0];
    if (paragraph?.kind !== "paragraph") throw new Error("expected a paragraph");
    const template = paragraph.children.find((c) => c.kind === "template");
    expect(template).toEqual({
      kind: "template",
      shape: "emanation",
      distance: 100,
      label: "100-foot aura",
    });
  });
});

describe("parseFoundryHtml: structural tag mappings (synthetic, isolating one construct at a time)", () => {
  it("maps a nested list (list-in-list-item)", () => {
    const html = "<ul><li>Outer item</li><li><ol><li>Nested item</li></ol></li></ul>";
    const nodes = parseFoundryHtml(html, makeCtx());
    expect(nodes).toEqual([
      {
        kind: "list",
        ordered: false,
        items: [
          [{ kind: "text", content: "Outer item", marks: NO_MARKS }],
          [
            {
              kind: "list",
              ordered: true,
              items: [[{ kind: "text", content: "Nested item", marks: NO_MARKS }]],
            },
          ],
        ],
      },
    ]);
  });

  it("maps a table with a header row (via <th>) and a <caption>", () => {
    const html =
      "<table><caption>Damage by Level</caption><tbody><tr><th>Level</th><th>Damage</th></tr><tr><td>1</td><td>1d6</td></tr></tbody></table>";
    const nodes = parseFoundryHtml(html, makeCtx());
    expect(nodes).toEqual([
      {
        kind: "table",
        caption: [{ kind: "text", content: "Damage by Level", marks: NO_MARKS }],
        rows: [
          {
            header: true,
            cells: [
              [{ kind: "text", content: "Level", marks: NO_MARKS }],
              [{ kind: "text", content: "Damage", marks: NO_MARKS }],
            ],
          },
          {
            header: false,
            cells: [
              [{ kind: "text", content: "1", marks: NO_MARKS }],
              [{ kind: "text", content: "1d6", marks: NO_MARKS }],
            ],
          },
        ],
      },
    ]);
  });

  it("drops <colgroup>/<col> (verified content-free, pure column-width presentation)", () => {
    const html =
      '<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr><td>x</td></tr></tbody></table>';
    const nodes = parseFoundryHtml(html, makeCtx());
    expect(nodes).toEqual([
      {
        kind: "table",
        rows: [{ header: false, cells: [[{ kind: "text", content: "x", marks: NO_MARKS }]] }],
      },
    ]);
  });

  it("maps <blockquote> to a blockquote node with auto-wrapped loose inline content", () => {
    const html = "<blockquote>Quoted lore.</blockquote>";
    const nodes = parseFoundryHtml(html, makeCtx());
    expect(nodes).toEqual([
      {
        kind: "blockquote",
        children: [
          {
            kind: "paragraph",
            children: [{ kind: "text", content: "Quoted lore.", marks: NO_MARKS }],
          },
        ],
      },
    ]);
  });

  it("maps a real <section class='sample-tasks'> boxed callout to an aside (semantic match, not just presentation flattening)", () => {
    const html =
      '<section class="sample-tasks"><h2>Sample Subsist Tasks</h2><ul><li>Untrained: forest</li></ul></section>';
    const nodes = parseFoundryHtml(html, makeCtx());
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.kind).toBe("aside");
    if (nodes[0]?.kind !== "aside") throw new Error("unreachable");
    expect(nodes[0].children.map((c) => c.kind)).toEqual(["heading", "list"]);
  });

  it("maps a real multi-line <div> stat-block line to a paragraph (documented flatten — every real <div> is pure inline content)", () => {
    const html = "<div><strong>Perception</strong> +27; precise vision 30 feet</div>";
    const nodes = parseFoundryHtml(html, makeCtx());
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", content: "Perception", marks: { ...NO_MARKS, bold: true } },
          { kind: "text", content: " +27; precise vision 30 feet", marks: NO_MARKS },
        ],
      },
    ]);
  });

  it("maps <sup> to a superscript-marked text run (44 real journal uses)", () => {
    const nodes = parseFoundryHtml("<p>2<sup>nd</sup></p>", makeCtx());
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", content: "2", marks: NO_MARKS },
          { kind: "text", content: "nd", marks: { ...NO_MARKS, superscript: true } },
        ],
      },
    ]);
  });

  it("flattens <br> to a literal newline inside the surrounding text run (2 real uses, no BreakNode kind exists)", () => {
    const nodes = parseFoundryHtml("<p>Line one<br>Line two</p>", makeCtx());
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        children: [{ kind: "text", content: "Line one\nLine two", marks: NO_MARKS }],
      },
    ]);
  });

  it("composes bold+italic when <strong><em> nest (23 real instances)", () => {
    const nodes = parseFoundryHtml("<p><strong><em>very</em></strong></p>", makeCtx());
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "text",
            content: "very",
            marks: { bold: true, italic: true, superscript: false },
          },
        ],
      },
    ]);
  });

  it("maps a real action-glyph span to an actionGlyph node", () => {
    const nodes = parseFoundryHtml('<p><span class="action-glyph">2</span></p>', makeCtx());
    expect(nodes).toEqual([{ kind: "paragraph", children: [{ kind: "actionGlyph", cost: "2" }] }]);
  });

  it("flattens a non-action-glyph span (Word-paste styling classes) to its plain content", () => {
    const nodes = parseFoundryHtml('<p><span class="fontstyle2">plain</span></p>', makeCtx());
    expect(nodes).toEqual([
      { kind: "paragraph", children: [{ kind: "text", content: "plain", marks: NO_MARKS }] },
    ]);
  });

  it("decodes an HTML entity found inside real description text", () => {
    const nodes = parseFoundryHtml("<p>Tom &amp; Jerry</p>", makeCtx());
    expect(nodes).toEqual([
      { kind: "paragraph", children: [{ kind: "text", content: "Tom & Jerry", marks: NO_MARKS }] },
    ]);
  });

  it("auto-wraps loose top-level inline content with no block-tag wrapper at all", () => {
    const nodes = parseFoundryHtml("just bare text, no tags", makeCtx());
    expect(nodes).toEqual([
      {
        kind: "paragraph",
        children: [{ kind: "text", content: "just bare text, no tags", marks: NO_MARKS }],
      },
    ]);
  });
});

describe("parseFoundryHtml: hard-fail posture (D29-9's drift tripwire)", () => {
  it("hard-fails on an unmapped tag", () => {
    expect(() => parseFoundryHtml("<p>text <marquee>wat</marquee></p>", makeCtx())).toThrow(
      FoundryHtmlError,
    );
  });

  it("hard-fails on an unterminated tag", () => {
    expect(() => parseFoundryHtml("<p>oops <strong", makeCtx())).toThrow(FoundryHtmlError);
  });

  it("propagates an EnricherGrammarError from nested text content unchanged", () => {
    expect(() => parseFoundryHtml("<p>@Foo[bar]</p>", makeCtx())).toThrow(EnricherGrammarError);
  });
});

describe("parseFoundryHtml: real-corpus leniencies found by the full-snapshot dev sweep (139 + 1 real docs — see dev-sweep-foundry.ts)", () => {
  it("maps <code> to plain flattened content (found only in criticaldeck/*.json decks, not in any Item/Actor description)", () => {
    const nodes = parseFoundryHtml("<p><code>Melee</code></p>", makeCtx());
    expect(nodes).toEqual([
      { kind: "paragraph", children: [{ kind: "text", content: "Melee", marks: NO_MARKS }] },
    ]);
  });

  it("implicitly closes an unclosed <p> at end-of-input (real bug: the official PF2E.NPC.Abilities.Glossary.Engulf localize value, 139 real uses, never closes its 2nd <p>)", () => {
    const nodes = parseFoundryHtml("<p>first</p>\n<p>second, never closed", makeCtx());
    expect(nodes).toEqual([
      { kind: "paragraph", children: [{ kind: "text", content: "first", marks: NO_MARKS }] },
      {
        kind: "paragraph",
        children: [{ kind: "text", content: "second, never closed", marks: NO_MARKS }],
      },
    ]);
  });

  it("collapses a redundant outer <ul> with no <li> wrapper into an implicit single item (real bug: pfs-season-2-bestiary/2-15/barrow-quasit.json 'Change Shape', 1 occurrence)", () => {
    const nodes = parseFoundryHtml("<ul><ul><li>real item</li></ul></ul>", makeCtx());
    expect(nodes).toEqual([
      {
        kind: "list",
        ordered: false,
        items: [
          [
            {
              kind: "list",
              ordered: false,
              items: [[{ kind: "text", content: "real item", marks: NO_MARKS }]],
            },
          ],
        ],
      },
    ]);
  });
});
