import type { PhrasingContent, RootContent } from "mdast";

/**
 * Theme axis. mechanical = teal cogitator-dataslate; diegetic = amber Imperial
 * parchment. M1 renders mechanical only; the prop is threaded for M4.
 */
export type ThemeMode = "mechanical" | "diegetic";

/** The fixed document "zoo". `deity` is the divine stat block (a PF2e-style deity
 * profile + devotee benefits); its body is `Term :: value` field-lines, its
 * `{category=…}` brace attribute is the corner tag (and `@deity "…" { … }` in VSS). */
export const DOCUMENT_KINDS = [
  "statblock",
  "hazard",
  "item",
  "spell",
  "deity",
  "handout",
  "edict",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Default theme mode for each kind (mechanical for rules, diegetic for props). */
export const DEFAULT_MODE_BY_KIND: Record<DocumentKind, ThemeMode> = {
  statblock: "mechanical",
  hazard: "mechanical",
  item: "mechanical",
  spell: "mechanical",
  deity: "mechanical",
  handout: "diegetic",
  edict: "diegetic",
};

/**
 * One parsed document block from a `:::kind` directive. `children` is the
 * block's inner markdown content as mdast nodes — the React layer renders it.
 * The model is rules-illiterate: it carries the author's text/attributes
 * verbatim and never evaluates a number.
 */
export interface VellumBlock {
  type: "block";
  kind: DocumentKind;
  /** Directive attributes, e.g. `:::statblock{level=5 rarity=unique}`. */
  attributes: Record<string, string>;
  /** Plain-text label from `:::statblock[Label]` (used for titles/seeds). */
  label?: string;
  /**
   * The label's inline mdast nodes, so a label can carry inline directives —
   * e.g. `:::item[Boots of Speed :action[free]]` renders the action glyph next
   * to the name. Present whenever `label` is; the React layer renders these.
   */
  labelNodes?: PhrasingContent[];
  /** Inner content nodes (prose, lists, inline directives). */
  children: RootContent[];
}

/**
 * A run of loose top-level markdown — headings, lists, prose, blockquotes,
 * etc. — that lives outside any directive. Consecutive loose nodes are grouped
 * into one run so document order (e.g. a heading above some columns) survives.
 */
export interface VellumProse {
  type: "prose";
  /** Loose markdown nodes, rendered verbatim by mdastToReact. */
  children: RootContent[];
}

/**
 * Side-by-side layout from a `:::columns` directive. Each column is itself an
 * ordered list of nodes, so a column can hold prose, `:::kind` blocks, and even
 * nested columns (recursive). Authoring uses nested directive fences — the
 * outer fence needs MORE colons than what it contains (see MARKDOWN.md).
 */
export interface VellumColumns {
  type: "columns";
  /** Directive attributes, e.g. `:::columns{gap=wide}`. */
  attributes: Record<string, string>;
  /** Each entry is one column's ordered node list. */
  columns: VellumNode[][];
}

/**
 * A deity/stat field-list from a `:::fields` block (full-vellum §3.3). Each item
 * is one `Term :: value` line: `term` is the flat text (so akasha can *query* a
 * deity's "Domains"), `value` keeps its inline mdast (links + `[[crossref]]`s).
 */
export interface VellumFields {
  type: "fields";
  items: { term: string; value: PhrasingContent[] }[];
}

/**
 * A timeline from a `:::timeline` block (full-vellum §3.4), replacing the wiki's
 * raw `<ul><li>` HTML. Each entry carries an optional `{marker}` (era/date) and
 * the entry's content as mdast nodes.
 */
export interface VellumTimeline {
  type: "timeline";
  entries: { marker?: string; children: RootContent[] }[];
}

/** A top-level document node: a kind block, a prose run, columns, fields, or a timeline. */
export type VellumNode = VellumBlock | VellumProse | VellumColumns | VellumFields | VellumTimeline;

/**
 * An inline cross-reference parsed from `[[target#heading|alias]]` (full-vellum §3.2).
 * vellum-lang **parses only** — resolution to a URL/entity + the backlink graph is
 * akasha-backend's job (0007). Inserted into mdast phrasing content as a custom node.
 */
export interface CrossRef {
  type: "crossref";
  target: string;
  alias?: string;
  heading?: string;
}

/**
 * Typed, validated YAML frontmatter (full-vellum §3.1). The known keys mirror the
 * wiki's Obsidian frontmatter; anything else is preserved in `extra` (akasha may add
 * `kind`/`folder`/`slug`). The Python extractor produces the identical shape.
 */
export interface Frontmatter {
  title?: string;
  tags: string[];
  aliases: string[];
  img?: string;
  extra: Record<string, unknown>;
}

export interface VellumDocument {
  /** Parsed + validated leading YAML frontmatter (empty defaults when absent). */
  frontmatter: Frontmatter;
  mode: ThemeMode;
  /** Ordered, heterogeneous content: prose, `:::kind` blocks, columns, fields, timelines. */
  nodes: VellumNode[];
}
