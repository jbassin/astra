import { describe, expect, it } from "vitest";

import { CodexNodeSchema, parseCodexNode } from "./nodes";
import type { CodexNode, InlineNode } from "./nodes";

const text = (content: string): InlineNode => ({
  kind: "text",
  content,
  marks: { bold: false, italic: false, superscript: false },
});

describe("CodexNode: flat leaf kinds", () => {
  it("round-trips a paragraph of mixed inline nodes", () => {
    const node: CodexNode = {
      kind: "paragraph",
      children: [
        text("You channel vital energy to heal the living. "),
        { kind: "check", type: "fortitude", basic: true },
        { kind: "damage", formula: "1d8[vitality]", display: "1d8 vitality" },
      ],
    };
    expect(parseCodexNode(node)).toEqual(node);
  });

  it("round-trips a heading with the AoN right-annotation meta", () => {
    const node: CodexNode = {
      kind: "heading",
      level: 1,
      children: [text("Heal")],
      meta: "Cantrip 1",
    };
    expect(parseCodexNode(node)).toEqual(node);
  });

  it("round-trips inlineRoll across all three real forms (rollKind, not kind)", () => {
    for (const rollKind of ["r", "br", "gmr"] as const) {
      const node: CodexNode = { kind: "inlineRoll", rollKind, formula: "1d4", label: "rounds" };
      expect(parseCodexNode(node)).toEqual(node);
    }
  });

  it("round-trips inlineAction (the [[/act ...]] form)", () => {
    const node: CodexNode = {
      kind: "inlineAction",
      action: "hide",
      options: { skill: "stealth" },
      label: "Hide",
    };
    expect(parseCodexNode(node)).toEqual(node);
  });

  it("round-trips embed both pre-join (resolved: false) and post-join (resolved: true)", () => {
    const preJoin: CodexNode = {
      kind: "embed",
      target: "Compendium.pf2e.actions.abc123",
      resolved: false,
    };
    const postJoin: CodexNode = {
      kind: "embed",
      target: "action/hide",
      resolved: true,
      display: "Hide",
    };
    expect(parseCodexNode(preJoin)).toEqual(preJoin);
    expect(parseCodexNode(postJoin)).toEqual(postJoin);
  });

  it("round-trips a divider with no extra fields", () => {
    expect(parseCodexNode({ kind: "divider" })).toEqual({ kind: "divider" });
  });

  it("rejects an unknown discriminant kind (the hard-fail posture, D29-6)", () => {
    expect(() => parseCodexNode({ kind: "image", src: "x.png" })).toThrow();
  });

  it("rejects extra fields (every node schema is .strict())", () => {
    expect(() => parseCodexNode({ kind: "divider", extra: true })).toThrow();
  });
});

describe("CodexNode: recursive block kinds", () => {
  it("round-trips a nested list (list-in-list-item, D29-2's 'items = node arrays')", () => {
    const node: CodexNode = {
      kind: "list",
      ordered: false,
      items: [
        [{ kind: "paragraph", children: [text("Outer item")] }],
        [{ kind: "list", ordered: true, items: [[text("Nested item")]] }],
      ],
    };
    expect(parseCodexNode(node)).toEqual(node);
  });

  it("round-trips a table with a header row flag per-row and a caption", () => {
    const node: CodexNode = {
      kind: "table",
      caption: [text("Table 1: Damage by Level")],
      rows: [
        { header: true, cells: [[text("Level")], [text("Damage")]] },
        { header: false, cells: [[text("1")], [text("1d6")]] },
      ],
    };
    expect(parseCodexNode(node)).toEqual(node);
  });

  it("round-trips an aside containing a blockquote containing a paragraph", () => {
    const node: CodexNode = {
      kind: "aside",
      children: [
        {
          kind: "blockquote",
          children: [{ kind: "paragraph", children: [text("Quoted lore.")] }],
        },
      ],
    };
    expect(parseCodexNode(node)).toEqual(node);
  });

  it("CodexNodeSchema.safeParse reports failure without throwing", () => {
    const result = CodexNodeSchema.safeParse({ kind: "paragraph", children: "not an array" });
    expect(result.success).toBe(false);
  });
});
