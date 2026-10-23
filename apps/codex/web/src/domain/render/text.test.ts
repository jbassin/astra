import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CodexEntitySchema } from "../../schema/entity";
import type { BlockNode, InlineNode, TextMarks } from "../../schema/nodes";
import {
  capitalize,
  collectText,
  firstParagraphSummary,
  humanizeFacetKey,
  humanizeSlug,
  statsText,
} from "./text";

const FIXTURE_ROOT = join(import.meta.dirname, "../../../fixtures/entities");

function loadEntity(relPath: string) {
  return CodexEntitySchema.parse(JSON.parse(readFileSync(join(FIXTURE_ROOT, relPath), "utf8")));
}

const PLAIN_MARKS: TextMarks = { bold: false, italic: false, superscript: false };

function text(content: string, marks: Partial<TextMarks> = {}): InlineNode {
  return { kind: "text", content, marks: { ...PLAIN_MARKS, ...marks } };
}

function para(...children: InlineNode[]): BlockNode {
  return { kind: "paragraph", children };
}

describe("capitalize / humanizeFacetKey / humanizeSlug (existing helpers, unchanged)", () => {
  it("capitalize", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize("foo")).toBe("Foo");
  });

  it("humanizeFacetKey applies key overrides", () => {
    expect(humanizeFacetKey("ac")).toBe("AC");
    expect(humanizeFacetKey("itemCategory")).toBe("Item Category");
  });

  it("humanizeSlug hyphen-splits", () => {
    expect(humanizeSlug("creature-ability")).toBe("Creature Ability");
  });
});

describe("firstParagraphSummary (unchanged posture — regression pin for the collectNodeText(node, false) refactor)", () => {
  it("still picks the first top-level paragraph and ignores other kinds", () => {
    const body: BlockNode[] = [
      { kind: "divider" },
      para(text("The real paragraph.")),
      para(text("A second paragraph, never reached.")),
    ];
    expect(firstParagraphSummary(body)).toBe("The real paragraph.");
  });

  it("returns '' when the body has no top-level paragraph at all", () => {
    expect(firstParagraphSummary([{ kind: "divider" }])).toBe("");
  });
});

describe("collectText (S2, D29-34, adversarial N9)", () => {
  it("walks paragraphs/headings/lists and joins text nodes", () => {
    const body: BlockNode[] = [
      para(text("Hello"), text(" world.")),
      { kind: "heading", level: 2, children: [text("A Heading")] },
      {
        kind: "list",
        ordered: false,
        items: [[text("item one")], [text("item two")]],
      },
    ];
    const out = collectText(body);
    expect(out).toContain("Hello world.");
    expect(out).toContain("A Heading");
    expect(out).toContain("item one");
    expect(out).toContain("item two");
  });

  it("includes table cell text (unlike firstParagraphSummary)", () => {
    const body: BlockNode[] = [
      {
        kind: "table",
        rows: [
          { header: true, cells: [[text("Level")], [text("Effect")]] },
          { header: false, cells: [[text("1")], [text("Basic")]] },
        ],
      },
    ];
    const out = collectText(body);
    expect(out).toContain("Level");
    expect(out).toContain("Effect");
    expect(out).toContain("Basic");
  });

  it("recurses into blockquote/aside/localizedBoilerplate", () => {
    const body: BlockNode[] = [
      { kind: "blockquote", children: [para(text("quoted"))] },
      { kind: "aside", children: [para(text("aside text"))] },
    ];
    const out = collectText(body);
    expect(out).toContain("quoted");
    expect(out).toContain("aside text");
  });

  it("falls back to inline nodes' label/display, and is total over every kind", () => {
    const body: BlockNode[] = [
      para(
        { kind: "crossref", targetId: "spell/heal", display: "Heal" },
        { kind: "brokenRef", target: "@UUID[.missing]", display: "missing thing" },
        { kind: "check", type: "perception", label: "Notice" },
        { kind: "damage", formula: "1d6[fire]", display: "1d6 fire", label: "Burn" },
        { kind: "inlineRoll", rollKind: "r", formula: "1d20", label: "Roll" },
        { kind: "inlineAction", action: "stride", label: "Stride" },
        { kind: "template", shape: "cone", distance: 30, label: "30-foot cone" },
        { kind: "embed", target: "spell/heal", resolved: true, display: "Heal (embed)" },
        { kind: "actionGlyph", cost: "1" },
      ),
      { kind: "divider" },
    ];
    const out = collectText(body);
    for (const expected of [
      "Heal",
      "missing thing",
      "Notice",
      "Burn",
      "Roll",
      "Stride",
      "30-foot cone",
      "Heal (embed)",
    ]) {
      expect(out).toContain(expected);
    }
  });

  it("whitespace-collapses and trims", () => {
    const out = collectText([para(text("  a  "), text("  b  "))]);
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).toBe(out.trim());
  });

  it("empty body yields empty string", () => {
    expect(collectText([])).toBe("");
  });
});

describe("statsText (S2, D29-34) — against the real fixture corpus", () => {
  it("creature: renders facets + full Stats coverage (adamantine-dragon-adult)", () => {
    const dragon = loadEntity("creature/adamantine-dragon-adult.json");
    const out = statsText(dragon.facets, dragon.stats);
    expect(out).toContain("AC 33");
    expect(out).toContain("Fort +25");
    expect(out).toContain("Ref +20");
    expect(out).toContain("Will +23");
    expect(out).toContain("HP 220");
    expect(out).toContain("Perception +23");
    expect(out).toContain("Size huge");
    expect(out).toContain("Family Dragon, Adamantine");
    expect(out).toContain("Speed 30 feet");
    expect(out).toContain("burrow Speed 40 feet");
    expect(out).toContain("STR +8");
    expect(out).toContain("darkvision");
    expect(out).toContain("imprecise scent 60 feet");
    expect(out).toContain("Languages");
    expect(out).toContain("common");
    expect(out).toContain("Immunities");
    expect(out).toContain("paralyzed");
    expect(out).toContain("Athletics +27");
  });

  it("hazard: renders facets + hardness/stealth/isComplex/disable-routine-reset (gravehall-trap)", () => {
    const trap = loadEntity("hazard/gravehall-trap.json");
    const out = statsText(trap.facets, trap.stats);
    expect(out).toContain("AC 20");
    expect(out).toContain("Fort +15");
    expect(out).toContain("HP 60");
    expect(out).toContain("Hardness 0");
    expect(out).toContain("Complex");
    expect(out).toContain("Disable");
    expect(out).toContain("disrupt the magical trigger");
    expect(out).toContain("Routine");
  });

  it("a non-statblock entity's facets/stats yields empty string (safe to call unconditionally)", () => {
    expect(statsText({}, undefined)).toBe("");
  });

  it("D29-74 (P7): merged lore-skill slugs are HUMANIZED in the indexed text — 'Mining Lore +24', never 'Mining-lore' (the spellcaster fixture)", () => {
    const spellcaster = loadEntity("creature/adamantine-dragon-adult-spellcaster.json");
    const out = statsText(spellcaster.facets, spellcaster.stats);
    expect(out).toContain("Mining Lore +24");
    expect(out).not.toContain("Mining-lore");
    expect(out).toContain("Athletics +27"); // single-word core skills unchanged
  });

  it("D29-74 (P7, synthetic): a multi-word lore slug humanizes word-by-word", () => {
    const out = statsText({}, { kind: "creature", skills: { "gambling-lore": 1, stealth: 12 } });
    expect(out).toContain("Gambling Lore +1");
    expect(out).toContain("Stealth +12");
  });
});
