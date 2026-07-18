import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { BlockNode, CodexNode, InlineNode } from "../schema/nodes";
import { BlockNodeSchema } from "../schema/nodes";
import { type AonParseCtx, AonMarkupError, parseAonMarkdown, stripMasthead } from "./aonMarkup";

// ---------------------------------------------------------------------------
// helpers — hermetic: fixtures are committed real docs, data/ is never read
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "tests", "fixtures", "aon");

interface AonFixture {
  category: string;
  id: string;
  name: string;
  markdown: string;
}

function loadFixture(file: string): AonFixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")) as AonFixture;
}

interface TestCtx {
  ctx: AonParseCtx;
  reports: Map<string, string[]>;
  links: Array<{ href: string; display: string }>;
}

function makeCtx(): TestCtx {
  const reports = new Map<string, string[]>();
  const links: Array<{ href: string; display: string }> = [];
  const ctx: AonParseCtx = {
    resolveLink: (href, display) => {
      links.push({ href, display });
      return { kind: "crossref", targetId: href, display };
    },
    report: (cls, detail) => {
      const list = reports.get(cls) ?? [];
      list.push(detail);
      reports.set(cls, list);
    },
  };
  return { ctx, reports, links };
}

function textContent(nodes: readonly CodexNode[]): string {
  let s = "";
  for (const n of nodes) {
    if (n.kind === "text") s += n.content;
    else if (n.kind === "crossref" || n.kind === "brokenRef") s += n.display;
    else if ("children" in n) s += textContent(n.children);
    else if (n.kind === "list") for (const item of n.items) s += textContent(item);
    else if (n.kind === "table") {
      for (const row of n.rows) for (const cell of row.cells) s += textContent(cell);
    }
  }
  return s;
}

function findAll(nodes: readonly CodexNode[], kind: CodexNode["kind"]): CodexNode[] {
  const out: CodexNode[] = [];
  const walk = (list: readonly CodexNode[]): void => {
    for (const n of list) {
      if (n.kind === kind) out.push(n);
      if ("children" in n) walk(n.children);
      if (n.kind === "list") for (const item of n.items) walk(item);
      if (n.kind === "table") {
        for (const row of n.rows) for (const cell of row.cells) walk(cell);
      }
    }
  };
  walk(nodes);
  return out;
}

function parseFixture(file: string): { blocks: BlockNode[] } & TestCtx {
  const t = makeCtx();
  const blocks = parseAonMarkdown(loadFixture(file).markdown, t.ctx);
  for (const b of blocks) BlockNodeSchema.parse(b); // schema conformance
  return { blocks, ...t };
}

// ---------------------------------------------------------------------------
// real sampled docs
// ---------------------------------------------------------------------------

