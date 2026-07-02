import { parseMarkdown } from "@astra/vellum-lang";
import { describe, expect, test } from "vitest";

import { SIGIL } from "./vellumHighlight";

// R2 (slice 3): the editor's SIGIL regex (vellumHighlight.ts) duplicates vellum-lang's
// surface.ts `desugar` token set — the editor highlights `@2`/`#fire`/`||x||` as "this
// will desugar to a directive". If surface.ts's action list (or the editor's copy)
// drifts, the editor would lie about what renders. This gate ties the two together:
// every sigil the editor highlights must actually be lowered by parseDocument, and a
// non-sigil must be neither highlighted nor lowered.

// The canonical action token set (mirrors surface.ts ACTION + the editor SIGIL). If
// vellum-lang changes its desugar, the parseMarkdown assertions below fail; if the
// editor SIGIL changes, the highlight assertions fail.
const ACTION_TOKENS = [
  "reaction",
  "react",
  "free",
  "single",
  "double",
  "triple",
  "one",
  "two",
  "three",
  "0",
  "1",
  "2",
  "3",
  "r",
  "f",
];

interface AstNode {
  type: string;
  name?: string;
  children?: AstNode[];
}

const DIRECTIVE_TYPES = new Set(["textDirective", "leafDirective", "containerDirective"]);

/** All directive names produced by lowering + parsing `source`. */
function directiveNames(source: string): string[] {
  const names: string[] = [];
  const walk = (node: AstNode) => {
    if (DIRECTIVE_TYPES.has(node.type) && node.name) names.push(node.name);
    if (node.children) for (const child of node.children) walk(child);
  };
  walk(parseMarkdown(source) as unknown as AstNode);
  return names;
}

/** Whether the editor's SIGIL regex highlights `token` (fresh, non-global matcher —
 * SIGIL is /gi and stateful). */
function editorHighlights(token: string): boolean {
  return new RegExp(SIGIL.source, "i").test(token);
}

describe("sigil ↔ desugar sync (R2)", () => {
  test("every action sigil the editor highlights is lowered to an action directive", () => {
    for (const tok of ACTION_TOKENS) {
      const sigil = `@${tok}`;
      expect(editorHighlights(sigil), `editor should highlight ${sigil}`).toBe(true);
      expect(directiveNames(`x ${sigil} y`), `parseDocument should lower ${sigil}`).toContain(
        "action",
      );
    }
  });

  test("the trait sigil lowers to a trait directive", () => {
    expect(editorHighlights("#fire")).toBe(true);
    expect(directiveNames("x #fire y")).toContain("trait");
  });

  test("the redaction sigil lowers to a redact directive", () => {
    expect(editorHighlights("||secret||")).toBe(true);
    expect(directiveNames("x ||secret|| y")).toContain("redact");
  });

  test("a non-sigil @word is neither highlighted nor lowered", () => {
    expect(editorHighlights("@everyone")).toBe(false);
    expect(directiveNames("ping @everyone now")).not.toContain("action");
  });
});
