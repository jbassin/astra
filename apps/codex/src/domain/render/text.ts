import type { CodexNode } from "../../schema/nodes";

/** Shared tiny text helpers for the render layer (kept dependency-free/pure so
 * every render module — nodes/statblock/facetHeader/traits — can share one
 * definition instead of re-deriving it). */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** `"fooBarBaz"` -> "Foo Bar Baz" — a best-effort humanizer for facet keys
 * whose real display label the corpus doesn't carry (only AoN/Foundry's own
 * internal field name does). A small override table catches the common
 * PF2e-specific acronyms a naive splitter would mangle (`ac` -> "Ac"). */
const KEY_OVERRIDES: Readonly<Record<string, string>> = {
  ac: "AC",
  hp: "HP",
  dc: "DC",
};

export function humanizeFacetKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => KEY_OVERRIDES[w.toLowerCase()] ?? capitalize(w)).join(" ");
}

/** `"reach-15"` -> "Reach 15"; `"creature-ability"` -> "Creature Ability". A plain
 * hyphen-split humanizer (no camelCase boundary handling, unlike
 * `humanizeFacetKey` above — trait tokens and corpus `category` strings are
 * already lowercase-hyphenated, never camelCase) shared by `traits.tsx`
 * (trait-token display names) and S3's category directory/listing pages
 * (category display names) so the two don't drift into two copies of the same
 * five-line function. */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => capitalize(part))
    .join(" ");
}

// ---------------------------------------------------------------------------
// S2: plain-text extraction — the route head/meta `<meta name="description">`
// needs a plain string, not React nodes, so this is a SEPARATE small total
// switch over `CodexNode` (not a reuse of `nodes.tsx`'s `renderNode`, which
// returns `ReactNode` and is keyed for React reconciliation, not string
// concatenation). Pure, total — same "every kind, never throw" posture as the
// renderer.
// ---------------------------------------------------------------------------

function collectNodeText(node: CodexNode): string {
  switch (node.kind) {
    case "text":
      return node.content;
    case "crossref":
    case "brokenRef":
      return node.display;
    case "check":
      return node.label ?? "";
    case "damage":
      return node.label ?? node.display;
    case "inlineRoll":
      return node.label ?? node.formula;
    case "inlineAction":
      return node.label ?? node.action;
    case "template":
      return node.label ?? "";
    case "actionGlyph":
      return "";
    case "embed":
      return node.display ?? "";
    case "localizedBoilerplate":
      return node.children.map(collectNodeText).join("");
    case "paragraph":
    case "heading":
      return node.children.map(collectNodeText).join("");
    case "list":
      return node.items.map((item) => item.map(collectNodeText).join(" ")).join(" ");
    case "table":
      // A table's cell text isn't a natural "description" fragment (D29-26's own
      // `body` prose is what a summary line is for) — deliberately excluded, same
      // as the renderer's own posture of never dumping structural content flat.
      return "";
    case "blockquote":
    case "aside":
      return node.children.map(collectNodeText).join("");
    case "divider":
      return "";
  }
}

/**
 * The route head/meta description (spec S2 bullet: "description from
 * first-paragraph collectText"): plain text of the entity's FIRST top-level
 * `paragraph` node, whitespace-collapsed and length-capped. Returns `""` for a
 * body with no paragraph at all (e.g. an entity whose body opens with a table or
 * list) — the route omits the meta tag rather than render an empty one.
 */
export function firstParagraphSummary(body: readonly CodexNode[], maxLen = 200): string {
  const first = body.find((n) => n.kind === "paragraph");
  if (!first) return "";
  const collapsed = collectNodeText(first).trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen - 1).trimEnd()}…`;
}