describe("real docs", () => {
  it("rules section: title heading with right-meta, row/column flattened, document embeds", () => {
    const { blocks, links } = parseFixture("rules-section.json");
    const first = blocks[0];
    expect(first).toMatchObject({ kind: "heading", level: 1, meta: "Rules" });
    // The heading's text is a link — resolved through ctx.resolveLink.
    expect(links.some((l) => l.href === "/Rules.aspx?ID=3454")).toBe(true);
    // <row>/<column> flatten: no aside/table wrapper survives, prose is blocks.
    const embeds = findAll(blocks, "embed");
    expect(embeds.map((e) => (e.kind === "embed" ? e.target : ""))).toEqual([
      "rules-3455",
      "rules-3456",
      "rules-3457",
    ]);
    for (const e of embeds) expect(e).toMatchObject({ resolved: false });
    expect(textContent(blocks)).toContain("it’s best to avoid just playing out a fight");
  });

  it("sidebar statblock: divider, span flattened, standalone traits inlined", () => {
    const { blocks, reports } = parseFixture("sidebar-statblock.json");
    expect(blocks.some((b) => b.kind === "divider")).toBe(true);
    expect(reports.get("spanFlattened")).toHaveLength(2); // traitalignment + traitsize
    expect(reports.get("standaloneTraitInlined")).toEqual(["Human", "Humanoid"]);
    // The span content ("LE") survives as text.
    expect(textContent(blocks)).toContain("LE");
    expect(textContent(blocks)).toContain("Human");
  });

  it("article stub: heading meta + crossref-bearing paragraph", () => {
    const { blocks } = parseFixture("article-stub.json");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1, meta: "Setting Article" });
    const refs = findAll(blocks, "crossref");
    expect(refs.some((r) => r.kind === "crossref" && r.display === "Norgorber")).toBe(true);
  });

  it("column-heavy ancestry: traits dropped report-counted, headings survive", () => {
    const { blocks, reports } = parseFixture("column-heavy.json");
    expect(reports.get("traitsBlockDropped")?.length).toBeGreaterThan(0);
    const headings = findAll(blocks, "heading");
    expect(headings.length).toBeGreaterThan(1);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1, meta: "Ancestry" });
    // No trait pill text leaks into the body (facets own traits).
    expect(textContent(blocks)).not.toContain("Rare");
  });

  // -------------------------------------------------------------------------
  // P10 (D29-91/D29-92): negative fixtures — the outer `<row>` in each of
  // these two docs wraps NESTED `<column>`s, so condition (a) (no wrapper
  // opened anywhere inside the row's own scope) fails and the row keeps
  // flattening exactly as it did before this round. Pinned via a committed
  // golden captured from the PRE-P10 parser (`*.expected-blocks.json`,
  // sibling files to the input fixture) — a real regression gate, not just a
  // "no statRow appears" smoke check.
  // -------------------------------------------------------------------------

  it("column-heavy + rules-section (load-bearing NEGATIVE fixtures): parse is byte-identical to the pre-P10 golden — the outer row's nested column disqualifies it", () => {
    for (const file of ["column-heavy.json", "rules-section.json"]) {
      const { blocks } = parseFixture(file);
      const golden = JSON.parse(
        readFileSync(join(FIXTURE_DIR, file.replace(".json", ".expected-blocks.json")), "utf8"),
      ) as BlockNode[];
      expect(blocks, file).toEqual(golden);
      expect(findAll(blocks, "statRow"), file).toHaveLength(0);
    }
  });

  it("actions glyph inline in a bold statblock line", () => {
    const { blocks } = parseFixture("title-right-actions.json");
    const glyphs = findAll(blocks, "actionGlyph");
    expect(glyphs).toEqual([{ kind: "actionGlyph", cost: "Reaction" }]);
    // `**Activate**` bold mark survives around it.
    const para = blocks[0];
    if (para?.kind !== "paragraph") throw new Error("expected paragraph");
    const activate = para.children.find((n) => n.kind === "text" && n.content === "Activate");
    expect(activate).toMatchObject({ marks: { bold: true } });
  });

  it("table doc: header row from <th>, body rows, inline cell content", () => {
    const { blocks } = parseFixture("table-doc.json");
    const tables = findAll(blocks, "table");
    expect(tables).toHaveLength(1);
    const table = tables[0];
    if (table?.kind !== "table") throw new Error("expected table");
    expect(table.rows[0]).toMatchObject({ header: true });
    expect(textContent(table.rows[0]?.cells.flat() ?? [])).toContain("d20");
    expect(table.rows.length).toBeGreaterThan(10);
    expect(table.rows.slice(1).every((r) => !r.header)).toBe(true);
  });

  it("link-heavy dash list: one list, items carry crossrefs", () => {
    const { blocks, links } = parseFixture("link-heavy-list.json");
    const lists = findAll(blocks, "list");
    expect(lists).toHaveLength(1);
    const list = lists[0];
    if (list?.kind !== "list") throw new Error("expected list");
    expect(list.ordered).toBe(false);
    expect(list.items.length).toBeGreaterThanOrEqual(10); // cantrip + ranks
    expect(
      links.every((l) => l.href.startsWith("/Spells.aspx?ID=") || !l.href.includes("Spells")),
    ).toBe(true);
    // Whole-wrap `**Cantrip**` bold inside items survives as marks.
    const bolds = findAll(blocks, "text").filter((n) => n.kind === "text" && n.marks.bold);
    expect(bolds.length).toBeGreaterThan(0);
  });

  it("multi-line dash items merge lazy continuations; <sup> becomes a superscript mark", () => {
    const { blocks } = parseFixture("list-continuation-sup.json");
    const sups = findAll(blocks, "text").filter((n) => n.kind === "text" && n.marks.superscript);
    expect(sups.length).toBeGreaterThan(0);
    const lists = findAll(blocks, "list");
    // Spell-rank items wrap onto the following line — the item content must
    // include the continuation's links, not orphan them into a paragraph.
    const anyList = lists.find(
      (l) =>
        l.kind === "list" && l.items.some((item) => textContent(item).includes("dispel magic")),
    );
    expect(anyList).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // P10 (D29-91): creature-2179 (King Merlokrep) carries exactly 3 statRow
  // CANDIDATES corpus-wide (spec's own pin) — 2 collapse (6-cell ability
  // mods, 4-cell AC/saves), 1 stays a paragraph (single-cell HP). The
  // fixture's OUTER `<row><column><column>...` wrapper (the recall-knowledge
  // sidebar) still flattens unconditionally — it has a nested column, so it
  // fails condition (a) regardless of its post-flatten all-paragraph shape
  // (the exact 14,869-row definitional trap the scope doc's R1 census
  // describes).
  // -------------------------------------------------------------------------

  it("list-continuation-sup (P10, D29-91): the 6-cell ability-mod row and the 4-cell AC/save row collapse to statRow; the 1-cell HP row stays a paragraph", () => {
    const { blocks, reports } = parseFixture("list-continuation-sup.json");
    const statRows = findAll(blocks, "statRow");
    expect(statRows).toHaveLength(2);

    const abilityRow = statRows[0];
    if (abilityRow?.kind !== "statRow") throw new Error("expected statRow");
    expect(abilityRow.cells.map((c) => textContent(c))).toEqual([
      "Str +4",
      "Dex +6",
      "Con +4",
      "Int +2",
      "Wis +4",
      "Cha +6",
    ]);

    const saveRow = statRows[1];
    if (saveRow?.kind !== "statRow") throw new Error("expected statRow");
    // The census's own "AC 32 " trailing-whitespace example, boundary-trimmed
    // (D29-91): no cell's text carries a trailing space.
    expect(saveRow.cells.map((c) => textContent(c))).toEqual([
      "AC 26",
      "Fort +14",
      "Ref +18",
      "Will +16",
    ]);
    for (const cell of saveRow.cells) {
      const last = cell[cell.length - 1];
      if (last?.kind === "text") expect(last.content).not.toMatch(/\s$/);
    }

    // The HP row (single cell) keeps flattening to its today-shaped paragraph
    // — identical render either way, report-counted as a candidate.
    const paragraphs = findAll(blocks, "paragraph");
    expect(paragraphs.some((p) => p.kind === "paragraph" && textContent([p]) === "HP 140")).toBe(
      true,
    );

    expect(reports.get("statRowCollapsed")).toEqual(["6", "4"]);
    expect(reports.get("statRowSingleCellKept")).toHaveLength(1);

    // The outer recall-knowledge `<row>` has a nested `<column>` inside it —
    // condition (a) fails, so it's never a candidate at all (no report, no
    // collapse) even though its own flattened content is all-paragraph.
    const recallPara = paragraphs.find((p) =>
      p.kind === "paragraph" ? textContent([p]).includes("Recall Knowledge") : false,
    );
    expect(recallPara).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// grammar mappings (synthetic)
// ---------------------------------------------------------------------------

describe("mappings", () => {
  it("CRLF normalizes before line structure (blank-line paragraph split)", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown("one\r\n\r\ntwo", ctx);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
  });

  it("--- lines become dividers; ## / ### become headings; empty ## allowed", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown(
      "a\r\n\r\n---\r\n\r\n## Two\r\n\r\n### Three\r\n\r\n## \r\nb",
      ctx,
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "paragraph",
      "divider",
      "heading",
      "heading",
      "heading",
      "paragraph",
    ]);
    expect(blocks[2]).toMatchObject({ level: 2 });
    expect(blocks[3]).toMatchObject({ level: 3 });
    expect(blocks[4]).toMatchObject({ children: [] });
  });

  it("**bold** and _italic_ toggle marks; single * is literal", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown("**b** _i_ 2 * 3", ctx);
    const para = blocks[0];
    if (para?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(para.children[0]).toMatchObject({ content: "b", marks: { bold: true, italic: false } });
    expect(para.children[1]).toMatchObject({ content: " " });
    expect(para.children[2]).toMatchObject({ content: "i", marks: { italic: true } });
    expect(textContent([para])).toContain("2 * 3");
  });

  it("links resolve through ctx.resolveLink with entity-decoded href and emphasis-stripped display", () => {
    const t = makeCtx();
    parseAonMarkdown("[_heal_](/Spells.aspx?ID=1&amp;x=y) and [**PFS**](PFS.aspx)", t.ctx);
    expect(t.links).toEqual([
      { href: "/Spells.aspx?ID=1&x=y", display: "heal" },
      { href: "PFS.aspx", display: "PFS" },
    ]);
  });

  it("double-wrapped link display flattens to inner text (report-counted)", () => {
    const t = makeCtx();
    parseAonMarkdown("([[divine](/Traits.aspx?ID=579)](/Traits.aspx?ID=48))", t.ctx);
    expect(t.links).toEqual([{ href: "/Traits.aspx?ID=48", display: "divine" }]);
    expect(t.reports.get("nestedLinkDisplayFlattened")).toHaveLength(1);
  });

  it("stray-bracket display falls back to first-close (`[non-[elf](…)`)", () => {
    const t = makeCtx();
    parseAonMarkdown("a [non-[elf](/Traits.aspx?ID=588) b", t.ctx);
    expect(t.links).toEqual([{ href: "/Traits.aspx?ID=588", display: "non-[elf" }]);
  });

  it("bold wrapping a link keeps surrounding text bold; the link node itself is unmarked", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("**Trigger [grabbed](/Conditions.aspx?ID=20);**", t.ctx);
    const para = blocks[0];
    if (para?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(para.children[0]).toMatchObject({ content: "Trigger ", marks: { bold: true } });
    expect(para.children[1]).toMatchObject({ kind: "crossref", display: "grabbed" });
    expect(para.children[2]).toMatchObject({ content: ";", marks: { bold: true } });
  });

  it("<title level right pfs> → heading with meta; empty right omitted", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown(
      '<title level="1" right="Feat 4" pfs="">X</title><title level="3" right="">Y</title>',
      ctx,
    );
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1, meta: "Feat 4" });
    const second = blocks[1];
    if (second?.kind !== "heading") throw new Error("expected heading");
    expect(second.level).toBe(3);
    expect("meta" in second).toBe(false);
  });

  it("<actions string> → actionGlyph; empty string dropped with report", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown(
      'a <actions string="Two Actions" /> b <actions string="" /> c',
      t.ctx,
    );
    expect(findAll(blocks, "actionGlyph")).toEqual([{ kind: "actionGlyph", cost: "Two Actions" }]);
    expect(t.reports.get("emptyActionsGlyphDropped")).toHaveLength(1);
  });

  it("<document/> → unresolved embed; multi-line attrs; override-title-right report-dropped", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown(
      '<document level="2" id="feat-1" />\r\n\r\n<document\r\nlevel="2"\r\nid="feat-2"\r\noverride-title-right="Feat 4*"\r\n/>',
      t.ctx,
    );
    const embeds = findAll(blocks, "embed");
    expect(embeds).toEqual([
      { kind: "embed", target: "feat-1", resolved: false },
      { kind: "embed", target: "feat-2", resolved: false },
    ]);
    expect(t.reports.get("embedOverrideTitleRightDropped")).toEqual(["Feat 4*"]);
  });

  it("<image> dropped report-counted; <date> becomes its value text; <traits> dropped", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown(
      '<image src="x.png" /> **Release Date** <date value="2021-01-01" />\n\n<traits>\n<trait label="Rare" url="/Traits.aspx?ID=137" />\n</traits>\n\nbody',
      t.ctx,
    );
    expect(t.reports.get("imageDropped")).toEqual(["x.png"]);
    expect(t.reports.get("traitsBlockDropped")).toHaveLength(1);
    expect(textContent(blocks)).toContain("2021-01-01");
    expect(textContent(blocks)).not.toContain("Rare");
  });

  it("standalone <trait> outside a wrapper inlines its label (link labels resolve)", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown('<trait label="[Finite](/Traits.aspx?ID=276)" />', t.ctx);
    expect(t.reports.get("standaloneTraitInlined")).toHaveLength(1);
    expect(findAll(blocks, "crossref")).toHaveLength(1);
  });

  it("<aside>/<spoilers> → aside nodes; <row>/<column>/<center> flatten", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown(
      "<aside>\na\n</aside>\n<spoilers>May contain spoilers</spoilers>\n<row><column>\nb\n</column></row>\n<center>**c**</center>",
      ctx,
    );
    expect(blocks.map((b) => b.kind)).toEqual(["aside", "aside", "paragraph", "paragraph"]);
    const spoiler = blocks[1];
    if (spoiler?.kind !== "aside") throw new Error("expected aside");
    expect(textContent(spoiler.children)).toBe("May contain spoilers");
  });

  // -------------------------------------------------------------------------
  // P10 (D29-91/D29-93): `<row>` statRow candidacy — synthetic grammar-level
  // tests (the real-doc coverage lives in the "real docs" describe above).
  // -------------------------------------------------------------------------

  it("a nested-wrapper row does NOT collapse even though its flattened content is all-paragraph (the D29-91 definitional trap)", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("<row><column>a</column><column>b</column></row>", t.ctx);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
    expect(findAll(blocks, "statRow")).toHaveLength(0);
    expect(t.reports.get("statRowCollapsed")).toBeUndefined();
    expect(t.reports.get("statRowSingleCellKept")).toBeUndefined();
  });

  it("a single-cell row candidate keeps flattening to its one paragraph, report-counted", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("<row>**Bulk** L</row>", t.ctx);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph"]);
    expect(findAll(blocks, "statRow")).toHaveLength(0);
    expect(t.reports.get("statRowSingleCellKept")).toHaveLength(1);
    expect(t.reports.get("statRowCollapsed")).toBeUndefined();
  });

  it("a multi-cell row candidate collapses to statRow, report-counted with its cell count", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("<row>\n**Str** +7\n\n**Dex** +5\n</row>", t.ctx);
    expect(blocks.map((b) => b.kind)).toEqual(["statRow"]);
    const row = blocks[0];
    if (row?.kind !== "statRow") throw new Error("expected statRow");
    expect(row.cells).toHaveLength(2);
    expect(textContent(row.cells[0] ?? [])).toBe("Str +7");
    expect(textContent(row.cells[1] ?? [])).toBe("Dex +5");
    expect(t.reports.get("statRowCollapsed")).toEqual(["2"]);
  });

  it("an empty row keeps flattening to nothing — not report-counted", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("before\n\n<row></row>\n\nafter", t.ctx);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
    expect(textContent(blocks)).toBe("beforeafter");
    expect(t.reports.get("statRowCollapsed")).toBeUndefined();
    expect(t.reports.get("statRowSingleCellKept")).toBeUndefined();
  });

  it("cell boundary trim: a fully-whitespace boundary text node is DROPPED, a trailing-whitespace-bearing node is trimEnd'd", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown(
      "<row>**Bulk** [L](/Bulk.aspx?ID=1) \n\n**Price** 5 gp </row>",
      t.ctx,
    );
    const row = blocks[0];
    if (row?.kind !== "statRow") throw new Error("expected statRow");
    expect(row.cells).toHaveLength(2);

    // Cell 1 pre-trim would be [text("Bulk", bold), text(" "), crossref("L"),
    // text(" ")] — a trailing pure-whitespace text node after the crossref
    // that must be DROPPED entirely (not merely trimmed), leaving the
    // crossref as the cell's last element and exactly 3 children (the
    // INTERIOR separator space between the label and the link is real content
    // at a non-boundary position and must survive untouched).
    const bulkCell = row.cells[0] ?? [];
    expect(bulkCell).toHaveLength(3);
    const lastOfBulk = bulkCell[bulkCell.length - 1];
    expect(lastOfBulk?.kind).toBe("crossref");

    // Cell 2: the trailing " 5 gp " value text is trimEnd'd (trailing space
    // gone) but NOT trimStart'd away from its own leading space (that space
    // sits between the bold label and the value, not at the true cell edge —
    // `**Price**` is the true leading edge and needs no trim).
    expect(textContent(row.cells[1] ?? [])).toBe("Price 5 gp");
    const priceCell = row.cells[1] ?? [];
    const lastOfPrice = priceCell[priceCell.length - 1];
    if (lastOfPrice?.kind !== "text") throw new Error("expected trailing text node");
    expect(lastOfPrice.content).not.toMatch(/\s$/);
  });

  it("HTML lists: <ul>/<ol> with li items; simple items unwrap to bare inline", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown(
      '<ul><li>**1st** a</li><li>b</li></ul><ol start="2"><li>c</li></ol>',
      ctx,
    );
    const [ul, ol] = blocks;
    if (ul?.kind !== "list" || ol?.kind !== "list") throw new Error("expected lists");
    expect(ul.ordered).toBe(false);
    expect(ol.ordered).toBe(true);
    expect(ul.items).toHaveLength(2);
    const first = ul.items[0] ?? [];
    // bare inline run, not a wrapped paragraph
    expect(first.every((n) => n.kind === "text" || n.kind === "crossref")).toBe(true);
  });

  it("<b>/<B> → bold mark; <sup> → superscript mark; uppercase tag names fold", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown("<B>bold</B> Reflex <sup>(R)</sup>", ctx);
    const para = blocks[0];
    if (para?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(para.children[0]).toMatchObject({ content: "bold", marks: { bold: true } });
    const sup = para.children.find((n) => n.kind === "text" && n.marks.superscript);
    expect(sup).toMatchObject({ content: "(R)" });
  });

  it("<br/> is a hard break inside the paragraph, not a markdown line boundary", () => {
    const { ctx } = makeCtx();
    const blocks = parseAonMarkdown("a<br />- not a list item", ctx);
    expect(blocks).toHaveLength(1);
    expect(textContent(blocks)).toBe("a\n- not a list item");
  });

  it("entities decode; unknown named entity hard-fails", () => {
    const { ctx } = makeCtx();
    expect(textContent(parseAonMarkdown("cold 5 &amp; fire &lt;3&gt;", ctx))).toBe(
      "cold 5 & fire <3>",
    );
    expect(() => parseAonMarkdown("&bogus;", makeCtx().ctx)).toThrow(AonMarkupError);
  });
});

