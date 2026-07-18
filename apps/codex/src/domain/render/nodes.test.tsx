import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CodexEntity } from "../../schema/entity";
import type { BlockNode, CodexNode, InlineNode, TextMarks } from "../../schema/nodes";
import { noEmbeds, renderNodes, rootRenderCtx } from "./nodes";

const PLAIN_MARKS: TextMarks = { bold: false, italic: false, superscript: false };

function text(content: string, marks: Partial<TextMarks> = {}): InlineNode {
  return { kind: "text", content, marks: { ...PLAIN_MARKS, ...marks } };
}

/** Wraps inline content in a `paragraph` — `CodexEntity.body` is `BlockNode[]`,
 * so a bare `text`/`embed` node can't sit at the top level of a body. */
function para(...children: InlineNode[]): BlockNode {
  return { kind: "paragraph", children };
}

function baseCtx(overrides: Partial<Parameters<typeof rootRenderCtx>[0]> = {}) {
  return rootRenderCtx({ resolveEmbed: noEmbeds(), knownTraitIds: new Set(), ...overrides });
}

function html(nodes: CodexNode[], ctx = baseCtx()): string {
  return renderToStaticMarkup(<>{renderNodes(nodes, ctx)}</>);
}

/** A minimal `CodexEntity` for embed-resolution fixtures — shared by the B2
 * paragraph-wrapper guard tests and the D29-25 embed-inlining tests below. */
function makeEntity(id: string, body: BlockNode[]): CodexEntity {
  const [category, slug] = id.split("/") as [string, string];
  return {
    id,
    slug,
    category,
    name: `Name(${id})`,
    edition: "remaster",
    source: { book: "Test Book", license: "ORC" },
    traits: [],
    body,
    facets: {},
  };
}

