/**
 * Builders shared by the codex web test files: listing rows, sources-index entries, rules-tree
 * nodes, inline and block nodes, fixture-corpus entity loading and a render context without
 * embeds. Each builder fills the "boring" shape, so a test overrides only what it cares about.
 * Whole-corpus loading lives in `domain/render/fixtureLoader.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CodexEntitySchema,
  type BlockNode,
  type CodexEntity,
  type IndexRow,
  type InlineNode,
  type SourceIndexEntry,
  type TextMarks,
  type TreeNode,
} from "@astra/codex-corpus";
import { defaultParseSearch } from "@tanstack/react-router";

import { noEmbeds, rootRenderCtx, type RenderCtx } from "./domain/render/nodes";
import { fixtureCorpusRoot } from "./server/corpusFs";

/** A listing `IndexRow`: a remaster, not-superseded row from "Test Book" with no traits. */
export function row(overrides: Partial<IndexRow> & Pick<IndexRow, "id" | "name">): IndexRow {
  return {
    traits: [],
    source: { book: "Test Book", license: "unknown" },
    edition: "remaster",
    superseded: false,
    ...overrides,
  };
}

/** A sources-index entry: one remaster spell from "Some Book". */
export function sourceEntry(overrides: Partial<SourceIndexEntry> = {}): SourceIndexEntry {
  return {
    book: "Some Book",
    license: "unknown",
    edition: "remaster",
    entityCount: 1,
    categoryCounts: { spell: 1 },
    ...overrides,
  };
}

/** A rules-tree node with no children. */
export function treeNode(overrides: Partial<TreeNode> & Pick<TreeNode, "name">): TreeNode {
  return { children: [], ...overrides };
}

/** Parses a query string with the router's own parser (which eats a bare `+`). */
export function parseQuery(queryString: string): Record<string, unknown> {
  return defaultParseSearch(queryString);
}

const PLAIN_MARKS: TextMarks = { bold: false, italic: false, superscript: false };

/** A text node, unmarked unless `marks` says otherwise. */
export function text(content: string, marks: Partial<TextMarks> = {}): InlineNode {
  return { kind: "text", content, marks: { ...PLAIN_MARKS, ...marks } };
}

/** Wraps inline content in a paragraph (a body holds only block nodes). */
export function para(...children: InlineNode[]): BlockNode {
  return { kind: "paragraph", children };
}

/** Loads and validates one fixture-corpus entity, e.g. `"creature/balor.json"`. */
export function loadEntity(relPath: string): CodexEntity {
  return CodexEntitySchema.parse(
    JSON.parse(readFileSync(join(fixtureCorpusRoot(), relPath), "utf8")),
  );
}

/** A render context that resolves no embeds and knows no traits. */
export function noEmbedsCtx(): RenderCtx {
  return rootRenderCtx({ resolveEmbed: noEmbeds(), knownTraitIds: new Set() });
}

const LORE_CARD_RE = /<section class="codex-card codex-card-prose codex-lore">[\s\S]*?<\/section>/;

/** The rendered Lore card's markup, or undefined when the page has none. */
export function loreCardHtml(html: string): string | undefined {
  return LORE_CARD_RE.exec(html)?.[0];
}