// ---------------------------------------------------------------------------
// hard-fail posture + censused leniencies
// ---------------------------------------------------------------------------

describe("hard fails and leniencies", () => {
  it("unknown tag hard-fails with a typed error", () => {
    expect(() => parseAonMarkdown("<mystery>x</mystery>", makeCtx().ctx)).toThrow(AonMarkupError);
    expect(() => parseAonMarkdown("a <selfclosed/> b", makeCtx().ctx)).toThrow(AonMarkupError);
    expect(() => parseAonMarkdown("a </unknowntag> b", makeCtx().ctx)).toThrow(AonMarkupError);
  });

  it("the error carries the normalized source and a span start", () => {
    try {
      parseAonMarkdown("line\r\n<mystery>", makeCtx().ctx);
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof AonMarkupError)) throw e;
      expect(e.source).toBe("line\n<mystery>");
      expect(e.start).toBe(5);
    }
  });

  it("malformed non-tag `<` is literal text, report-counted", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("2 < 3 and <**Failure** and <hr /**>tail", t.ctx);
    expect(t.reports.get("malformedTagLiteral")?.length).toBeGreaterThanOrEqual(3);
    expect(textContent(blocks)).toContain("2 < 3");
    expect(textContent(blocks)).toContain("tail");
  });

  it("lost list opener recovers: stray closes skipped, bare <li> starts an implicit list", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("intro </li><li>a</li><li>b</li></ul> outro", t.ctx);
    expect(t.reports.get("strayCloseIgnored")).toContain("li");
    expect(t.reports.get("implicitListRecovered")).toHaveLength(1);
    const lists = findAll(blocks, "list");
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ items: [[expect.anything()], [expect.anything()]] });
    expect(textContent(blocks)).toContain("outro");
  });

  it("table recovery: implicit <tr> from bare cells, implicit cell close, transposed closes", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown(
      "<table><tr><td>a<td>b</td></tr>\n<td>c</td></tr>\n<tr><td>d</tr></td></table>",
      t.ctx,
    );
    const table = blocks[0];
    if (table?.kind !== "table") throw new Error("expected table");
    expect(table.rows).toHaveLength(3);
    expect(t.reports.get("implicitCellClose")).toBeDefined();
    expect(t.reports.get("implicitTableRow")).toBeDefined();
    expect(t.reports.get("strayCloseIgnored")).toBeDefined();
    expect(textContent(blocks)).toContain("d");
  });

  it("missing </tr> before the next <tr> open ends the row implicitly", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("<table><tr><td>a</td><tr><td>b</td></tr></table>", t.ctx);
    const table = blocks[0];
    if (table?.kind !== "table") throw new Error("expected table");
    expect(table.rows).toHaveLength(2);
    expect(t.reports.get("implicitRowClose")).toEqual(["tr-open"]);
  });

  it("stray text debris between cells is dropped report-counted; tags there still fail", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("<table><tr><td>a</td>**<td>b</td></tr></table>", t.ctx);
    const table = blocks[0];
    if (table?.kind !== "table") throw new Error("expected table");
    expect(table.rows[0]?.cells).toHaveLength(2);
    expect(t.reports.get("textInsideTableRowDropped")).toEqual(["**"]);
    expect(() =>
      parseAonMarkdown("<table><tr><td>a</td><aside>x</aside></tr></table>", makeCtx().ctx),
    ).toThrow(AonMarkupError);
  });

  it("<h2 class> is a level-2 title synonym, closeable by </title>; nested <H2> in a <title> flattens", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown('<h2 class="header">Ethnicities</title>after', t.ctx);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(t.reports.get("h2TitleSynonym")).toHaveLength(1);

    const t2 = makeCtx();
    const nested = parseAonMarkdown(
      '<title level="2" noclass="true"><H2 Class="Title">Spells</H2></title>',
      t2.ctx,
    );
    expect(nested).toEqual([
      {
        kind: "heading",
        level: 2,
        children: [
          {
            kind: "text",
            content: "Spells",
            marks: { bold: false, italic: false, superscript: false },
          },
        ],
      },
    ]);
    expect(t2.reports.get("nestedH2Flattened")).toHaveLength(1);
  });

  it("censused junk tags <t>/<a> drop their token, content flows on", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown('x (<t>evil) y <a href="https://e.com" class="z">text', t.ctx);
    expect(t.reports.get("junkTagDropped")).toEqual(["t", "a"]);
    expect(textContent(blocks)).toBe("x (evil) y text");
  });

  it("a known block tag unclosed at end of input closes implicitly, report-counted", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("<ol><li>only</li>", t.ctx);
    expect(findAll(blocks, "list")).toHaveLength(1);
    expect(t.reports.get("unclosedTagAtEof")).toEqual(["ol"]);
  });

  it("unbalanced emphasis stays applied to the tail and is report-counted", () => {
    const t = makeCtx();
    const blocks = parseAonMarkdown("_Terrifying ammunition", t.ctx);
    expect(t.reports.get("unbalancedEmphasis")).toHaveLength(1);
    const para = blocks[0];
    if (para?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(para.children[0]).toMatchObject({ marks: { italic: true } });
  });
});