describe("nodes.tsx: per-kind totality (D29-24)", () => {
  it("text: plain / bold / italic / superscript / combined", () => {
    expect(html([text("plain")])).toBe("plain");
    expect(html([text("b", { bold: true })])).toBe("<strong>b</strong>");
    expect(html([text("i", { italic: true })])).toBe("<em>i</em>");
    expect(html([text("s", { superscript: true })])).toBe("<sup>s</sup>");
    expect(html([text("all", { bold: true, italic: true, superscript: true })])).toBe(
      "<strong><em><sup>all</sup></em></strong>",
    );
  });

  it("paragraph: plain inline children wrap in <p>", () => {
    const out = html([{ kind: "paragraph", children: [text("hi")] }]);
    expect(out).toBe("<p>hi</p>");
  });

  it("heading: level + optional right-annotation meta", () => {
    const out = html([{ kind: "heading", level: 2, children: [text("Title")], meta: "Spell 3" }]);
    expect(out).toContain("<h2");
    expect(out).toContain("Title");
    expect(out).toContain('class="codex-heading-meta"');
    expect(out).toContain("Spell 3");
  });

  it("heading: level clamps into h1..h6", () => {
    const out = html([{ kind: "heading", level: 9, children: [text("x")] }]);
    expect(out.startsWith("<h6")).toBe(true);
  });

  it("list: ordered/unordered with nested-array items", () => {
    const ul = html([{ kind: "list", ordered: false, items: [[text("a")], [text("b")]] }]);
    expect(ul).toBe("<ul><li>a</li><li>b</li></ul>");
    const ol = html([{ kind: "list", ordered: true, items: [[text("a")]] }]);
    expect(ol).toBe("<ol><li>a</li></ol>");
  });

  it("table: header vs body rows, optional caption", () => {
    const out = html([
      {
        kind: "table",
        caption: [text("Cap")],
        rows: [
          { header: true, cells: [[text("H1")], [text("H2")]] },
          { header: false, cells: [[text("d1")], [text("d2")]] },
        ],
      },
    ]);
    expect(out).toContain("<caption>Cap</caption>");
    expect(out).toContain("<th>H1</th>");
    expect(out).toContain("<td>d1</td>");
  });

  it("blockquote: synthetic-only (corpus-extinct), still rendered", () => {
    const out = html([{ kind: "blockquote", children: [text("quoted")] }]);
    expect(out).toBe("<blockquote>quoted</blockquote>");
  });

  it("divider: <hr>", () => {
    expect(html([{ kind: "divider" }])).toBe("<hr/>");
  });

  it("aside: inset codex-card (renamed from the gothic card class, P4.5 S1)", () => {
    const out = html([{ kind: "aside", children: [text("note")] }]);
    expect(out).toContain("codex-card");
    expect(out).toContain("codex-card-inset");
    expect(out).toContain("note");
  });

  it("crossref: a link to /{targetId} carrying data-crossref", () => {
    const out = html([{ kind: "crossref", targetId: "spell/heal", display: "Heal" }]);
    expect(out).toBe(
      '<a href="/spell/heal" data-crossref="" data-crossref-target="spell/heal">Heal</a>',
    );
  });

  it("brokenRef: plain span, NEVER a link (D29-2)", () => {
    const out = html([{ kind: "brokenRef", target: "spell/gone", display: "Gone Spell" }]);
    expect(out).not.toContain("<a ");
    expect(out).toContain("Gone Spell");
    expect(out).toContain("data-broken-ref");
  });

  it("check: DC + type, basic annotation, label override", () => {
    expect(html([{ kind: "check", type: "intimidation", dc: 26 }])).toContain("DC 26 Intimidation");
    expect(html([{ kind: "check", type: "reflex", dc: 20, basic: true }])).toContain(
      "DC 20 Reflex (basic)",
    );
    expect(html([{ kind: "check", type: "will", label: "Custom" }])).toContain("Custom");
  });

  it("damage: dice-styled span, label overrides display", () => {
    const out = html([{ kind: "damage", formula: "1d6[fire]", display: "1d6 fire" }]);
    expect(out).toContain("1d6 fire");
    const labeled = html([
      { kind: "damage", formula: "1d6[fire]", display: "1d6 fire", label: "per level" },
    ]);
    expect(labeled).toContain("per level");
  });

  it("inlineRoll: formula or label", () => {
    expect(html([{ kind: "inlineRoll", rollKind: "r", formula: "1d20+5" }])).toContain("1d20+5");
    expect(
      html([{ kind: "inlineRoll", rollKind: "gmr", formula: "1d100", label: "Secret roll" }]),
    ).toContain("Secret roll");
  });

  it("inlineAction: a cost-mapped slug gets the CORRECT glyph for its own actionCost", () => {
    // grapple -> single action (◆)
    const single = html([{ kind: "inlineAction", action: "grapple" }]);
    expect(single).toContain("Grapple");
    expect(single).toContain('aria-label="one action"');
    // pick-a-lock -> TWO actions, not one
    const two = html([{ kind: "inlineAction", action: "pick-a-lock" }]);
    expect(two).toContain("Pick A Lock");
    expect(two).toContain('aria-label="two actions"');
    // grab-an-edge -> a REACTION glyph, not an action count
    const reaction = html([{ kind: "inlineAction", action: "grab-an-edge" }]);
    expect(reaction).toContain("Grab An Edge");
    expect(reaction).toContain('aria-label="reaction"');
  });

  it("inlineAction: passive/costless/unknown slugs take the plain-label path (no glyph)", () => {
    // track is actionCost "passive" (an exploration activity) — glyphless by design
    const passive = html([{ kind: "inlineAction", action: "track" }]);
    expect(passive).toContain("Track");
    expect(passive).not.toContain("<svg");
    // disable-device's action entity carries NO actionCost facet — also glyphless
    const costless = html([{ kind: "inlineAction", action: "disable-device" }]);
    expect(costless).toContain("Disable Device");
    expect(costless).not.toContain("<svg");
    // an unrecognized future slug falls back the same way
    const unknown = html([{ kind: "inlineAction", action: "some-future-macro" }]);
    expect(unknown).toContain("Some Future Macro");
    expect(unknown).not.toContain("<svg");
  });

  it("template: '{distance}-foot {shape}' text, label overrides", () => {
    expect(html([{ kind: "template", shape: "cone", distance: 15 }])).toContain("15-foot cone");
    expect(
      html([{ kind: "template", shape: "emanation", distance: 10, label: "10-foot radius" }]),
    ).toContain("10-foot radius");
  });

  it("actionGlyph: renders via the B1 shim (see actionGlyph.test.ts for the vocabulary)", () => {
    const out = html([{ kind: "actionGlyph", cost: "Single Action" }]);
    expect(out).toContain("svg"); // ActionGlyph is an <svg>, not the ErrorChip fallback
  });

  it("localizedBoilerplate: renders its children in place", () => {
    const out = html([
      { kind: "localizedBoilerplate", sourceKey: "PF2E.Foo", children: [text("resolved text")] },
    ]);
    expect(out).toBe("resolved text");
  });

  it("unknown kind: never throws, renders a visible ErrorChip carrying data-render-error", () => {
    const bogus = { kind: "somethingNotInTheUnion" } as unknown as CodexNode;
    let out = "";
    expect(() => {
      out = html([bogus]);
    }).not.toThrow();
    expect(out).toContain("data-render-error");
    expect(out).toContain("somethingNotInTheUnion");
  });
});

describe("nodes.tsx: B2 adversarial — paragraph-carrying-block-children guard", () => {
  it("a paragraph whose ONLY child is a block-carrying localizedBoilerplate renders <div>, not nested <p>", () => {
    // The exact real shape (trimmed) from `creature/adamantine-dragon-adult`'s
    // "Grab" ability body: an outer `paragraph` whose sole child is a
    // `localizedBoilerplate` carrying a `paragraph` + a `divider`.
    const boilerplateParagraph: CodexNode = {
      kind: "paragraph",
      children: [
        {
          kind: "localizedBoilerplate",
          sourceKey: "PF2E.NPC.Abilities.Glossary.Grab",
          children: [
            { kind: "paragraph", children: [text("Requirements ...")] },
            { kind: "divider" },
            { kind: "paragraph", children: [text("Effect ...")] },
          ],
        },
      ],
    };
    const out = html([boilerplateParagraph]);
    expect(out.startsWith("<div")).toBe(true);
    expect(out).not.toContain("<p><p");
    expect(out).toContain("<p>Requirements ...</p>");
    expect(out).toContain("<hr/>");
    expect(out).toContain("<p>Effect ...</p>");
  });

  it("a plain paragraph (no localizedBoilerplate) still renders <p>", () => {
    expect(html([{ kind: "paragraph", children: [text("plain")] }])).toBe("<p>plain</p>");
  });

  it("a paragraph carrying a RESOLVED depth-0 embed renders <div>, not <p><div>...</div></p> (S5 real-corpus find, `creature/red-dragon-adult`)", () => {
    // The exact real shape: a paragraph of prose text with an inline `embed`
    // to a `creature-family` entry — the embed resolves and inlines a block
    // `codex-embed-card` div (D29-25), which a naive `<p>` wrapper cannot
    // legally contain (a hydration mismatch: the browser silently closes the
    // `<p>` early, diverging from React's expected tree).
    const family = makeEntity("creature-family/dragon-red", [para(text("Family lore"))]);
    const resolver = (id: string) => (id === family.id ? family : undefined);
    const ctx = baseCtx({ resolveEmbed: resolver });
    const out = html(
      [
        {
          kind: "paragraph",
          children: [
            text("This dragon is a member of the "),
            { kind: "embed", target: family.id, resolved: true, display: "Red Dragon" },
            text(" family."),
          ],
        },
      ],
      ctx,
    );
    expect(out.startsWith("<div")).toBe(true);
    expect(out).not.toContain("<p><div");
    expect(out).not.toMatch(/<p[^>]*>[^<]*<div/);
    expect(out).toContain("codex-embed-card");
    expect(out).toContain("Family lore");
  });

  it("a paragraph carrying an UNRESOLVED or depth>0 embed still renders <p> (no false-positive block promotion)", () => {
    const out1 = html([
      {
        kind: "paragraph",
        children: [
          text("See "),
          { kind: "embed", target: "creature-family/missing", resolved: false, display: "Ghost" },
        ],
      },
    ]);
    expect(out1.startsWith("<p")).toBe(true);

    // depth > 0: an embed's own body paragraph references another embed —
    // that inner embed always degrades to an inline link (D29-25 depth cap),
    // so its containing paragraph must stay <p>.
    const c = makeEntity("action/c", [para(text("C body"))]);
    const b = makeEntity("action/b", [
      para(text("B body "), { kind: "embed", target: c.id, resolved: true, display: "See C" }),
    ]);
    const resolver = (id: string) => ({ [b.id]: b, [c.id]: c })[id];
    const ctx = baseCtx({ resolveEmbed: resolver });
    const out2 = html([{ kind: "embed", target: b.id, resolved: true, display: "See B" }], ctx);
    expect(out2).toContain("<p>B body");
  });

  it("a localizedBoilerplate carrying only inline content keeps <p>", () => {
    const out = html([
      {
        kind: "paragraph",
        children: [
          { kind: "localizedBoilerplate", sourceKey: "PF2E.Foo", children: [text("inline only")] },
        ],
      },
    ]);
    expect(out).toBe("<p>inline only</p>");
  });
});