// ---------------------------------------------------------------------------
// inline nodes returned by resolveLink pass through untouched
// ---------------------------------------------------------------------------

describe("resolveLink contract", () => {
  it("whatever inline node the resolver returns is placed verbatim", () => {
    const broken: InlineNode = { kind: "brokenRef", target: "/X.aspx?ID=1", display: "X" };
    const ctx: AonParseCtx = { resolveLink: () => broken, report: () => undefined };
    const blocks = parseAonMarkdown("[X](/X.aspx?ID=1)", ctx);
    expect(findAll(blocks, "brokenRef")).toEqual([broken]);
  });
});

// ---------------------------------------------------------------------------
// D29-62 (R3, P6): stripMasthead — synthetic node-shape tests, mirroring the
// real corpus samples verified while writing this pass (spell/heal,
// armor/breastplate, ancestry/human).
// ---------------------------------------------------------------------------

function h1(name: string): BlockNode {
  return {
    kind: "heading",
    level: 1,
    children: [{ kind: "text", content: name, marks: NO_MARKS }],
  };
}

const NO_MARKS = { bold: false, italic: false, superscript: false };
const BOLD_MARKS = { bold: true, italic: false, superscript: false };

/** A masthead-shaped line: `**Label** value...`. */
function labelLine(label: string, valueText: string): BlockNode {
  return {
    kind: "paragraph",
    children: [
      { kind: "text", content: label, marks: BOLD_MARKS },
      { kind: "text", content: ` ${valueText}`, marks: NO_MARKS },
    ],
  };
}

function prose(content: string): BlockNode {
  return { kind: "paragraph", children: [{ kind: "text", content, marks: NO_MARKS }] };
}

const divider: BlockNode = { kind: "divider" };

describe("stripMasthead (D29-62)", () => {
  it("spell/heal shape: H1 + Source/Traditions/Bloodline/Range/Target + divider -> 4 non-Source pairs", () => {
    const body: BlockNode[] = [
      h1("Heal"),
      labelLine("Source", "Player Core"),
      labelLine("Traditions", "Divine"),
      labelLine("Bloodline", "Angelic"),
      labelLine("Range", "varies"),
      labelLine("Target", "1 willing living creature"),
      divider,
      prose("You channel vital energy..."),
    ];
    const result = stripMasthead(body);
    expect(result.body).toEqual([prose("You channel vital energy...")]);
    expect(result.mastheadExtra?.map((p) => p.label)).toEqual([
      "Traditions",
      "Bloodline",
      "Range",
      "Target",
    ]);
  });

  it("armor/breastplate shape: 10 labeled lines (incl. Source) + divider -> 9 non-Source pairs", () => {
    const labels = [
      "Source",
      "Price",
      "AC Bonus",
      "Dex Cap",
      "Check Penalty",
      "Speed Penalty",
      "Strength",
      "Bulk",
      "Category",
      "Group",
    ];
    const body: BlockNode[] = [
      h1("Breastplate"),
      ...labels.map((l) => labelLine(l, "x")),
      divider,
      prose("Though referred to as a breastplate..."),
    ];
    const result = stripMasthead(body);
    expect(result.body).toEqual([prose("Though referred to as a breastplate...")]);
    expect(result.mastheadExtra).toHaveLength(9);
    expect(result.mastheadExtra?.[0]?.label).toBe("Price");
    expect(result.mastheadExtra?.map((p) => p.label)).not.toContain("Source");
  });

  it("ancestry/human shape: NO divider at all -> only Source is stripped, prose body survives intact", () => {
    const italicIntro: BlockNode = {
      kind: "paragraph",
      children: [
        { kind: "text", content: "Humans are diverse...", marks: { ...NO_MARKS, italic: true } },
      ],
    };
    const body: BlockNode[] = [
      h1("Human"),
      labelLine("Source", "Player Core"),
      italicIntro,
      prose("As unpredictable and varied..."),
    ];
    const result = stripMasthead(body);
    expect(result.body).toEqual([italicIntro, prose("As unpredictable and varied...")]);
    // Every collected pair was "Source" -> mastheadExtra absent, never [].
    expect(result.mastheadExtra).toBeUndefined();
  });

  it("a doc with no H1 and no bold-label lines at all is a total no-op", () => {
    const body: BlockNode[] = [prose("Just prose."), prose("More prose.")];
    const result = stripMasthead(body);
    expect(result.body).toEqual(body);
    expect(result.mastheadExtra).toBeUndefined();
  });

  it("empty body -> empty body, no throw", () => {
    const result = stripMasthead([]);
    expect(result.body).toEqual([]);
    expect(result.mastheadExtra).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // P10 (D29-92): statRow-aware unwrap. `ritual/shadow-double`'s own raw
  // markdown isn't in the committed unit-fixture raw set (verified:
  // `fixtures/raw/aon` doesn't carry it) — these synthetic cases are built
  // from the census's own description of that doc's pattern (a Bulk/Price-
  // style row inside the masthead run, trailing-whitespace value tail) rather
  // than a fabricated fixture file. `list-continuation-sup.json`'s own
  // masthead walk (the "real docs" describe above) is the one committed
  // fixture whose masthead-consumed run this pass touches at all — it
  // collects zero pairs before ever reaching its statRow, so it's a
  // (necessary but not sufficient) equality-modulo-trim proof; these
  // synthetic cases cover the statRow-specific branches it can't reach.
  // -------------------------------------------------------------------------

  function valueText(value: readonly InlineNode[]): string {
    return value.map((n) => (n.kind === "text" ? n.content : "")).join("");
  }

  it("D29-92: a fully-qualifying statRow inside the masthead run unwraps into pairs, in order", () => {
    const row: BlockNode = {
      kind: "statRow",
      cells: [
        [
          { kind: "text", content: "Str", marks: BOLD_MARKS },
          { kind: "text", content: " +7", marks: NO_MARKS },
        ],
        [
          { kind: "text", content: "Dex", marks: BOLD_MARKS },
          { kind: "text", content: " +5", marks: NO_MARKS },
        ],
      ],
    };
    const body: BlockNode[] = [h1("X"), labelLine("Source", "y"), row, divider, prose("body")];
    const result = stripMasthead(body);
    expect(result.body).toEqual([prose("body")]);
    expect(result.mastheadExtra?.map((p) => p.label)).toEqual(["Str", "Dex"]);
    expect(result.mastheadExtra?.map((p) => valueText(p.value))).toEqual([" +7", " +5"]);
  });

  it("D29-92: a statRow with even one non-qualifying cell stops the walk BEFORE it (whole-row-or-nothing), report-counted (expected 0 real occurrences)", () => {
    const reports: Array<[string, string]> = [];
    const report = (cls: string, detail: string): void => {
      reports.push([cls, detail]);
    };
    const partialRow: BlockNode = {
      kind: "statRow",
      cells: [
        [
          { kind: "text", content: "Str", marks: BOLD_MARKS },
          { kind: "text", content: " +7", marks: NO_MARKS },
        ],
        [{ kind: "text", content: "not bold", marks: NO_MARKS }],
      ],
    };
    const body: BlockNode[] = [h1("X"), labelLine("Source", "y"), partialRow, prose("after")];
    const result = stripMasthead(body, report);
    // The row stays in body WHOLE — nothing is consumed from it, unlike the
    // bold-first-paragraph case, which would never partially consume either
    // (it's all-or-nothing per line already); this is the same posture
    // extended to a row's cells.
    expect(result.body).toEqual([partialRow, prose("after")]);
    expect(result.mastheadExtra).toBeUndefined(); // only Source was ever collected
    expect(reports).toEqual([["mastheadStatRowPartial", "cells=2"]]);
  });

  it("D29-92 trim delta: a statRow-sourced pair's value differs from the pre-P10 paragraph-line convention only by trailing whitespace (accepted — ~155 pairs/151 docs measured, e.g. ritual 99/shield 28/spell 21)", () => {
    // Pre-P10 convention: today's stripMasthead trims the LABEL but never the
    // value run (aonMarkup.ts's own historical note) — trailing whitespace
    // from the source markdown survives verbatim into mastheadExtra.
    const oldBody: BlockNode[] = [
      h1("Shadow Double"),
      labelLine("Source", "x"),
      labelLine("Bulk", "L "),
      divider,
      prose("body"),
    ];
    const oldResult = stripMasthead(oldBody);
    const oldBulk = oldResult.mastheadExtra?.find((p) => p.label === "Bulk");
    expect(oldBulk && valueText(oldBulk.value)).toBe(" L ");

    // P10: the SAME logical pair arriving as an already boundary-trimmed
    // statRow cell (D29-91's trim runs at row-collapse time, upstream of
    // stripMasthead) — only the trailing whitespace is gone.
    const newRow: BlockNode = {
      kind: "statRow",
      cells: [
        [
          { kind: "text", content: "Bulk", marks: BOLD_MARKS },
          { kind: "text", content: " L", marks: NO_MARKS },
        ],
        [
          { kind: "text", content: "Price", marks: BOLD_MARKS },
          { kind: "text", content: " 5 gp", marks: NO_MARKS },
        ],
      ],
    };
    const newBody: BlockNode[] = [
      h1("Shadow Double"),
      labelLine("Source", "x"),
      newRow,
      divider,
      prose("body"),
    ];
    const newResult = stripMasthead(newBody);
    const newBulk = newResult.mastheadExtra?.find((p) => p.label === "Bulk");
    expect(newBulk && valueText(newBulk.value)).toBe(" L");
    expect(oldBulk && valueText(oldBulk.value).trimEnd()).toBe(newBulk && valueText(newBulk.value));
    // Everything else about the strip (which body survives, which labels are
    // collected) is otherwise identical — the trim is the ONLY delta.
    expect(newResult.body).toEqual(oldResult.body);
  });
});