describe("nodes.tsx: statRow (P10, D29-91/-93/-94)", () => {
  it("renders one codex-stat-line div wrapping one codex-stat-line-cell span per cell", () => {
    const node: CodexNode = {
      kind: "statRow",
      cells: [
        [text("Str +7")],
        [text("Dex +5")],
        [text("Con +5")],
        [text("Int +3")],
        [text("Wis +7")],
        [text("Cha +5")],
      ],
    };
    const out = html([node]);
    expect(out).toBe(
      '<div class="codex-stat-line">' +
        '<span class="codex-stat-line-cell">Str +7</span>' +
        '<span class="codex-stat-line-cell">Dex +5</span>' +
        '<span class="codex-stat-line-cell">Con +5</span>' +
        '<span class="codex-stat-line-cell">Int +3</span>' +
        '<span class="codex-stat-line-cell">Wis +7</span>' +
        '<span class="codex-stat-line-cell">Cha +5</span>' +
        "</div>",
    );
  });

  it("does not use codex-stat-row — that class belongs to the structured statblock", () => {
    const node: CodexNode = { kind: "statRow", cells: [[text("HP 260")], [text("AC 32")]] };
    expect(html([node])).not.toContain("codex-stat-row");
  });

  it("a cell containing crossref inline content still renders inline (real cell composition: text + crossref only)", () => {
    const node: CodexNode = {
      kind: "statRow",
      cells: [
        [text("Perception ")],
        [{ kind: "crossref", targetId: "action/seek", display: "+25" }],
      ],
    };
    const out = html([node]);
    expect(out).toContain('<span class="codex-stat-line-cell">Perception </span>');
    expect(out).toContain(
      '<span class="codex-stat-line-cell"><a href="/action/seek" data-crossref="" data-crossref-target="action/seek">+25</a></span>',
    );
  });

  it("block-cell guard: a cell whose inline would block-render (resolved depth-0 embed) renders that cell as a <div>, not a <span>", () => {
    const family = makeEntity("creature-family/dragon-red", [para(text("Family lore"))]);
    const resolver = (id: string) => (id === family.id ? family : undefined);
    const ctx = baseCtx({ resolveEmbed: resolver });
    const node: CodexNode = {
      kind: "statRow",
      cells: [
        [{ kind: "embed", target: family.id, resolved: true, display: "Red Dragon" }],
        [text("HP 260")],
      ],
    };
    const out = html([node], ctx);
    expect(out).toContain('<div class="codex-stat-line-cell">');
    expect(out).not.toContain('<span class="codex-stat-line-cell"><div');
    expect(out).toContain("codex-embed-card");
    expect(out).toContain('<span class="codex-stat-line-cell">HP 260</span>');
  });
});

describe("nodes.tsx: D29-25 embed inlining, depth 1, cycle-guarded", () => {
  it("a resolved top-level embed inlines the target's body, framed with a source link", () => {
    const target = makeEntity("action/pursue-a-lead", [para(text("Pursue body"))]);
    const resolver = (id: string) => (id === target.id ? target : undefined);
    const ctx = baseCtx({ resolveEmbed: resolver });
    const out = html(
      [{ kind: "embed", target: target.id, resolved: true, display: "Pursue a Lead" }],
      ctx,
    );
    expect(out).toContain("codex-embed-card");
    expect(out).toContain("Pursue body");
    expect(out).toContain(`href="/${target.id}"`);
  });

  it("an embed inside an ALREADY-inlined body renders as a link, not a second inline expansion (M7)", () => {
    // A -> embeds B; B's own body -> embeds C. Rendering A's page should
    // inline B (depth 1) but the B->C embed must degrade to a link only.
    const c = makeEntity("action/c", [para(text("C body"))]);
    const b = makeEntity("action/b", [
      para(text("B body "), { kind: "embed", target: c.id, resolved: true, display: "See C" }),
    ]);
    const resolver = (id: string) => ({ [b.id]: b, [c.id]: c })[id];
    const ctx = baseCtx({ resolveEmbed: resolver });
    const out = html([{ kind: "embed", target: b.id, resolved: true, display: "See B" }], ctx);
    expect(out).toContain("B body");
    // C's body text must NOT have been inlined a second level deep:
    expect(out).not.toContain("C body");
    // ...but a link to C is present (crossref-style, per D29-25):
    expect(out).toContain(`href="/${c.id}"`);
    expect(out).toContain("See C");
  });

  it("a self-referencing embed (cycle) does not recurse forever", () => {
    const selfId = "action/self";
    const a: CodexEntity = makeEntity(selfId, [
      para(text("Self body "), { kind: "embed", target: selfId, resolved: true, display: "Self" }),
    ]);
    const resolver = (id: string) => (id === a.id ? a : undefined);
    const ctx = baseCtx({ resolveEmbed: resolver });
    let out = "";
    expect(() => {
      out = html([{ kind: "embed", target: a.id, resolved: true, display: "Self" }], ctx);
    }).not.toThrow();
    // The FIRST hop inlines `a`'s body, whose own self-embed then degrades to
    // a link (depth cap) rather than recursing again.
    expect(out).toContain("codex-embed-card");
    expect((out.match(/codex-embed-card/g) ?? []).length).toBe(1);
  });

  it("an unresolved embed renders as plain text of display, never a link", () => {
    const out = html([
      { kind: "embed", target: "action/missing", resolved: false, display: "Ghost" },
    ]);
    expect(out).not.toContain("<a ");
    expect(out).toContain("Ghost");
    expect(out).toContain("data-embed-unresolved");
  });

  it("resolved:true but the injected resolver has no data degrades the same as unresolved", () => {
    const out = html(
      [{ kind: "embed", target: "action/missing", resolved: true, display: "Ghost" }],
      baseCtx(),
    );
    expect(out).not.toContain("<a ");
    expect(out).toContain("Ghost");
  });
});
